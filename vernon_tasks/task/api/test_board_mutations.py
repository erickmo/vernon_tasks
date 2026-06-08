"""Tests for the project-board mutations (move / create / patch).

Covers the PDCA state-machine contract enforced by the VT Item Task controller:
legal vs illegal drags, the orthogonal Blocked flag, completion stamping on
Done, quick-add column rules, inline-edit allow-list, and project-level authz.

VT Item tree migration: Project / Task are `node_type` values on the single
VT Item nested-set tree. A Task lives under its Project (or a Sprint) via
parent_vt_item — the legacy VT Task.project / VT Project Link fields are gone.
Field renames: assigned_to → owner_user (the API/response key stays
``assigned_to``), project_leader → leader_user, done phase DONE → CLOSED.
kanban_status is derived from pdca_phase by the controller; only "Blocked" is
set directly. The board endpoints read back the renamed node field owner_user.
"""

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, today

from vernon_tasks.task.api.board_mutations import (
    bulk_assign,
    create_task,
    get_task,
    move_task,
    patch_task,
    update_task,
)
from vernon_tasks.task.api.dashboard import project_board

# VT Item doctype + the renamed assignee field the board now writes to.
ITEM = "VT Item"
OWNER_FIELD = "owner_user"
PROJ_TITLE = "TEST-BOARD-PROJ"
PROJ2_TITLE = "TEST-BOARD-PROJ-2"
BRAND = "TEST-BOARD-BRAND"


def _cleanup_projects():
    # NestedSet blocks deleting a parent before its children. Deleting a node
    # rebalances lft/rgt, so a one-shot bounds snapshot goes stale mid-loop;
    # instead re-query each project's remaining descendants deepest-first until
    # none remain, then drop the root.
    for proj in frappe.get_all(
        ITEM,
        {"title": ["in", [PROJ_TITLE, PROJ2_TITLE]], "node_type": "Project"},
        ["name"],
    ):
        while True:
            bounds = frappe.db.get_value(
                ITEM, proj["name"], ["lft", "rgt"], as_dict=True
            )
            if not bounds:
                break
            descendants = frappe.get_all(
                ITEM,
                filters={"lft": [">", bounds.lft], "rgt": ["<", bounds.rgt]},
                fields=["name"],
                order_by="lft desc",
                limit=1,
            )
            if not descendants:
                frappe.delete_doc(ITEM, proj["name"], force=True)
                break
            frappe.delete_doc(ITEM, descendants[0]["name"], force=True)


class TestBoardMutations(FrappeTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.leader = "board_leader@test.local"
        cls.member = "board_member@test.local"
        cls.outsider = "board_outsider@test.local"
        for u in (cls.leader, cls.member, cls.outsider):
            if not frappe.db.exists("User", u):
                frappe.get_doc({
                    "doctype": "User", "email": u, "first_name": u,
                    "roles": [{"role": "VT Member"}],
                }).insert(ignore_permissions=True)
        if not frappe.db.exists("VT Brand", BRAND):
            frappe.get_doc({"doctype": "VT Brand", "brand_name": BRAND}).insert(
                ignore_permissions=True
            )
        _cleanup_projects()
        # Project / team membership now live on the VT Item tree: leader_user is
        # the renamed project_leader; Project Team Member is a child table on the
        # Project node (parenttype 'VT Item'). project name is auto-assigned; the
        # marker title is used only by _cleanup_projects to find the fixtures.
        proj = frappe.get_doc({
            "doctype": ITEM,
            "node_type": "Project",
            "title": PROJ_TITLE,
            "brand": BRAND,
            "owner_user": "Administrator",
            "leader_user": cls.leader,
            "health_status": "Open",
            "start_date": today(),
            "end_date": add_days(today(), 30),
            "team_members": [{"user": cls.member, "role": "Member"}],
        })
        proj.insert(ignore_permissions=True)
        cls.project = proj.name

    @classmethod
    def tearDownClass(cls):
        frappe.set_user("Administrator")
        _cleanup_projects()
        super().tearDownClass()

    def tearDown(self):
        frappe.set_user("Administrator")

    def _make_task(self, title="T"):
        # A Task node lives under the Project via parent_vt_item; kanban_status is
        # controller-derived from pdca_phase (defaults BACKLOG). ignore_links so
        # the seed needs no owner/links.
        doc = frappe.get_doc({
            "doctype": ITEM, "node_type": "Task", "title": title,
            "parent_vt_item": self.project,
        })
        doc.flags.ignore_links = True
        return doc.insert(ignore_permissions=True)

    def _walk_to_in_review(self, name):
        """Advance a fresh Backlog task to In Review (CHECK) via legal moves."""
        for col in ("Scheduled", "In Progress", "In Review"):
            move_task(name, col)

    # ── move: legality ───────────────────────────────────────────────
    def test_legal_move_advances_status(self):
        frappe.set_user(self.leader)
        t = self._make_task()
        r = move_task(t.name, "Scheduled")
        self.assertEqual(r["kanban_status"], "Scheduled")
        self.assertEqual(frappe.db.get_value(ITEM, t.name, "pdca_phase"), "PLAN")

    def test_illegal_move_rejected(self):
        frappe.set_user(self.leader)
        t = self._make_task()
        with self.assertRaises(frappe.ValidationError):
            move_task(t.name, "Done")  # BACKLOG → CLOSED is not a legal transition

    def test_invalid_column_rejected(self):
        frappe.set_user(self.leader)
        t = self._make_task()
        with self.assertRaises(frappe.ValidationError):
            move_task(t.name, "Nonsense")

    # ── move: Blocked flag (orthogonal) ──────────────────────────────
    def test_block_then_unblock_restores_phase_column(self):
        frappe.set_user(self.leader)
        t = self._make_task()
        move_task(t.name, "Scheduled")          # phase PLAN
        move_task(t.name, "Blocked")
        self.assertEqual(frappe.db.get_value(ITEM, t.name, "kanban_status"), "Blocked")
        # phase is preserved while blocked
        self.assertEqual(frappe.db.get_value(ITEM, t.name, "pdca_phase"), "PLAN")
        # un-block snaps back to the real phase column regardless of drop target
        r = move_task(t.name, "In Progress")
        self.assertEqual(r["kanban_status"], "Scheduled")

    # ── move: Done stamps completion ─────────────────────────────────
    def test_move_to_done_stamps_completion(self):
        frappe.set_user(self.leader)
        t = self._make_task()
        self._walk_to_in_review(t.name)
        r = move_task(t.name, "Done")
        self.assertEqual(r["kanban_status"], "Done")
        self.assertEqual(str(frappe.db.get_value(ITEM, t.name, "completion_date")), today())

    # ── create ───────────────────────────────────────────────────────
    def test_create_in_column_sets_phase(self):
        frappe.set_user(self.leader)
        r = create_task(self.project, "New backlog item", "Backlog")
        self.assertTrue(r["ok"])
        self.assertEqual(frappe.db.get_value(ITEM, r["task_id"], "pdca_phase"), "BACKLOG")

    def test_create_rejects_blocked_and_done(self):
        frappe.set_user(self.leader)
        for col in ("Blocked", "Done"):
            with self.assertRaises(frappe.ValidationError):
                create_task(self.project, "x", col)

    # ── patch ────────────────────────────────────────────────────────
    def test_patch_allowed_field(self):
        frappe.set_user(self.leader)
        t = self._make_task()
        patch_task(t.name, "priority", "High")
        self.assertEqual(frappe.db.get_value(ITEM, t.name, "priority"), "High")

    def test_patch_disallowed_field_rejected(self):
        frappe.set_user(self.leader)
        t = self._make_task()
        with self.assertRaises(frappe.ValidationError):
            patch_task(t.name, "weight", "999")

    def test_patch_assignee_must_be_team_member(self):
        frappe.set_user(self.leader)
        t = self._make_task()
        patch_task(t.name, "assigned_to", self.member)  # member → ok
        self.assertEqual(frappe.db.get_value(ITEM, t.name, OWNER_FIELD), self.member)
        with self.assertRaises(frappe.ValidationError):
            patch_task(t.name, "assigned_to", self.outsider)

    # ── update_task (multi-field modal save) ─────────────────────────
    def test_update_multiple_fields(self):
        frappe.set_user(self.leader)
        t = self._make_task()
        update_task(t.name, {"title": "Renamed", "priority": "High",
                             "deadline": add_days(today(), 5)})
        row = frappe.db.get_value(
            ITEM, t.name, ["title", "priority", "deadline"], as_dict=True)
        self.assertEqual(row.title, "Renamed")
        self.assertEqual(row.priority, "High")
        self.assertEqual(str(row.deadline), add_days(today(), 5))

    def test_update_accepts_json_string(self):
        frappe.set_user(self.leader)
        t = self._make_task()
        update_task(t.name, '{"priority": "Low"}')  # frontend sends JSON string
        self.assertEqual(frappe.db.get_value(ITEM, t.name, "priority"), "Low")

    def test_update_assignee_must_be_team_member(self):
        frappe.set_user(self.leader)
        t = self._make_task()
        with self.assertRaises(frappe.ValidationError):
            update_task(t.name, {"assigned_to": self.outsider})

    def test_update_rejects_mass_assignment(self):
        frappe.set_user(self.leader)
        t = self._make_task()
        # kanban_status / pdca_phase stay reachable only via move_task; project is
        # a tree relation (parent_vt_item) and must not be smuggled in here.
        for field in ("kanban_status", "pdca_phase", "project", "parent_vt_item"):
            with self.assertRaises(frappe.ValidationError):
                update_task(t.name, {field: "X"})

    # ── create with prefilled fields (create modal) ──────────────────
    def test_create_with_values(self):
        frappe.set_user(self.leader)
        r = create_task(self.project, "Detailed item", "Backlog",
                        {"priority": "Critical", "deadline": add_days(today(), 3)})
        row = frappe.db.get_value(
            ITEM, r["task_id"], ["priority", "deadline", "pdca_phase"], as_dict=True)
        self.assertEqual(row.priority, "Critical")
        self.assertEqual(str(row.deadline), add_days(today(), 3))
        self.assertEqual(row.pdca_phase, "BACKLOG")

    # ── update_task: full editable field set ─────────────────────────
    def test_update_extended_scalar_fields(self):
        """The modal now saves the full editable scalar set in one call."""
        frappe.set_user(self.leader)
        t = self._make_task()
        # risk_flag is server-computed (read_only, surfaced by risk_evaluator)
        # and is intentionally excluded from EDITABLE_FIELDS — do not set it here.
        update_task(t.name, {
            "estimated_minutes": 8,
            "review_estimated_minutes": 2,
            "review_scheduled_date": add_days(today(), 4),
            "weight": 3,
        })
        row = frappe.db.get_value(
            ITEM, t.name,
            ["estimated_minutes", "review_estimated_minutes",
             "review_scheduled_date", "weight"],
            as_dict=True)
        self.assertEqual(row.estimated_minutes, 8)
        self.assertEqual(row.review_estimated_minutes, 2)
        self.assertEqual(str(row.review_scheduled_date), add_days(today(), 4))
        self.assertEqual(row.weight, 3)

    def test_empty_weight_preserves_default(self):
        """An empty weight in the payload must not null the doctype default (1)."""
        frappe.set_user(self.leader)
        t = self._make_task()
        update_task(t.name, {"priority": "High", "weight": ""})
        self.assertEqual(frappe.db.get_value(ITEM, t.name, "weight"), 1)

    def test_override_fields_leader_only(self):
        """leader_override_points/override_reason are governance fields.

        A plain team member may not set them; the project leader may.
        """
        frappe.set_user(self.leader)
        t = self._make_task()
        frappe.set_user(self.member)
        with self.assertRaises(frappe.ValidationError):
            update_task(t.name, {"leader_override_points": 5,
                                 "override_reason": "bonus"})
        frappe.set_user(self.leader)
        update_task(t.name, {"leader_override_points": 5,
                             "override_reason": "bonus"})
        self.assertEqual(
            frappe.db.get_value(ITEM, t.name, "leader_override_points"), 5)

    def test_update_recurring_without_rule_rejected(self):
        """is_recurring passes the allow-list; controller still demands a rule."""
        frappe.set_user(self.leader)
        t = self._make_task()
        with self.assertRaises(frappe.ValidationError):
            update_task(t.name, {"is_recurring": 1})

    def test_update_dependencies_table(self):
        """Child-table fields (dependencies) are settable from the modal."""
        frappe.set_user(self.leader)
        blocker = self._make_task("Blocker")
        t = self._make_task("Dependent")
        update_task(t.name, {"dependencies": [
            {"blocked_by": blocker.name, "dependency_type": "Finish-to-Start"}]})
        doc = frappe.get_doc(ITEM, t.name)
        self.assertEqual(len(doc.dependencies), 1)
        self.assertEqual(doc.dependencies[0].blocked_by, blocker.name)

    # ── get_task (edit-modal hydration) ──────────────────────────────
    def test_get_task_returns_full_field_set(self):
        frappe.set_user(self.leader)
        t = self._make_task("Hydrate")
        # risk_flag is server-computed (read_only) — set only the editable fields.
        update_task(t.name, {"estimated_minutes": 4})
        data = get_task(t.name)
        self.assertEqual(data["title"], "Hydrate")
        self.assertEqual(data["estimated_minutes"], 4)
        # risk_flag is read-only (surfaced by risk_evaluator); it is not part of
        # GET_TASK_SCALAR_FIELDS so the edit modal does not include it.
        self.assertNotIn("risk_flag", data)
        # assignee is surfaced under the legacy response key, sourced from owner_user.
        self.assertIn("assigned_to", data)
        self.assertIn("dependencies", data)
        self.assertIn("schedule_entries", data)

    def test_get_task_denied_for_outsider(self):
        frappe.set_user(self.leader)
        t = self._make_task()
        frappe.set_user(self.outsider)
        with self.assertRaises(frappe.PermissionError):
            get_task(t.name)

    # ── board read ───────────────────────────────────────────────────
    def _columns(self, board):
        return {c["key"]: c for c in board["columns"]}

    def test_board_groups_and_allowed_targets(self):
        frappe.set_user(self.leader)
        t = self._make_task("BoardCard")
        board = project_board(self.project)
        cols = self._columns(board)
        self.assertEqual([c["key"] for c in board["columns"]][-1], "Blocked")
        card = next(c for c in cols["Backlog"]["tasks"] if c["id"] == t.name)
        # Backlog → Scheduled (legal) + Blocked
        self.assertEqual(set(card["allowed_targets"]), {"Scheduled", "Blocked"})

    def test_board_done_card_locked(self):
        frappe.set_user(self.leader)
        t = self._make_task()
        self._walk_to_in_review(t.name)
        move_task(t.name, "Done")
        cols = self._columns(project_board(self.project))
        card = next(c for c in cols["Done"]["tasks"] if c["id"] == t.name)
        self.assertEqual(card["allowed_targets"], [])

    def test_board_access_denied_for_outsider(self):
        frappe.set_user(self.outsider)
        with self.assertRaises(frappe.PermissionError):
            project_board(self.project)

    # ── authz ────────────────────────────────────────────────────────
    def test_outsider_forbidden(self):
        frappe.set_user(self.leader)
        t = self._make_task()
        frappe.set_user(self.outsider)
        with self.assertRaises(frappe.PermissionError):
            move_task(t.name, "Scheduled")

    # ── bulk_assign (Fokus feed batch triage) ────────────────────────
    def test_bulk_assign_sets_all(self):
        frappe.set_user(self.leader)
        t1 = self._make_task("bulk1")
        t2 = self._make_task("bulk2")
        r = bulk_assign(self.project, [t1.name, t2.name], self.member)
        self.assertTrue(r["ok"])
        self.assertEqual(frappe.db.get_value(ITEM, t1.name, OWNER_FIELD), self.member)
        self.assertEqual(frappe.db.get_value(ITEM, t2.name, OWNER_FIELD), self.member)

    def test_bulk_assign_accepts_json_string_ids(self):
        # frappe.call serializes the list to a JSON string over HTTP.
        frappe.set_user(self.leader)
        t = self._make_task("bulkjson")
        bulk_assign(self.project, frappe.as_json([t.name]), self.member)
        self.assertEqual(frappe.db.get_value(ITEM, t.name, OWNER_FIELD), self.member)

    def test_bulk_assign_rejects_non_team_assignee(self):
        frappe.set_user(self.leader)
        t = self._make_task("bulk3")
        with self.assertRaises(frappe.ValidationError):
            bulk_assign(self.project, [t.name], self.outsider)

    def test_bulk_assign_rejects_outsider_caller(self):
        frappe.set_user(self.leader)
        t = self._make_task("bulk4")
        frappe.set_user(self.outsider)
        with self.assertRaises(frappe.PermissionError):
            bulk_assign(self.project, [t.name], self.member)

    def test_bulk_assign_rejects_task_from_other_project(self):
        # A task whose project != the passed project_id must be rejected even if
        # the caller can access both projects (cross-project smuggling guard).
        other = frappe.get_doc({
            "doctype": ITEM, "node_type": "Project", "title": PROJ2_TITLE,
            "brand": BRAND, "owner_user": "Administrator",
            "leader_user": self.leader, "health_status": "Open",
            "start_date": today(), "end_date": add_days(today(), 30),
        })
        other.insert(ignore_permissions=True)
        other_task = frappe.get_doc({
            "doctype": ITEM, "node_type": "Task", "title": "x",
            "parent_vt_item": other.name,
        })
        other_task.flags.ignore_links = True
        other_task.insert(ignore_permissions=True)
        frappe.set_user(self.leader)
        with self.assertRaises(frappe.ValidationError):
            bulk_assign(self.project, [other_task.name], self.member)

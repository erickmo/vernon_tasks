"""Tests for the project-board mutations (move / create / patch).

Covers the PDCA state-machine contract enforced by the VT Task controller:
legal vs illegal drags, the orthogonal Blocked flag, completion stamping on
Done, quick-add column rules, inline-edit allow-list, and project-level authz.
"""
import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, today

from vernon_tasks.task.api.board_mutations import (
    create_task,
    move_task,
    patch_task,
    update_task,
)
from vernon_tasks.task.api.dashboard import project_board

PROJ = "TEST-BOARD-PROJ"


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
        brand = "TEST-BOARD-BRAND"
        if not frappe.db.exists("VT Brand", brand):
            frappe.get_doc({"doctype": "VT Brand", "brand_name": brand}).insert(
                ignore_permissions=True
            )
        if not frappe.db.exists("VT Project", PROJ):
            proj = frappe.get_doc({
                "doctype": "VT Project",
                "name": PROJ,
                "title": "Board Test Project",
                "brand": brand,
                "project_owner": "Administrator",
                "project_leader": cls.leader,
                "start_date": today(),
                "end_date": add_days(today(), 30),
                "team_members": [{"user": cls.member, "role": "Member"}],
            })
            proj.flags.name_set = True
            proj.insert(ignore_permissions=True)

    def tearDown(self):
        frappe.set_user("Administrator")

    def _make_task(self, title="T"):
        doc = frappe.get_doc({
            "doctype": "VT Task", "title": title, "project": PROJ,
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
        self.assertEqual(frappe.db.get_value("VT Task", t.name, "pdca_phase"), "PLAN")

    def test_illegal_move_rejected(self):
        frappe.set_user(self.leader)
        t = self._make_task()
        with self.assertRaises(frappe.ValidationError):
            move_task(t.name, "Done")  # BACKLOG → DONE is not a legal transition

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
        self.assertEqual(frappe.db.get_value("VT Task", t.name, "kanban_status"), "Blocked")
        # phase is preserved while blocked
        self.assertEqual(frappe.db.get_value("VT Task", t.name, "pdca_phase"), "PLAN")
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
        self.assertEqual(str(frappe.db.get_value("VT Task", t.name, "completion_date")), today())

    # ── create ───────────────────────────────────────────────────────
    def test_create_in_column_sets_phase(self):
        frappe.set_user(self.leader)
        r = create_task(PROJ, "New backlog item", "Backlog")
        self.assertTrue(r["ok"])
        self.assertEqual(frappe.db.get_value("VT Task", r["task_id"], "pdca_phase"), "BACKLOG")

    def test_create_rejects_blocked_and_done(self):
        frappe.set_user(self.leader)
        for col in ("Blocked", "Done"):
            with self.assertRaises(frappe.ValidationError):
                create_task(PROJ, "x", col)

    # ── patch ────────────────────────────────────────────────────────
    def test_patch_allowed_field(self):
        frappe.set_user(self.leader)
        t = self._make_task()
        patch_task(t.name, "priority", "High")
        self.assertEqual(frappe.db.get_value("VT Task", t.name, "priority"), "High")

    def test_patch_disallowed_field_rejected(self):
        frappe.set_user(self.leader)
        t = self._make_task()
        with self.assertRaises(frappe.ValidationError):
            patch_task(t.name, "weight", "999")

    def test_patch_assignee_must_be_team_member(self):
        frappe.set_user(self.leader)
        t = self._make_task()
        patch_task(t.name, "assigned_to", self.member)  # member → ok
        self.assertEqual(frappe.db.get_value("VT Task", t.name, "assigned_to"), self.member)
        with self.assertRaises(frappe.ValidationError):
            patch_task(t.name, "assigned_to", self.outsider)

    # ── update_task (multi-field modal save) ─────────────────────────
    def test_update_multiple_fields(self):
        frappe.set_user(self.leader)
        t = self._make_task()
        update_task(t.name, {"title": "Renamed", "priority": "High",
                             "deadline": add_days(today(), 5)})
        row = frappe.db.get_value(
            "VT Task", t.name, ["title", "priority", "deadline"], as_dict=True)
        self.assertEqual(row.title, "Renamed")
        self.assertEqual(row.priority, "High")
        self.assertEqual(str(row.deadline), add_days(today(), 5))

    def test_update_accepts_json_string(self):
        frappe.set_user(self.leader)
        t = self._make_task()
        update_task(t.name, '{"priority": "Low"}')  # frontend sends JSON string
        self.assertEqual(frappe.db.get_value("VT Task", t.name, "priority"), "Low")

    def test_update_assignee_must_be_team_member(self):
        frappe.set_user(self.leader)
        t = self._make_task()
        with self.assertRaises(frappe.ValidationError):
            update_task(t.name, {"assigned_to": self.outsider})

    def test_update_rejects_mass_assignment(self):
        frappe.set_user(self.leader)
        t = self._make_task()
        for field in ("kanban_status", "pdca_phase", "project"):
            with self.assertRaises(frappe.ValidationError):
                update_task(t.name, {field: "X"})

    # ── create with prefilled fields (create modal) ──────────────────
    def test_create_with_values(self):
        frappe.set_user(self.leader)
        r = create_task(PROJ, "Detailed item", "Backlog",
                        {"priority": "Critical", "deadline": add_days(today(), 3)})
        row = frappe.db.get_value(
            "VT Task", r["task_id"], ["priority", "deadline", "pdca_phase"], as_dict=True)
        self.assertEqual(row.priority, "Critical")
        self.assertEqual(str(row.deadline), add_days(today(), 3))
        self.assertEqual(row.pdca_phase, "BACKLOG")

    # ── board read ───────────────────────────────────────────────────
    def _columns(self, board):
        return {c["key"]: c for c in board["columns"]}

    def test_board_groups_and_allowed_targets(self):
        frappe.set_user(self.leader)
        t = self._make_task("BoardCard")
        board = project_board(PROJ)
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
        cols = self._columns(project_board(PROJ))
        card = next(c for c in cols["Done"]["tasks"] if c["id"] == t.name)
        self.assertEqual(card["allowed_targets"], [])

    def test_board_access_denied_for_outsider(self):
        frappe.set_user(self.outsider)
        with self.assertRaises(frappe.PermissionError):
            project_board(PROJ)

    # ── authz ────────────────────────────────────────────────────────
    def test_outsider_forbidden(self):
        frappe.set_user(self.leader)
        t = self._make_task()
        frappe.set_user(self.outsider)
        with self.assertRaises(frappe.PermissionError):
            move_task(t.name, "Scheduled")

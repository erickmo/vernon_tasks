import frappe
import unittest
from datetime import date, timedelta
from frappe.utils import getdate, today as frappe_today
from vernon_tasks.api.sprints import list_sprints


def _today():
    return getdate(frappe_today())


class _SprintFixturesMixin:
    @classmethod
    def _ensure_project(cls, title="Test Proj P3.2 v2", start=None, end=None):
        if start is None:
            start = date(2026, 1, 1)
        if end is None:
            end = date(2026, 12, 31)
        if not frappe.db.exists("VT Project", {"title": title}):
            return frappe.get_doc({
                "doctype": "VT Project",
                "title": title,
                "project_owner": "Administrator",
                "project_leader": "Administrator",
                "start_date": start,
                "end_date": end,
                "status": "On Track",
                "pdca_phase": "DO",
            }).insert(ignore_permissions=True).name
        return frappe.db.get_value("VT Project", {"title": title}, "name")

    @classmethod
    def _ensure_sprint(cls, project, title, start, end, status="Planning"):
        existing = frappe.db.exists("VT Sprint", {"sprint_title": title, "project": project})
        if existing:
            return existing
        return frappe.get_doc({
            "doctype": "VT Sprint",
            "sprint_title": title,
            "project": project,
            "start_date": start,
            "end_date": end,
            "status": status,
            "goal": "",
        }).insert(ignore_permissions=True).name


class TestListSprints(unittest.TestCase, _SprintFixturesMixin):
    @classmethod
    def setUpClass(cls):
        cls.project = cls._ensure_project()
        cls._ensure_sprint(cls.project, "S1 P3.2", date(2026, 5, 1), date(2026, 5, 14), "Closed")
        cls._ensure_sprint(cls.project, "S2 P3.2", date(2026, 5, 15), date(2026, 5, 28), "Active")

    def test_returns_sprints_for_project(self):
        rows = list_sprints(self.project)
        titles = {r["sprint_title"] for r in rows}
        self.assertIn("S1 P3.2", titles)
        self.assertIn("S2 P3.2", titles)

    def test_status_filter(self):
        rows = list_sprints(self.project, {"statuses": ["Active"]})
        titles = {r["sprint_title"] for r in rows}
        self.assertIn("S2 P3.2", titles)
        self.assertNotIn("S1 P3.2", titles)

    def test_includes_task_count_and_hours(self):
        rows = list_sprints(self.project)
        for r in rows:
            self.assertIn("task_count", r)
            self.assertIn("open_hours", r)
            self.assertIn("completed_hours", r)


class TestGetSprintWithRelations(unittest.TestCase, _SprintFixturesMixin):
    @classmethod
    def setUpClass(cls):
        cls.project = cls._ensure_project()
        cls.sprint = cls._ensure_sprint(cls.project, "S-detail", date(2026, 5, 1), date(2026, 5, 14), "Active")
        if not frappe.db.exists("VT Task", {"title": "T1 detail", "sprint": cls.sprint}):
            frappe.get_doc({
                "doctype": "VT Task",
                "title": "T1 detail",
                "project": cls.project,
                "sprint": cls.sprint,
                "kanban_status": "In Progress",
                "pdca_phase": "DO",
                "estimated_hours": 4,
                "weight": 1,
            }).insert(ignore_permissions=True)

    def test_returns_sprint_project_and_tasks(self):
        from vernon_tasks.api.sprints import get_sprint_with_relations
        out = get_sprint_with_relations(self.sprint)
        self.assertEqual(out["sprint"]["name"], self.sprint)
        self.assertEqual(out["project_summary"]["name"], self.project)
        titles = {t["title"] for t in out["tasks"]}
        self.assertIn("T1 detail", titles)

    def test_lazy_populates_rank(self):
        from vernon_tasks.api.sprints import get_sprint_with_relations
        frappe.db.sql("UPDATE `tabVT Task` SET kanban_rank = NULL WHERE sprint = %s", (self.sprint,))
        out = get_sprint_with_relations(self.sprint)
        for t in out["tasks"]:
            self.assertIsNotNone(t["kanban_rank"])


class TestSprintCrud(unittest.TestCase, _SprintFixturesMixin):
    @classmethod
    def setUpClass(cls):
        cls.project = cls._ensure_project()

    def test_create_sprint_returns_name(self):
        from vernon_tasks.api.sprints import create_sprint
        out = create_sprint({
            "sprint_title": "S-create",
            "project": self.project,
            "start_date": "2026-06-01",
            "end_date": "2026-06-14",
            "status": "Planning",
            "goal": "Test goal",
        })
        self.assertTrue(out["name"].startswith("SP-"))
        self.assertEqual(frappe.db.get_value("VT Sprint", out["name"], "sprint_title"), "S-create")

    def test_create_rejects_end_before_start(self):
        from vernon_tasks.api.sprints import create_sprint
        with self.assertRaises(frappe.ValidationError):
            create_sprint({
                "sprint_title": "S-bad",
                "project": self.project,
                "start_date": "2026-06-14",
                "end_date": "2026-06-01",
                "status": "Planning",
            })

    def test_update_sprint_changes_status(self):
        from vernon_tasks.api.sprints import create_sprint, update_sprint
        created = create_sprint({
            "sprint_title": "S-update",
            "project": self.project,
            "start_date": "2026-07-01",
            "end_date": "2026-07-14",
            "status": "Planning",
        })
        update_sprint(created["name"], {"status": "Active"})
        self.assertEqual(frappe.db.get_value("VT Sprint", created["name"], "status"), "Active")


class TestBulkUpdateSprints(unittest.TestCase, _SprintFixturesMixin):
    @classmethod
    def setUpClass(cls):
        cls.project = cls._ensure_project()
        cls.s_a = cls._ensure_sprint(cls.project, "Bulk-A", date(2026, 8, 1), date(2026, 8, 7), "Planning")
        cls.s_b = cls._ensure_sprint(cls.project, "Bulk-B", date(2026, 8, 8), date(2026, 8, 14), "Planning")

    def test_bulk_set_status(self):
        from vernon_tasks.api.sprints import bulk_update_sprints
        res = bulk_update_sprints([self.s_a, self.s_b], {"status": "Active"})
        self.assertEqual(len(res["updated"]), 2)
        self.assertEqual(frappe.db.get_value("VT Sprint", self.s_a, "status"), "Active")

    def test_bulk_skips_invalid_status(self):
        from vernon_tasks.api.sprints import bulk_update_sprints
        res = bulk_update_sprints([self.s_a], {"status": "Bogus"})
        self.assertEqual(res["updated"], [])
        self.assertEqual(res["skipped"][0]["reason"], "invalid_status")


class TestMoveTask(unittest.TestCase, _SprintFixturesMixin):
    @classmethod
    def setUpClass(cls):
        cls.project = cls._ensure_project()
        cls.sprint = cls._ensure_sprint(cls.project, "S-move", date(2026, 9, 1), date(2026, 9, 14), "Active")
        # Start at PLAN so PLAN → DO transition is allowed by VT Task PDCA rules.
        cls.task = frappe.get_doc({
            "doctype": "VT Task",
            "title": "T-move",
            "project": cls.project,
            "sprint": cls.sprint,
            "assigned_to": "Administrator",
            "pdca_phase": "PLAN",
            "estimated_hours": 2,
            "kanban_rank": 1000.0,
        }).insert(ignore_permissions=True)

    def test_move_changes_kanban_status_and_rank(self):
        from vernon_tasks.api.sprints import move_task
        out = move_task(self.task.name, kanban_status="In Progress", kanban_rank=2500.0)
        # kanban_status auto-derives from pdca_phase=DO → "In Progress".
        self.assertEqual(out["kanban_status"], "In Progress")
        self.assertEqual(out["pdca_phase"], "DO")
        self.assertEqual(out["kanban_rank"], 2500.0)

    def test_move_through_check_to_done_sets_completion_date(self):
        from vernon_tasks.api.sprints import move_task
        # Need valid PDCA chain: DO → CHECK → DONE.
        move_task(self.task.name, kanban_status="In Review")  # CHECK
        move_task(self.task.name, kanban_status="Done")        # DONE
        completion = frappe.db.get_value("VT Task", self.task.name, "completion_date")
        self.assertIsNotNone(completion)


class TestRebalanceColumn(unittest.TestCase, _SprintFixturesMixin):
    @classmethod
    def setUpClass(cls):
        cls.project = cls._ensure_project()
        cls.sprint = cls._ensure_sprint(cls.project, "S-rebal", date(2026, 9, 15), date(2026, 9, 28), "Active")
        # pdca_phase=DO derives kanban_status="In Progress" via VT Task auto-sync.
        cls.t1 = frappe.get_doc({
            "doctype": "VT Task", "title": "R1", "project": cls.project, "sprint": cls.sprint,
            "pdca_phase": "DO", "kanban_rank": 100.0,
        }).insert(ignore_permissions=True).name
        cls.t2 = frappe.get_doc({
            "doctype": "VT Task", "title": "R2", "project": cls.project, "sprint": cls.sprint,
            "pdca_phase": "DO", "kanban_rank": 100.00005,
        }).insert(ignore_permissions=True).name

    def test_rebalance_sets_clean_ranks(self):
        from vernon_tasks.api.sprints import rebalance_column
        rebalance_column(self.sprint, "kanban_status", "In Progress")
        ranks = frappe.db.sql(
            "SELECT kanban_rank FROM `tabVT Task` WHERE sprint=%s AND kanban_status='In Progress' ORDER BY kanban_rank",
            (self.sprint,),
            as_dict=True,
        )
        values = [r["kanban_rank"] for r in ranks]
        self.assertEqual(values, [1000.0, 2000.0])


class TestBurndown(unittest.TestCase, _SprintFixturesMixin):
    @classmethod
    def setUpClass(cls):
        # Anchor sprint dates around real today so burndown's `min(today, end_date)` yields ≥1 day.
        # Use unique title with today's date suffix to avoid collision across test runs across project ranges.
        today_d = _today()
        cls.project = cls._ensure_project(title=f"Test Proj P3.2 burn {today_d}",
                                          start=today_d - timedelta(days=10),
                                          end=today_d + timedelta(days=10))
        cls.sprint = cls._ensure_sprint(cls.project, "S-burn",
                                        today_d - timedelta(days=3),
                                        today_d + timedelta(days=3),
                                        "Active")
        for i in range(3):
            frappe.get_doc({
                "doctype": "VT Task",
                "title": f"B{i}",
                "project": cls.project,
                "sprint": cls.sprint,
                "kanban_status": "Backlog",
                "estimated_hours": 4,
            }).insert(ignore_permissions=True)

    def test_series_length_matches_date_range(self):
        from vernon_tasks.api.sprints import get_sprint_burndown
        out = get_sprint_burndown(self.sprint)
        self.assertGreaterEqual(len(out["series"]), 1)
        self.assertEqual(out["total_hours"], 12)

    def test_ideal_starts_at_total(self):
        from vernon_tasks.api.sprints import get_sprint_burndown
        # Bust burndown cache because previous test stored a sub-snapshot.
        frappe.cache().delete_value(f"burndown:{self.sprint}")
        out = get_sprint_burndown(self.sprint)
        self.assertEqual(out["series"][0]["ideal"], 12.0)


class TestMoveTaskPerms(unittest.TestCase, _SprintFixturesMixin):
    @classmethod
    def setUpClass(cls):
        cls.project = cls._ensure_project()
        cls.sprint = cls._ensure_sprint(cls.project, "S-perm", date(2026, 11, 1), date(2026, 11, 14), "Active")
        for email, role in [("leader@example.com", "VT Leader"), ("mem1@example.com", "VT Member"), ("mem2@example.com", "VT Member")]:
            if not frappe.db.exists("User", email):
                u = frappe.get_doc({
                    "doctype": "User", "email": email, "first_name": email,
                    "send_welcome_email": 0, "enabled": 1,
                }).insert(ignore_permissions=True)
                u.add_roles(role)
        # Start at PLAN so PLAN → DO transition is allowed for own-task member test.
        if not frappe.db.exists("VT Task", {"title": "T-mem1", "sprint": cls.sprint}):
            cls.task_mem1 = frappe.get_doc({
                "doctype": "VT Task", "title": "T-mem1", "project": cls.project, "sprint": cls.sprint,
                "assigned_to": "mem1@example.com", "pdca_phase": "PLAN",
            }).insert(ignore_permissions=True).name
        else:
            cls.task_mem1 = frappe.db.get_value("VT Task", {"title": "T-mem1", "sprint": cls.sprint}, "name")

    def test_member_can_move_own_task(self):
        from vernon_tasks.api.sprints import move_task
        frappe.set_user("mem1@example.com")
        try:
            res = move_task(self.task_mem1, kanban_status="In Progress")
            self.assertEqual(res["kanban_status"], "In Progress")
        finally:
            frappe.set_user("Administrator")

    def test_member_cannot_move_other_task(self):
        from vernon_tasks.api.sprints import move_task
        frappe.set_user("mem2@example.com")
        try:
            with self.assertRaises(frappe.PermissionError):
                # Done is leader-only AND not own task — should deny on perm.
                move_task(self.task_mem1, kanban_status="In Review")
        finally:
            frappe.set_user("Administrator")

    def test_member_cannot_mark_done_even_on_own_task(self):
        from vernon_tasks.api.sprints import move_task
        # Advance own task to CHECK first as leader to prepare for member Done attempt.
        frappe.set_user("Administrator")
        move_task(self.task_mem1, kanban_status="In Review")
        frappe.set_user("mem1@example.com")
        try:
            with self.assertRaises(frappe.PermissionError):
                move_task(self.task_mem1, kanban_status="Done")
        finally:
            frappe.set_user("Administrator")

    def test_leader_can_move_any_task(self):
        from vernon_tasks.api.sprints import move_task
        frappe.set_user("leader@example.com")
        try:
            # Task is currently CHECK from previous test (test order within class is alphabetical).
            res = move_task(self.task_mem1, kanban_status="Done")
            self.assertEqual(res["kanban_status"], "Done")
        finally:
            frappe.set_user("Administrator")

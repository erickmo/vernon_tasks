import frappe
import unittest
from datetime import date
from vernon_tasks.api.sprints import list_sprints


class _SprintFixturesMixin:
    @classmethod
    def _ensure_project(cls, title="Test Proj P3.2"):
        if not frappe.db.exists("VT Project", {"title": title}):
            return frappe.get_doc({
                "doctype": "VT Project",
                "title": title,
                "project_owner": "Administrator",
                "project_leader": "Administrator",
                "start_date": date(2026, 4, 1),
                "end_date": date(2026, 6, 30),
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
        cls.task = frappe.get_doc({
            "doctype": "VT Task",
            "title": "T-move",
            "project": cls.project,
            "sprint": cls.sprint,
            "assigned_to": "Administrator",
            "kanban_status": "Backlog",
            "pdca_phase": "PLAN",
            "estimated_hours": 2,
            "kanban_rank": 1000.0,
        }).insert(ignore_permissions=True)

    def test_move_changes_kanban_status_and_rank(self):
        from vernon_tasks.api.sprints import move_task
        out = move_task(self.task.name, kanban_status="In Progress", kanban_rank=2500.0)
        self.assertEqual(out["kanban_status"], "In Progress")
        self.assertEqual(out["kanban_rank"], 2500.0)

    def test_move_to_done_sets_completion_date(self):
        from vernon_tasks.api.sprints import move_task
        move_task(self.task.name, kanban_status="Done")
        completion = frappe.db.get_value("VT Task", self.task.name, "completion_date")
        self.assertIsNotNone(completion)

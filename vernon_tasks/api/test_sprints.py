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

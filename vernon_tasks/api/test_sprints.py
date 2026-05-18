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

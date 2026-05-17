import frappe
import unittest
from datetime import date
from vernon_tasks.api.projects import list_projects, get_project_with_relations


class TestListProjects(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not frappe.db.exists("VT Project", {"title": "Test Proj P3"}):
            frappe.get_doc({
                "doctype": "VT Project",
                "title": "Test Proj P3",
                "project_owner": "Administrator",
                "project_leader": "Administrator",
                "start_date": date(2026, 4, 1),
                "end_date": date(2026, 6, 30),
                "status": "On Track",
                "pdca_phase": "DO",
            }).insert(ignore_permissions=True)

    def test_empty_filters_returns_all(self):
        result = list_projects({})
        self.assertIsInstance(result, list)
        self.assertGreater(len(result), 0)
        first = result[0]
        for k in ("name", "title", "project_owner", "project_leader",
                  "start_date", "end_date", "status", "pdca_phase",
                  "objective", "linked_objective_title",
                  "team_count", "milestone_count", "sprint_count", "modified"):
            self.assertIn(k, first)

    def test_date_range_filter(self):
        result = list_projects({"period_start": "2026-04-01", "period_end": "2026-06-30"})
        titles = [r["title"] for r in result]
        self.assertIn("Test Proj P3", titles)

    def test_status_filter(self):
        result = list_projects({"statuses": ["Closed"]})
        for r in result:
            self.assertEqual(r["status"], "Closed")


class TestGetProjectWithRelations(unittest.TestCase):
    def test_returns_project_summary_and_counts(self):
        existing = frappe.get_all("VT Project", filters={"title": "Test Proj P3"}, limit=1)
        self.assertTrue(existing)
        name = existing[0]["name"]
        result = get_project_with_relations(name)
        self.assertIn("project", result)
        self.assertIn("linked_objective_summary", result)
        self.assertIn("counts", result)
        self.assertEqual(result["project"]["name"], name)
        c = result["counts"]
        for k in ("team_members", "milestones", "sprints", "documentation"):
            self.assertIn(k, c)
        # No objective linked → summary None
        self.assertIsNone(result["linked_objective_summary"])

    def test_unknown_raises(self):
        with self.assertRaises(frappe.DoesNotExistError):
            get_project_with_relations("NONEXISTENT-PROJ")

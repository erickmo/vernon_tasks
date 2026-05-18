import frappe
import unittest
from datetime import date
from vernon_tasks.api.projects import (
    list_projects,
    get_project_with_relations,
    bulk_update_projects,
)


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


class TestBulkUpdateProjects(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.names = []
        seed = [
            ("PDCA test P PLAN", "On Track", "PLAN"),
            ("PDCA test P DO", "On Track", "DO"),
            ("PDCA test P CLOSED", "Closed", "CLOSED"),
        ]
        for title, status, phase in seed:
            existing = frappe.db.exists("VT Project", {"title": title})
            if existing:
                # Reset state for idempotent reruns
                frappe.db.set_value("VT Project", existing, "status", status)
                frappe.db.set_value("VT Project", existing, "pdca_phase", phase)
                name = existing
            else:
                doc = frappe.get_doc({
                    "doctype": "VT Project",
                    "title": title,
                    "project_owner": "Administrator",
                    "project_leader": "Administrator",
                    "start_date": "2026-04-01",
                    "end_date": "2026-06-30",
                    "status": status,
                    "pdca_phase": phase,
                }).insert(ignore_permissions=True)
                name = doc.name
            cls.names.append((name, phase))
        frappe.db.commit()

    def test_advances_pdca_and_skips_closed(self):
        names = [n for n, _ in self.names]
        result = bulk_update_projects(names, {"pdca_phase": "__next__"})
        self.assertIn("updated", result)
        self.assertIn("skipped", result)
        skipped_names = [s["name"] for s in result["skipped"]]
        closed_name = next(n for n, p in self.names if p == "CLOSED")
        self.assertIn(closed_name, skipped_names)
        plan_name = next(n for n, p in self.names if p == "PLAN")
        self.assertEqual(frappe.db.get_value("VT Project", plan_name, "pdca_phase"), "DO")

    def test_set_status(self):
        plan_name = next(n for n, p in self.names if p == "PLAN")
        result = bulk_update_projects([plan_name], {"status": "At Risk"})
        self.assertEqual(result["updated"][0]["name"], plan_name)
        self.assertEqual(frappe.db.get_value("VT Project", plan_name, "status"), "At Risk")

import frappe
import unittest
from datetime import date
from vernon_tasks.api.okr import list_objectives


class TestListObjectives(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not frappe.db.exists("Objective", {"title": "Test OKR 2026-Q2"}):
            frappe.get_doc({
                "doctype": "Objective",
                "title": "Test OKR 2026-Q2",
                "period": "2026-Q2",
                "period_start": date(2026, 4, 1),
                "period_end": date(2026, 6, 30),
                "objective_owner": "Administrator",
                "status": "Open",
                "pdca_phase": "PLAN",
            }).insert(ignore_permissions=True)

    def test_empty_filters_returns_all(self):
        result = list_objectives({})
        self.assertIsInstance(result, list)
        self.assertGreater(len(result), 0)
        first = result[0]
        for k in ("name", "title", "period", "period_start", "period_end",
                  "objective_owner", "status", "pdca_phase", "progress_avg"):
            self.assertIn(k, first)

    def test_date_range_filter(self):
        result = list_objectives({"period_start": "2026-04-01", "period_end": "2026-06-30"})
        titles = [r["title"] for r in result]
        self.assertIn("Test OKR 2026-Q2", titles)

    def test_status_filter_excludes(self):
        result = list_objectives({"statuses": ["Closed"]})
        for r in result:
            self.assertEqual(r["status"], "Closed")

import frappe
import unittest
from datetime import date
from vernon_tasks.api.okr import list_objectives, get_objective_with_krs, bulk_advance_pdca


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


class TestGetObjectiveWithKrs(unittest.TestCase):
    def test_returns_objective_and_kr_list(self):
        existing = frappe.get_all("Objective", filters={"title": "Test OKR 2026-Q2"}, limit=1)
        self.assertTrue(existing, "Seed objective missing — run TestListObjectives.setUpClass first")
        name = existing[0]["name"]
        result = get_objective_with_krs(name)
        self.assertIn("objective", result)
        self.assertIn("key_results", result)
        self.assertEqual(result["objective"]["name"], name)
        self.assertIsInstance(result["key_results"], list)

    def test_unknown_raises(self):
        with self.assertRaises(frappe.DoesNotExistError):
            get_objective_with_krs("NONEXISTENT-OBJ")


class TestBulkAdvancePdca(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.names = []
        for phase in ("PLAN", "DO", "CLOSED"):
            doc = frappe.get_doc({
                "doctype": "Objective",
                "title": f"PDCA test {phase}",
                "period": "2026-Q3",
                "objective_owner": "Administrator",
                "status": "Open",
                "pdca_phase": phase,
            }).insert(ignore_permissions=True)
            cls.names.append((doc.name, phase))

    def test_advances_and_skips_closed(self):
        names = [n for n, _ in self.names]
        result = bulk_advance_pdca(names)
        self.assertIn("advanced", result)
        self.assertIn("skipped", result)
        skipped_names = [s["name"] for s in result["skipped"]]
        closed_name = next(n for n, p in self.names if p == "CLOSED")
        self.assertIn(closed_name, skipped_names)
        plan_name = next(n for n, p in self.names if p == "PLAN")
        self.assertEqual(frappe.db.get_value("Objective", plan_name, "pdca_phase"), "DO")

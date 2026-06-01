"""Tests for vt-okr page API: list_objectives, update_key_result."""
import frappe
import unittest
from frappe.utils import today, add_months


class TestOkrAPI(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        frappe.set_user("Administrator")
        cls._objectives = []
        cls._key_results = []

    @classmethod
    def tearDownClass(cls):
        for kr in cls._key_results:
            if frappe.db.exists("Key Result", kr):
                frappe.delete_doc("Key Result", kr, force=True)
        for obj in cls._objectives:
            if frappe.db.exists("Objective", obj):
                frappe.delete_doc("Objective", obj, force=True)
        frappe.db.commit()

    def _make_objective(self, title="Test OKR Obj", period="2026-Q2"):
        doc = frappe.get_doc({
            "doctype": "Objective",
            "title": title,
            "period": period,
            "period_start": today(),
            "period_end": add_months(today(), 3),
            "objective_owner": "Administrator",
            "status": "Open",
            "pdca_phase": "DO",
        }).insert(ignore_permissions=True)
        self.__class__._objectives.append(doc.name)
        return doc

    def _make_key_result(self, objective_name, metric="Revenue", target=100.0, current=0.0):
        doc = frappe.get_doc({
            "doctype": "Key Result",
            "objective": objective_name,
            "metric": metric,
            "target_value": target,
            "current_value": current,
            "unit": "IDR",
            "progress_percent": (current / target * 100) if target else 0,
            "confidence": 50.0,
        }).insert(ignore_permissions=True)
        self.__class__._key_results.append(doc.name)
        return doc

    def test_list_objectives_includes_key_results(self):
        """list_objectives returns each objective with its key_results array."""
        obj = self._make_objective("OKR Test 1", "2026-Q2")
        self._make_key_result(obj.name, "Revenue", 200.0, 50.0)

        from vernon_tasks.task.page.vt_okr.vt_okr import list_objectives
        result = list_objectives()

        found = [o for o in result if o["name"] == obj.name]
        self.assertEqual(len(found), 1)
        self.assertIn("key_results", found[0])
        self.assertEqual(len(found[0]["key_results"]), 1)

    def test_list_objectives_computes_avg_progress(self):
        """avg_progress is mean of KR progress_percent values."""
        obj = self._make_objective("OKR Avg Test", "2026-Q2")
        self._make_key_result(obj.name, "KR1", 100.0, 40.0)  # 40%
        self._make_key_result(obj.name, "KR2", 100.0, 60.0)  # 60%

        from vernon_tasks.task.page.vt_okr.vt_okr import list_objectives
        result = list_objectives()
        found = next((o for o in result if o["name"] == obj.name), None)
        self.assertIsNotNone(found)
        self.assertAlmostEqual(found["avg_progress"], 50.0, places=1)

    def test_update_key_result_recalculates_progress(self):
        """update_key_result sets current_value and recalculates progress_percent."""
        obj = self._make_objective("OKR Update Test", "2026-Q3")
        kr = self._make_key_result(obj.name, "Units", 200.0, 0.0)

        from vernon_tasks.task.page.vt_okr.vt_okr import update_key_result
        result = update_key_result(kr.name, current_value=100.0)

        self.assertAlmostEqual(result["progress_percent"], 50.0, places=1)
        self.assertAlmostEqual(result["current_value"], 100.0, places=1)

    def test_update_key_result_caps_progress_at_100(self):
        """Progress cannot exceed 100% even when current > target."""
        obj = self._make_objective("OKR Cap Test", "2026-Q3")
        kr = self._make_key_result(obj.name, "Sales", 100.0, 0.0)

        from vernon_tasks.task.page.vt_okr.vt_okr import update_key_result
        result = update_key_result(kr.name, current_value=150.0)

        self.assertEqual(result["progress_percent"], 100.0)

    def test_list_objectives_filters_by_period(self):
        """period filter returns only matching objectives."""
        obj_a = self._make_objective("Period Q2", "2026-Q2")
        obj_b = self._make_objective("Period Q4", "2026-Q4")

        from vernon_tasks.task.page.vt_okr.vt_okr import list_objectives
        result = list_objectives(period="2026-Q4")
        names = [o["name"] for o in result]

        self.assertIn(obj_b.name, names)
        self.assertNotIn(obj_a.name, names)

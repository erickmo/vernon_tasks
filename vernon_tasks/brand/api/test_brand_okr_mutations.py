import frappe
from frappe.tests.utils import FrappeTestCase

from vernon_tasks.brand.api import brand_okr_mutations as m

TEST_BRAND = "TestBrandMut-Q"


class TestBrandOkrMutations(FrappeTestCase):
    def setUp(self):
        frappe.set_user("Administrator")
        self._cleanup()
        frappe.get_doc({"doctype": "VT Brand", "brand_name": TEST_BRAND}).insert(
            ignore_permissions=True)

    def tearDown(self):
        self._cleanup()

    def _cleanup(self):
        for obj in frappe.get_all("Objective", filters={"brand": TEST_BRAND}):
            for kr in frappe.get_all("Key Result", filters={"objective": obj.name}):
                frappe.delete_doc("Key Result", kr.name, force=True, ignore_permissions=True)
            frappe.delete_doc("Objective", obj.name, force=True, ignore_permissions=True)
        if frappe.db.exists("VT Brand", TEST_BRAND):
            frappe.delete_doc("VT Brand", TEST_BRAND, force=True, ignore_permissions=True)

    def _make_objective(self, title="Obj"):
        return m.create_objective(TEST_BRAND, {
            "title": title, "period": "2026-Q3", "objective_owner": "Administrator"})

    def test_create_objective_forces_brand_and_blocks_mass_assignment(self):
        res = m.create_objective(TEST_BRAND, {
            "title": "Grow", "period": "2026-Q3", "objective_owner": "Administrator",
            "brand": "SomeOtherBrand", "pdca_phase": "CLOSED"})  # both ignored
        doc = frappe.get_doc("Objective", res["id"])
        self.assertEqual(doc.brand, TEST_BRAND)
        self.assertEqual(doc.pdca_phase, "PLAN")

    def test_create_objective_autofills_period_dates(self):
        doc = frappe.get_doc("Objective", self._make_objective("Dates")["id"])
        self.assertEqual(str(doc.period_start), "2026-07-01")
        self.assertEqual(str(doc.period_end), "2026-09-30")

    def test_create_objective_invalid_period_raises(self):
        with self.assertRaises(frappe.ValidationError):
            m.create_objective(TEST_BRAND, {"title": "Bad", "period": "2026-Q9"})

    def test_update_objective_allow_list_blocks_pdca(self):
        res = self._make_objective("Edit")
        m.update_objective(res["id"], {"title": "Renamed", "pdca_phase": "CLOSED"})
        doc = frappe.get_doc("Objective", res["id"])
        self.assertEqual(doc.title, "Renamed")
        self.assertEqual(doc.pdca_phase, "PLAN")

    def test_create_key_result_computes_progress(self):
        obj = self._make_objective("KR")
        kr = m.create_key_result(obj["id"], {
            "metric": "Leads", "target_value": 200, "current_value": 50,
            "progress_percent": 999})  # ignored, controller recomputes
        doc = frappe.get_doc("Key Result", kr["id"])
        self.assertEqual(doc.progress_percent, 25.0)

    def test_create_key_result_rejects_zero_target(self):
        obj = self._make_objective("BadKR")
        with self.assertRaises(frappe.ValidationError):
            m.create_key_result(obj["id"], {"metric": "Bad", "target_value": 0})

    def test_get_objective_returns_editable_scalars_only(self):
        obj = self._make_objective("Hydrate")
        row = m.get_objective(obj["id"])
        self.assertEqual(row["title"], "Hydrate")
        self.assertIn("period", row)
        self.assertNotIn("pdca_phase", row)

    def test_create_objective_unknown_brand_raises(self):
        with self.assertRaises(frappe.DoesNotExistError):
            m.create_objective("NoBrand-XYZ", {"title": "x", "period": "2026"})

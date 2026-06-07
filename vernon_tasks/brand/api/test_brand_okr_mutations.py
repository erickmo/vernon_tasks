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
        """Insert an Objective directly.

        Objective creation now goes through Frappe native quick entry (no
        create_objective endpoint), so these KR tests just need a parent objective
        to exist — they insert one via the controller instead of an app endpoint.
        """
        doc = frappe.get_doc({
            "doctype": "Objective", "brand": TEST_BRAND,
            "title": title, "period": "2026-Q3", "objective_owner": "Administrator",
        }).insert(ignore_permissions=True)
        return {"id": doc.name}

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

import frappe
from frappe.tests.utils import FrappeTestCase

from vernon_tasks.brand.api import brand_okr

TEST_BRAND = "TestBrandOKR-Z"
EMPTY_BRAND = "TestBrandOKR-Empty"


class TestBrandOkrGrouping(FrappeTestCase):
    """Pure-function tests for period grouping (no DB)."""

    def _obj(self, name, title, period, start, end):
        return {"name": name, "title": title, "status": "Open", "pdca_phase": "PLAN",
                "objective_owner": None, "period": period,
                "period_start": start, "period_end": end}

    def test_groups_by_period_blank_last_and_aggregates_progress(self):
        objectives = [
            self._obj("O1", "A", "2026-Q1", "2026-01-01", "2026-03-31"),
            self._obj("O2", "B", "2025-Q4", "2025-10-01", "2025-12-31"),
            self._obj("O3", "C", None, None, None),
        ]
        krs = {"O1": [
            {"id": "K1", "target": 100.0, "current": 50.0, "progress_percent": 50.0},
            {"id": "K2", "target": 0.0, "current": 9.0, "progress_percent": 0.0},  # ignored
        ]}
        periods = brand_okr._group_by_period(objectives, krs)
        self.assertEqual([p["period"] for p in periods],
                         ["2026-Q1", "2025-Q4", brand_okr.NO_PERIOD_LABEL])
        # zero-target KR ignored -> mean over {50.0} = 50.0
        self.assertEqual(periods[0]["objectives"][0]["progress"], 50.0)
        self.assertEqual(periods[0]["objectives"][0]["key_results"], krs["O1"])

    def test_objective_without_krs_has_zero_progress(self):
        objectives = [self._obj("O1", "A", "2026-Q1", "2026-01-01", "2026-03-31")]
        periods = brand_okr._group_by_period(objectives, {})
        self.assertEqual(periods[0]["objectives"][0]["progress"], 0.0)


class TestBrandOkrEndpoint(FrappeTestCase):
    def setUp(self):
        frappe.set_user("Administrator")
        self._cleanup()
        frappe.get_doc({"doctype": "VT Brand", "brand_name": TEST_BRAND}).insert(
            ignore_permissions=True)
        self.obj_current = frappe.get_doc({
            "doctype": "Objective", "title": "Current Obj", "brand": TEST_BRAND,
            "period": "2026-Q2", "objective_owner": "Administrator",
            "status": "Open", "pdca_phase": "PLAN"}).insert(ignore_permissions=True)
        self.obj_past = frappe.get_doc({
            "doctype": "Objective", "title": "Past Obj", "brand": TEST_BRAND,
            "period": "2025-Q1", "objective_owner": "Administrator",
            "status": "Open", "pdca_phase": "PLAN"}).insert(ignore_permissions=True)
        frappe.get_doc({
            "doctype": "Key Result", "objective": self.obj_current.name,
            "metric": "Signups", "target_value": 100, "current_value": 40,
        }).insert(ignore_permissions=True)

    def tearDown(self):
        self._cleanup()

    def _cleanup(self):
        for brand in (TEST_BRAND, EMPTY_BRAND):
            for obj in frappe.get_all("Objective", filters={"brand": brand}):
                for kr in frappe.get_all("Key Result", filters={"objective": obj.name}):
                    frappe.delete_doc("Key Result", kr.name, force=True, ignore_permissions=True)
                frappe.delete_doc("Objective", obj.name, force=True, ignore_permissions=True)
            if frappe.db.exists("VT Brand", brand):
                frappe.delete_doc("VT Brand", brand, force=True, ignore_permissions=True)

    def test_returns_periods_newest_first(self):
        res = brand_okr.get_brand_okr(TEST_BRAND)
        self.assertEqual(res["brand"]["id"], TEST_BRAND)
        self.assertEqual([p["period"] for p in res["periods"]], ["2026-Q2", "2025-Q1"])

    def test_key_results_attached(self):
        res = brand_okr.get_brand_okr(TEST_BRAND)
        current = next(p for p in res["periods"] if p["period"] == "2026-Q2")
        krs = current["objectives"][0]["key_results"]
        self.assertEqual(len(krs), 1)
        self.assertEqual(krs[0]["target"], 100.0)
        self.assertEqual(krs[0]["current"], 40.0)

    def test_brand_with_no_objectives_returns_empty_periods(self):
        frappe.get_doc({"doctype": "VT Brand", "brand_name": EMPTY_BRAND}).insert(
            ignore_permissions=True)
        res = brand_okr.get_brand_okr(EMPTY_BRAND)
        self.assertEqual(res["periods"], [])

    def test_unknown_brand_raises(self):
        with self.assertRaises(frappe.DoesNotExistError):
            brand_okr.get_brand_okr("NoSuchBrand-XYZ")

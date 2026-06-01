import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_tasks.task.services.okr_rollup_service import get_okr_rollup


ROLLUP_TEST_BRAND = "Test Rollup Brand"


def _ensure_brand():
    if not frappe.db.exists("VT Brand", ROLLUP_TEST_BRAND):
        frappe.get_doc({
            "doctype": "VT Brand", "brand_name": ROLLUP_TEST_BRAND,
        }).insert(ignore_permissions=True)


def _make_objective(title, period, status="Open"):
    _ensure_brand()
    return frappe.get_doc({
        "doctype": "Objective",
        "title": title,
        "brand": ROLLUP_TEST_BRAND,
        "period": period,
        "objective_owner": frappe.session.user,
        "status": status,
    }).insert(ignore_permissions=True)


def _make_kr(objective, target, current):
    return frappe.get_doc({
        "doctype": "Key Result",
        "objective": objective,
        "metric": "M",
        "target_value": target,
        "current_value": current,
        "progress_percent": round((current / target) * 100, 2) if target else 0,
        "unit": "%",
    }).insert(ignore_permissions=True)


class TestOKRRollup(FrappeTestCase):
    def setUp(self):
        # Clear any old test data — delete KRs first so on_trash guard doesn't block
        for title in ("OKR-A", "OKR-B", "OKR-Closed", "OKR-NoKR"):
            for n in frappe.get_all("Objective", {"title": title}, ["name"]):
                frappe.db.delete("Key Result", {"objective": n["name"]})
                frappe.delete_doc("Objective", n["name"], force=True)
        self.obj_a = _make_objective("OKR-A", "2026-Q2")
        self.obj_b = _make_objective("OKR-B", "2026-Q2")
        self.obj_closed = _make_objective("OKR-Closed", "2026-Q2", status="Closed")
        _make_kr(self.obj_a.name, 100, 80)   # 80%
        _make_kr(self.obj_a.name, 100, 60)   # 60% → avg 70
        _make_kr(self.obj_b.name, 100, 30)   # 30%
        _make_kr(self.obj_closed.name, 100, 100)  # not included

    def tearDown(self):
        # Clean up all objectives created by setUp and individual tests
        for title in ("OKR-A", "OKR-B", "OKR-Closed", "OKR-NoKR"):
            for n in frappe.get_all("Objective", {"title": title}, ["name"]):
                frappe.db.delete("Key Result", {"objective": n["name"]})
                frappe.delete_doc("Objective", n["name"], force=True)

    def test_excludes_closed(self):
        rows = get_okr_rollup(period="2026-Q2")
        titles = [r["title"] for r in rows]
        self.assertIn("OKR-A", titles)
        self.assertIn("OKR-B", titles)
        self.assertNotIn("OKR-Closed", titles)

    def test_progress_average(self):
        rows = get_okr_rollup(period="2026-Q2")
        a = [r for r in rows if r["title"] == "OKR-A"][0]
        b = [r for r in rows if r["title"] == "OKR-B"][0]
        self.assertAlmostEqual(a["progress"], 70.0)
        self.assertAlmostEqual(b["progress"], 30.0)
        self.assertEqual(a["kr_count"], 2)
        self.assertEqual(b["kr_count"], 1)

    def test_sorted_progress_desc(self):
        rows = get_okr_rollup(period="2026-Q2")
        progress = [r["progress"] for r in rows]
        self.assertEqual(progress, sorted(progress, reverse=True))

    def test_objective_without_kr_returns_zero(self):
        empty = _make_objective("OKR-NoKR", "2026-Q2")
        rows = get_okr_rollup(period="2026-Q2")
        row = [r for r in rows if r["title"] == "OKR-NoKR"][0]
        self.assertEqual(row["progress"], 0.0)
        self.assertEqual(row["kr_count"], 0)

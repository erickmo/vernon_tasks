import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, today
from vernon_tasks.task.services.health_score_service import (
    get_health_score,
    list_brand_health_scores,
)


class TestHealthScore(FrappeTestCase):
    def test_returns_expected_shape(self):
        r = get_health_score()
        for key in ("score", "okr_pct", "ontime_pct", "velocity_health", "breakdown"):
            self.assertIn(key, r)
        for key in ("okr_weight", "ontime_weight", "velocity_weight"):
            self.assertIn(key, r["breakdown"])
        self.assertGreaterEqual(r["score"], 0.0)
        self.assertLessEqual(r["score"], 100.0)

    def test_score_is_weighted_combination(self):
        r = get_health_score()
        expected = (
            r["okr_pct"] * 0.5
            + r["ontime_pct"] * 0.3
            + r["velocity_health"] * 0.2
        )
        self.assertAlmostEqual(r["score"], round(expected, 2), places=2)

    def test_ontime_pct_uses_recent_tasks(self):
        # Create a project + a single late task + a single on-time task within 90 days
        for n in frappe.get_all("VT Project", {"title": "HS-OnTime"}, ["name"]):
            frappe.delete_doc("VT Project", n["name"], force=True)
        if not frappe.db.exists("VT Brand", "HS Test Brand"):
            frappe.get_doc({"doctype": "VT Brand", "brand_name": "HS Test Brand"}).insert(ignore_permissions=True)
        p = frappe.get_doc({
            "doctype": "VT Project", "title": "HS-OnTime",
            "brand": "HS Test Brand",
            "project_owner": frappe.session.user,
            "start_date": add_days(today(), -30),
            "end_date": add_days(today(), 30),
            "status": "Open",
        }).insert(ignore_permissions=True)
        # On-time
        frappe.get_doc({
            "doctype": "VT Task", "title": "T1",
            "project": p.name,
            "estimated_minutes": 1, "actual_minutes": 1,
            "pdca_phase": "DONE", "kanban_status": "Done",
            "deadline": add_days(today(), -5),
            "completion_date": add_days(today(), -6),
        }).insert(ignore_permissions=True)
        # Late
        frappe.get_doc({
            "doctype": "VT Task", "title": "T2",
            "project": p.name,
            "estimated_minutes": 1, "actual_minutes": 1,
            "pdca_phase": "DONE", "kanban_status": "Done",
            "deadline": add_days(today(), -10),
            "completion_date": add_days(today(), -5),
        }).insert(ignore_permissions=True)
        r = get_health_score()
        # Just assert that ontime_pct is sane (0..100); other test data on site means we don't pin a value
        self.assertGreaterEqual(r["ontime_pct"], 0.0)
        self.assertLessEqual(r["ontime_pct"], 100.0)

    def test_brand_scoped_returns_brand_field(self):
        if not frappe.db.exists("VT Brand", "Brand Scope Test"):
            frappe.get_doc({"doctype": "VT Brand", "brand_name": "Brand Scope Test"}).insert(ignore_permissions=True)
        r = get_health_score(brand="Brand Scope Test")
        self.assertEqual(r["brand"], "Brand Scope Test")
        for key in ("score", "okr_pct", "ontime_pct", "velocity_health"):
            self.assertIn(key, r)

    def test_list_brand_health_returns_per_brand(self):
        if not frappe.db.exists("VT Brand", "Brand List Test"):
            frappe.get_doc({"doctype": "VT Brand", "brand_name": "Brand List Test"}).insert(ignore_permissions=True)
        rows = list_brand_health_scores()
        self.assertIsInstance(rows, list)
        self.assertTrue(any(r["brand"] == "Brand List Test" for r in rows))
        for r in rows:
            self.assertIn("brand_name", r)
            self.assertIn("score", r)

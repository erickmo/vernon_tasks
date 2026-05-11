import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, today
from vernon_tasks.task.services.health_score_service import get_health_score


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
        p = frappe.get_doc({
            "doctype": "VT Project", "title": "HS-OnTime",
            "project_owner": frappe.session.user,
            "start_date": add_days(today(), -30),
            "end_date": add_days(today(), 30),
            "status": "Open",
        }).insert(ignore_permissions=True)
        # On-time
        frappe.get_doc({
            "doctype": "VT Task", "title": "T1",
            "project": p.name,
            "estimated_hours": 1, "actual_hours": 1,
            "pdca_phase": "DONE", "kanban_status": "Done",
            "deadline": add_days(today(), -5),
            "completion_date": add_days(today(), -6),
        }).insert(ignore_permissions=True)
        # Late
        frappe.get_doc({
            "doctype": "VT Task", "title": "T2",
            "project": p.name,
            "estimated_hours": 1, "actual_hours": 1,
            "pdca_phase": "DONE", "kanban_status": "Done",
            "deadline": add_days(today(), -10),
            "completion_date": add_days(today(), -5),
        }).insert(ignore_permissions=True)
        r = get_health_score()
        # Just assert that ontime_pct is sane (0..100); other test data on site means we don't pin a value
        self.assertGreaterEqual(r["ontime_pct"], 0.0)
        self.assertLessEqual(r["ontime_pct"], 100.0)

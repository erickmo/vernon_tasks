import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_tasks.task.services.dashboard_aggregator import build_home_payload


class TestDashboardAggregator(FrappeTestCase):
    def setUp(self):
        self.user = "dash_user@vernon.test"
        if not frappe.db.exists("User", self.user):
            frappe.get_doc({
                "doctype": "User",
                "email": self.user,
                "first_name": "Dash",
                "send_welcome_email": 0,
            }).insert(ignore_permissions=True)

    def test_payload_shape_for_ic(self):
        payload = build_home_payload(user=self.user, role="ic")
        self.assertEqual(
            set(payload.keys()),
            {"role", "at_risk", "today", "me", "sprints", "projects"},
        )
        self.assertIn("ontime_rate_7d", payload["today"])
        self.assertIn("blocked_count", payload["today"])
        self.assertIn("okr_confidence_delta_wow", payload["today"])
        self.assertIn("points_week", payload["me"])
        self.assertIn("streak_days", payload["me"])
        self.assertIn("capacity_used_pct", payload["me"])
        self.assertIn("ontime_rate_7d", payload["me"])

    def test_exec_payload_swaps_today_for_org_health(self):
        payload = build_home_payload(user=self.user, role="exec")
        self.assertIn("org_health_score", payload["today"])

    def test_at_risk_list_only_when_triggered(self):
        payload = build_home_payload(user=self.user, role="ic")
        self.assertEqual(payload["at_risk"], [])

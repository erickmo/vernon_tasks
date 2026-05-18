# vernon_tasks/api/test_portal_dashboard.py
import frappe
import unittest
from unittest.mock import patch


class TestPortalDashboardSummary(unittest.TestCase):
    def setUp(self):
        self.user = "Administrator"
        frappe.set_user(self.user)
        frappe.cache().delete_value(f"portal_dashboard_summary_{frappe.session.user}")

    def test_get_summary_returns_expected_keys(self):
        from vernon_tasks.api.portal_dashboard import get_summary
        result = get_summary()
        self.assertIn("team_blocked", result)
        self.assertIn("unassigned_tasks", result)
        self.assertIn("okr_progress", result)
        self.assertIn("my_overdue", result)
        self.assertIn("sprint_days_remaining", result)

    def test_get_summary_non_leader_returns_zero_blocked(self):
        from vernon_tasks.api.portal_dashboard import get_summary
        with patch("frappe.get_roles", return_value=["VT Member"]):
            result = get_summary()
        self.assertEqual(result["team_blocked"], 0)
        self.assertEqual(result["unassigned_tasks"], 0)


class TestTeamPulse(unittest.TestCase):
    def setUp(self):
        frappe.set_user("Administrator")

    def test_get_team_pulse_requires_leader(self):
        from vernon_tasks.api.portal_dashboard import get_team_pulse
        with patch("frappe.get_roles", return_value=["VT Member"]):
            with self.assertRaises(frappe.PermissionError):
                get_team_pulse(project="test-project")

    def test_get_team_pulse_returns_list(self):
        from vernon_tasks.api.portal_dashboard import get_team_pulse
        with patch("frappe.get_roles", return_value=["VT Leader"]):
            result = get_team_pulse(project=None)
        self.assertIsInstance(result, list)

    def test_get_unassigned_tasks_requires_leader(self):
        from vernon_tasks.api.portal_dashboard import get_unassigned_tasks
        with patch("frappe.get_roles", return_value=["VT Member"]):
            with self.assertRaises(frappe.PermissionError):
                get_unassigned_tasks(project=None)

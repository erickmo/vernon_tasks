import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_tasks.task.api.analytics import (
    get_burndown,
    get_velocity_trend,
    get_forecast,
    get_risks,
)


def _ensure_role(role):
    if not frappe.db.exists("Role", role):
        frappe.get_doc({"doctype": "Role", "role_name": role}).insert(ignore_permissions=True)


def _user_with_roles(email, roles):
    if not frappe.db.exists("User", email):
        frappe.get_doc({
            "doctype": "User",
            "email": email,
            "first_name": "T",
            "send_welcome_email": 0,
            "enabled": 1,
            "roles": [{"role": r} for r in roles],
        }).insert(ignore_permissions=True)
    return email


class TestAnalyticsAPI(FrappeTestCase):
    def setUp(self):
        _ensure_role("VT Leader")
        self.leader = _user_with_roles("vt-leader-test@example.com", ["VT Leader"])
        self.guest = _user_with_roles("vt-guest-test@example.com", [])

    def tearDown(self):
        frappe.set_user("Administrator")

    def test_get_burndown_requires_leader_role(self):
        frappe.set_user(self.guest)
        with self.assertRaises(frappe.PermissionError):
            get_burndown(sprint="x")

    def test_get_velocity_trend_requires_leader_role(self):
        frappe.set_user(self.guest)
        with self.assertRaises(frappe.PermissionError):
            get_velocity_trend(project="x")

    def test_get_forecast_requires_leader_role(self):
        frappe.set_user(self.guest)
        with self.assertRaises(frappe.PermissionError):
            get_forecast(project="x")

    def test_get_risks_requires_leader_role(self):
        frappe.set_user(self.guest)
        with self.assertRaises(frappe.PermissionError):
            get_risks(project="x")

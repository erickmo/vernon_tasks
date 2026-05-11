import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_tasks.task.api.ic_analytics import (
    get_leaderboard, get_personal_velocity, get_streak,
)


def _ensure_role(role):
    if not frappe.db.exists("Role", role):
        frappe.get_doc({"doctype": "Role", "role_name": role}).insert(ignore_permissions=True)


def _user_with_roles(email, roles):
    if not frappe.db.exists("User", email):
        frappe.get_doc({
            "doctype": "User", "email": email, "first_name": "T",
            "send_welcome_email": 0, "enabled": 1,
            "roles": [{"role": r} for r in roles],
        }).insert(ignore_permissions=True)
    return email


class TestICAPI(FrappeTestCase):
    def setUp(self):
        for r in ("VT Member", "VT Leader"):
            _ensure_role(r)
        self.member = _user_with_roles("ic-member@x.com", ["VT Member"])
        self.guest = _user_with_roles("ic-guest@x.com", [])

    def tearDown(self):
        frappe.set_user("Administrator")

    def test_leaderboard_blocked_for_guest(self):
        frappe.set_user(self.guest)
        with self.assertRaises(frappe.PermissionError):
            get_leaderboard(period="month")

    def test_personal_velocity_blocked_for_guest(self):
        frappe.set_user(self.guest)
        with self.assertRaises(frappe.PermissionError):
            get_personal_velocity(project="x")

    def test_streak_blocked_for_guest(self):
        frappe.set_user(self.guest)
        with self.assertRaises(frappe.PermissionError):
            get_streak(project="x")

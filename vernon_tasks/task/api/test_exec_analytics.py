import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_tasks.task.api.exec_analytics import (
    get_okr_rollup, get_kpi_trend, list_kpis, get_health_score,
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


class TestExecAPI(FrappeTestCase):
    def setUp(self):
        _ensure_role("VT Manager")
        self.guest = _user_with_roles("exec-guest@x.com", [])

    def tearDown(self):
        frappe.set_user("Administrator")

    def test_okr_rollup_blocked_for_guest(self):
        frappe.set_user(self.guest)
        with self.assertRaises(frappe.PermissionError):
            get_okr_rollup()

    def test_kpi_trend_blocked_for_guest(self):
        frappe.set_user(self.guest)
        with self.assertRaises(frappe.PermissionError):
            get_kpi_trend(kpi_definition="x")

    def test_list_kpis_blocked_for_guest(self):
        frappe.set_user(self.guest)
        with self.assertRaises(frappe.PermissionError):
            list_kpis()

    def test_health_score_blocked_for_guest(self):
        frappe.set_user(self.guest)
        with self.assertRaises(frappe.PermissionError):
            get_health_score()

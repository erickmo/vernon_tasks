import frappe
from frappe.tests.utils import FrappeTestCase


class TestPortalDashboardApi(FrappeTestCase):
    def test_get_home_requires_login(self):
        frappe.set_user("Guest")
        try:
            with self.assertRaises(frappe.PermissionError):
                frappe.get_attr("vernon_tasks.task.api.portal_dashboard.get_home")(role="ic")
        finally:
            frappe.set_user("Administrator")

    def test_get_home_returns_payload_shape(self):
        frappe.set_user("Administrator")
        out = frappe.get_attr("vernon_tasks.task.api.portal_dashboard.get_home")(role="ic")
        self.assertIn("role", out)
        self.assertIn("today", out)
        self.assertIn("me", out)
        self.assertEqual(out["role"], "ic")

    def test_invalid_role_clamped(self):
        frappe.set_user("Administrator")
        out = frappe.get_attr("vernon_tasks.task.api.portal_dashboard.get_home")(role="evil")
        self.assertEqual(out["role"], "ic")

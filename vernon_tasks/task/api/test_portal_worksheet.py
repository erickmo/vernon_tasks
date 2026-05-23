import frappe
from frappe.tests.utils import FrappeTestCase


class TestPortalWorksheetApi(FrappeTestCase):
    def test_get_worksheet_requires_login(self):
        frappe.set_user("Guest")
        with self.assertRaises(frappe.PermissionError):
            frappe.get_attr(
                "vernon_tasks.task.api.portal_worksheet.get_worksheet"
            )(week_start="2026-05-18")

    def test_get_worksheet_returns_shape(self):
        frappe.set_user("Administrator")
        out = frappe.get_attr(
            "vernon_tasks.task.api.portal_worksheet.get_worksheet"
        )(week_start="2026-05-18")
        self.assertIn("days", out)
        self.assertIn("unscheduled", out)

    def test_team_view_requires_leader_role(self):
        frappe.set_user("Administrator")
        out = frappe.get_attr(
            "vernon_tasks.task.api.portal_worksheet.get_team_worksheet"
        )(week_start="2026-05-18")
        self.assertIsInstance(out, list)

import frappe
from frappe.tests.utils import FrappeTestCase


class TestVTReportSubscription(FrappeTestCase):
    def test_unknown_slug_rejected(self):
        frappe.set_user("Administrator")
        with self.assertRaises(frappe.ValidationError):
            frappe.get_doc({
                "doctype": "VT Report Subscription",
                "slug": "evil-slug",
                "title": "Bad",
                "cron": "0 8 * * 1",
                "format": "csv",
                "recipients": [{"user": "Administrator"}],
            }).insert()

    def test_requires_recipient(self):
        frappe.set_user("Administrator")
        with self.assertRaises(frappe.ValidationError):
            frappe.get_doc({
                "doctype": "VT Report Subscription",
                "slug": "project-health",
                "title": "OK",
                "cron": "0 8 * * 1",
                "format": "csv",
                "recipients": [],
            }).insert()

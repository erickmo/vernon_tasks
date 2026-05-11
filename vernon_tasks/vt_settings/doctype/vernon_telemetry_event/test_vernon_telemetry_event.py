import frappe
from frappe.tests.utils import FrappeTestCase


class TestVernonTelemetryEvent(FrappeTestCase):
    def test_create_event(self):
        doc = frappe.get_doc({
            "doctype": "Vernon Telemetry Event",
            "event": "pwa_boot",
            "props": '{"version":"abc123"}',
        })
        doc.insert(ignore_permissions=True)
        self.assertEqual(doc.event, "pwa_boot")
        self.assertEqual(doc.user, frappe.session.user)
        self.assertIsNotNone(doc.timestamp)

    def test_before_insert_fills_defaults(self):
        doc = frappe.get_doc({
            "doctype": "Vernon Telemetry Event",
            "event": "page_view",
        })
        doc.insert(ignore_permissions=True)
        self.assertIsNotNone(doc.timestamp)
        self.assertEqual(doc.user, frappe.session.user)

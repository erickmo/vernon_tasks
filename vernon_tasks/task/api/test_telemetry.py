import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_tasks.task.api.telemetry import log_event, purge_old_telemetry


class TestTelemetry(FrappeTestCase):
    def setUp(self):
        frappe.set_user("Administrator")
        frappe.db.delete("Vernon Telemetry Event")
        frappe.cache().delete_keys("vt:tel:")

    def test_log_event_persists(self):
        log_event(event="pwa_boot", props={"version": "abc"})
        rows = frappe.get_all("Vernon Telemetry Event", filters={"event": "pwa_boot"})
        self.assertEqual(len(rows), 1)

    def test_log_event_rejects_unknown(self):
        with self.assertRaises(frappe.ValidationError):
            log_event(event="rogue_event")

    def test_log_event_rate_limit(self):
        for _ in range(60):
            log_event(event="page_view", props={"route": "/app/vt-task"})
        with self.assertRaises(frappe.ValidationError):
            log_event(event="page_view", props={"route": "/app/vt-task"})

    def test_purge_removes_old(self):
        doc = frappe.get_doc({
            "doctype": "Vernon Telemetry Event",
            "event": "pwa_boot",
            "timestamp": frappe.utils.add_days(frappe.utils.now_datetime(), -100),
        }).insert(ignore_permissions=True)
        purge_old_telemetry()
        self.assertFalse(frappe.db.exists("Vernon Telemetry Event", doc.name))

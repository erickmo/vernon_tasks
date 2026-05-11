import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_tasks.task.services.threshold import get_project_threshold, THRESHOLD_KEYS


class TestThreshold(FrappeTestCase):
    def setUp(self):
        settings = frappe.get_single("VT Settings")
        settings.default_blocked_days_threshold = 3
        settings.default_slip_pct_threshold = 20
        settings.default_capacity_pct_threshold = 120
        settings.save(ignore_permissions=True)

    def test_unknown_key_raises(self):
        with self.assertRaises(ValueError):
            get_project_threshold(None, "unknown_key")

    def test_no_project_returns_settings_default(self):
        self.assertEqual(get_project_threshold(None, "blocked_days"), 3)
        self.assertEqual(get_project_threshold(None, "slip_pct"), 20)
        self.assertEqual(get_project_threshold(None, "capacity_pct"), 120)

    def test_threshold_keys_complete(self):
        self.assertEqual(set(THRESHOLD_KEYS), {"blocked_days", "slip_pct", "capacity_pct"})

# Tests for VT Settings read/write API (vt-settings hub).
import frappe
import unittest

from vernon_tasks.task.api.settings import get_settings, save_settings

MEMBER_USER = "vt_settings_member@example.com"


class TestSettingsApi(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        frappe.set_user("Administrator")
        if not frappe.db.exists("User", MEMBER_USER):
            frappe.get_doc({
                "doctype": "User",
                "email": MEMBER_USER,
                "first_name": "VT Settings Member",
                "send_welcome_email": 0,
            }).insert(ignore_permissions=True)

    def tearDown(self):
        frappe.set_user("Administrator")

    def test_get_settings_shape(self):
        data = get_settings()
        self.assertIsInstance(data, dict)
        for key in ("navbar_items", "branding", "scoring"):
            self.assertIn(key, data)
        self.assertIsInstance(data["navbar_items"], list)

    def test_save_settings_persists_navbar(self):
        save_settings(navbar_items=[
            {"label": "Test", "route": "/app/test", "icon": "x", "enabled": 1},
        ])
        data = get_settings()
        labels = [row["label"] for row in data["navbar_items"]]
        self.assertIn("Test", labels)

    def test_non_manager_denied(self):
        frappe.set_user(MEMBER_USER)
        with self.assertRaises(frappe.PermissionError):
            get_settings()

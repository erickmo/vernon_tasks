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
        # These tests replace the whole navbar_items table; snapshot the real
        # navbar (all 7 fields) so the suite restores it and never leaves the
        # site's role-gated menu flattened.
        cls._navbar_snapshot = get_settings()["navbar_items"]

    @classmethod
    def tearDownClass(cls):
        frappe.set_user("Administrator")
        save_settings(navbar_items=cls._navbar_snapshot)

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

    def test_save_preserves_group_and_role_fields(self):
        # Regression: the editor must round-trip is_group / parent_group /
        # role_restriction. If they are dropped, one save flattens the
        # dropdown groups AND leaks Manager-only links to every role, because
        # boot.py treats an empty role_restriction as "visible to all".
        save_settings(navbar_items=[
            {"label": "Grp", "route": "#", "icon": "users", "enabled": 1,
             "is_group": 1, "parent_group": "", "role_restriction": "VT Manager"},
            {"label": "Child", "route": "/app/x", "icon": "x", "enabled": 1,
             "is_group": 0, "parent_group": "Grp", "role_restriction": "VT Manager"},
        ])
        rows = {r["label"]: r for r in get_settings()["navbar_items"]}
        self.assertEqual(rows["Grp"]["is_group"], 1)
        self.assertEqual(rows["Child"]["parent_group"], "Grp")
        self.assertEqual(rows["Child"]["role_restriction"], "VT Manager")

    def test_non_manager_denied(self):
        frappe.set_user(MEMBER_USER)
        with self.assertRaises(frappe.PermissionError):
            get_settings()

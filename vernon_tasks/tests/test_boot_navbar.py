"""Tests for boot.py navbar role-filtering logic."""
import frappe
import unittest


class TestBootNavbar(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        frappe.set_user("Administrator")

    def _seed_navbar_items(self, items):
        """Replace VT Settings navbar_items with given list."""
        doc = frappe.get_single("VT Settings")
        doc.set("navbar_items", [])
        for it in items:
            doc.append("navbar_items", it)
        doc.save(ignore_permissions=True)
        frappe.db.commit()

    def tearDown(self):
        doc = frappe.get_single("VT Settings")
        doc.set("navbar_items", [])
        doc.save(ignore_permissions=True)
        frappe.db.commit()

    def test_items_without_restriction_always_returned(self):
        self._seed_navbar_items([
            {"label": "Home", "route": "/app/vt-home", "icon": "home", "enabled": 1,
             "is_group": 0, "parent_group": "", "role_restriction": ""},
        ])
        from unittest.mock import MagicMock
        from vernon_tasks.boot import extend_bootinfo
        boot = MagicMock()
        extend_bootinfo(boot)
        labels = [i["label"] for i in boot.vt_navbar_items]
        self.assertIn("Home", labels)

    def test_restricted_item_hidden_from_member(self):
        from vernon_tasks.boot import _filter_by_roles
        items = [
            {"label": "Home", "role_restriction": ""},
            {"label": "Admin", "role_restriction": "VT Manager"},
        ]
        user_roles = {"VT Member", "Guest"}
        result = _filter_by_roles(items, user_roles)
        labels = [i["label"] for i in result]
        self.assertIn("Home", labels)
        self.assertNotIn("Admin", labels)

    def test_restricted_item_visible_to_matching_role(self):
        from vernon_tasks.boot import _filter_by_roles
        items = [
            {"label": "Leader", "role_restriction": "VT Leader"},
        ]
        user_roles = {"VT Leader", "VT Member"}
        result = _filter_by_roles(items, user_roles)
        self.assertEqual(len(result), 1)

    def test_default_navbar_used_when_no_items(self):
        from unittest.mock import MagicMock
        from vernon_tasks.boot import extend_bootinfo, DEFAULT_NAVBAR
        boot = MagicMock()
        extend_bootinfo(boot)
        self.assertIsInstance(boot.vt_navbar_items, list)
        self.assertGreater(len(boot.vt_navbar_items), 0)

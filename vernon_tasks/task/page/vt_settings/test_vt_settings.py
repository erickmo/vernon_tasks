# Tests for vt-settings desk Page. Manager-only settings hub.
import frappe
import unittest

PAGE_NAME = "vt-settings"
EXPECTED_ROLES = {"VT Manager"}


class TestVtSettingsPage(unittest.TestCase):
    def test_page_exists(self):
        self.assertTrue(frappe.db.exists("Page", PAGE_NAME))

    def test_page_route_name(self):
        page = frappe.get_doc("Page", PAGE_NAME)
        self.assertEqual(page.page_name, PAGE_NAME)

    def test_role_gating(self):
        page = frappe.get_doc("Page", PAGE_NAME)
        roles = {r.role for r in page.roles}
        self.assertEqual(roles, EXPECTED_ROLES)

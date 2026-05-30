# Tests for vt-home dashboard Page. Spec: docs/superpowers/specs/2026-05-30-dashboard-after-login-design.html
import frappe
import unittest

PAGE_NAME = "vt-home"
EXPECTED_ROLES = {"VT Member", "VT Leader", "VT Manager"}


class TestVtHomePage(unittest.TestCase):
    def test_page_exists(self):
        # vt-home Page must be installed as a fixture
        self.assertTrue(frappe.db.exists("Page", PAGE_NAME))

    def test_page_route_name(self):
        # page_name drives the /app/<page_name> route
        page = frappe.get_doc("Page", PAGE_NAME)
        self.assertEqual(page.page_name, PAGE_NAME)

    def test_role_gating(self):
        # Only VT roles may open the dashboard
        page = frappe.get_doc("Page", PAGE_NAME)
        roles = {r.role for r in page.roles}
        self.assertEqual(roles, EXPECTED_ROLES)

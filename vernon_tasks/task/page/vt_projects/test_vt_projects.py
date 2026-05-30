# Tests for vt-projects desk Page. Spec: docs/superpowers/specs/2026-05-30-vt-navbar-projects-design.html
import frappe
import unittest

PAGE_NAME = "vt-projects"
PROJECT_DOCTYPE = "VT Project"
EXPECTED_ROLES = {"VT Member", "VT Leader", "VT Manager"}


class TestVtProjectsPage(unittest.TestCase):
    def test_page_exists(self):
        self.assertTrue(frappe.db.exists("Page", PAGE_NAME))

    def test_page_route_name(self):
        page = frappe.get_doc("Page", PAGE_NAME)
        self.assertEqual(page.page_name, PAGE_NAME)

    def test_role_gating(self):
        page = frappe.get_doc("Page", PAGE_NAME)
        roles = {r.role for r in page.roles}
        self.assertEqual(roles, EXPECTED_ROLES)

    # The "Buat Proyek" quick-create dialog is client-side (vt_projects.js);
    # its UI behavior is not testable server-side. We only assert the target
    # doctype it inserts into exists, so the dialog has something to create.
    def test_create_dialog_doctype_exists(self):
        self.assertTrue(frappe.db.exists("DocType", PROJECT_DOCTYPE))

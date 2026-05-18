import frappe
import unittest
from vernon_tasks.api.auth import get_user_permissions

PORTAL_PERM_KEYS = {
    "okr.read", "okr.write",
    "project.read", "project.write",
    "workforce.read",
    "report.read",
}

class TestGetUserPermissions(unittest.TestCase):
    def setUp(self):
        self.user_email = "portal_test_user@example.com"
        if not frappe.db.exists("User", self.user_email):
            user = frappe.get_doc({
                "doctype": "User",
                "email": self.user_email,
                "first_name": "Portal",
                "send_welcome_email": 0,
            }).insert(ignore_permissions=True)
        frappe.set_user(self.user_email)

    def tearDown(self):
        frappe.set_user("Administrator")

    def test_returns_permissions_and_roles_keys(self):
        result = get_user_permissions()
        self.assertIn("permissions", result)
        self.assertIn("roles", result)
        self.assertIsInstance(result["permissions"], list)
        self.assertIsInstance(result["roles"], list)

    def test_permissions_subset_of_known_keys(self):
        result = get_user_permissions()
        self.assertTrue(set(result["permissions"]).issubset(PORTAL_PERM_KEYS))

    def test_manager_role_gets_read_permissions(self):
        frappe.set_user("Administrator")
        if not frappe.db.exists("Role", "Projects Manager"):
            frappe.get_doc({"doctype": "Role", "role_name": "Projects Manager"}).insert(ignore_permissions=True)
        user = frappe.get_doc("User", self.user_email)
        if "Projects Manager" not in [r.role for r in user.roles]:
            user.append("roles", {"role": "Projects Manager"})
            user.save(ignore_permissions=True)
        frappe.set_user(self.user_email)
        result = get_user_permissions()
        self.assertIn("project.read", result["permissions"])

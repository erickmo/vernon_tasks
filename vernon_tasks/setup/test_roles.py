# Tests for default-role assignment on session creation.
from unittest.mock import patch
import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_tasks.setup.roles import grant_default_role

_VT_ROLES = {"VT Manager", "VT Leader", "VT Member"}


class _FakeLoginManager:
    def __init__(self, user):
        self.user = user


def _ensure_user(email):
    if not frappe.db.exists("User", email):
        frappe.get_doc({
            "doctype": "User", "email": email, "first_name": email.split("@")[0],
            "send_welcome_email": 0, "enabled": 1,
        }).insert(ignore_permissions=True)
    return email


class TestGrantDefaultRole(FrappeTestCase):
    def tearDown(self):
        frappe.set_user("Administrator")

    def test_grants_vt_member_to_roleless_user(self):
        user = _ensure_user("roleless_onboard@test.local")
        frappe.get_doc("User", user).remove_roles(*list(_VT_ROLES & set(frappe.get_roles(user))))
        grant_default_role(_FakeLoginManager(user))
        self.assertIn("VT Member", frappe.get_roles(user))

    def test_idempotent_when_already_has_vt_role(self):
        user = _ensure_user("hasleader_onboard@test.local")
        frappe.get_doc("User", user).add_roles("VT Leader")
        grant_default_role(_FakeLoginManager(user))
        roles = frappe.get_roles(user)
        self.assertNotIn("VT Member", roles)  # not granted because already has a VT role

    def test_skips_administrator(self):
        # Frappe's get_roles("Administrator") always returns ALL roles, so we
        # cannot use assertNotIn. Instead verify add_roles is never called.
        with patch.object(frappe, "get_doc") as mock_get_doc:
            grant_default_role(_FakeLoginManager("Administrator"))
            mock_get_doc.assert_not_called()  # function returned early, never touched User doc

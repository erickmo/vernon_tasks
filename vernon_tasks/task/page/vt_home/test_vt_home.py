# Tests for vt-home dashboard Page. Spec: docs/superpowers/specs/2026-05-30-dashboard-after-login-design.html
#
# VT Item tree migration (P4): the dashboard's quick-create ("Buat Proyek") and
# its navigation now target the unified VT Item tree — a Project is a VT Item
# node (node_type="Project") with owner_user/leader_user (was project_owner/
# project_leader), not the dead legacy VT Project doctype. vt_home.js is a pure
# presentation layer, so beyond the Page existence/role gating we assert that the
# exact node shape the migrated quick-create writes is valid against the live
# VT Item schema (would fail if a legacy doctype/field slipped back in).
import frappe
import unittest

PAGE_NAME = "vt-home"
EXPECTED_ROLES = {"VT Member", "VT Leader", "VT Manager"}

ITEM_DOCTYPE = "VT Item"
PROJECT_NODE_TYPE = "Project"
_FIXTURE_PROJECT_TITLE = "TEST-VT-HOME-PROJ"
_FIXTURE_BRAND = "TEST-VT-HOME-BRAND"
_FIXTURE_USER = "vt-home@test.local"


def _ensure_brand():
    # VT Item.brand links to VT Brand (a real doctype, not part of the merge).
    if not frappe.db.exists("VT Brand", _FIXTURE_BRAND):
        frappe.get_doc({
            "doctype": "VT Brand",
            "brand_name": _FIXTURE_BRAND,
        }).insert(ignore_permissions=True)
    return _FIXTURE_BRAND


def _ensure_user(email):
    if not frappe.db.exists("User", email):
        frappe.get_doc({
            "doctype": "User",
            "email": email,
            "first_name": email.split("@")[0],
            "send_welcome_email": 0,
            "enabled": 1,
        }).insert(ignore_permissions=True)
    return email


def _cleanup_projects():
    # NestedSet blocks deleting a parent before its children, so delete each
    # fixture project's whole subtree deepest-first (highest lft) then the root.
    for proj in frappe.get_all(
        ITEM_DOCTYPE,
        {"title": _FIXTURE_PROJECT_TITLE, "node_type": PROJECT_NODE_TYPE},
        ["name", "lft", "rgt"],
    ):
        descendants = frappe.get_all(
            ITEM_DOCTYPE,
            filters={"lft": [">", proj["lft"]], "rgt": ["<", proj["rgt"]]},
            fields=["name"],
            order_by="lft desc",
        )
        for d in descendants:
            frappe.delete_doc(ITEM_DOCTYPE, d["name"], force=True)
        frappe.delete_doc(ITEM_DOCTYPE, proj["name"], force=True)


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


class TestVtHomeQuickCreate(unittest.TestCase):
    """The dashboard's quick-create writes a VT Item Project node. Seed that
    exact node shape to prove the migrated fields are valid (no legacy fallback).
    """

    def setUp(self):
        frappe.set_user("Administrator")
        self.user = _ensure_user(_FIXTURE_USER)
        _cleanup_projects()

    def tearDown(self):
        frappe.set_user("Administrator")
        _cleanup_projects()

    def test_quick_create_project_shape_is_valid(self):
        # Mirrors vt_quick_create_project() in vt_home.js: a Project is a VT Item
        # node (node_type="Project") with owner_user/leader_user — NOT a legacy
        # VT Project with project_owner/project_leader.
        doc = frappe.get_doc({
            "doctype": ITEM_DOCTYPE,
            "node_type": PROJECT_NODE_TYPE,
            "title": _FIXTURE_PROJECT_TITLE,
            "brand": _ensure_brand(),
            "owner_user": self.user,
            "leader_user": self.user,
            "start_date": "2025-01-01",
            "end_date": "2025-01-31",
        })
        doc.insert(ignore_permissions=True)

        saved = frappe.get_doc(ITEM_DOCTYPE, doc.name)
        self.assertEqual(saved.node_type, PROJECT_NODE_TYPE)
        self.assertEqual(saved.owner_user, self.user)
        self.assertEqual(saved.leader_user, self.user)
        # The page routes to vt-project-detail with this node name after create.
        self.assertTrue(frappe.db.exists(ITEM_DOCTYPE, doc.name))

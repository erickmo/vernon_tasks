# Tests for vt-projects desk Page. Spec: docs/superpowers/specs/2026-05-30-vt-navbar-projects-design.html
#
# VT Item tree migration: a Project is a VT Item node (node_type="Project") on the
# single nested-set tree — the legacy "VT Project" doctype is DEAD to consumers.
# The page (vt_projects.js) is presentation only: it fetches project cards via the
# already-migrated vernon_tasks.task.api.dashboard.my_projects (reads VT Item nodes
# via the tree) and creates projects through frappe.new_doc("VT Item", {node_type:
# "Project"}). These tests assert the page metadata is intact and that the data the
# page renders is backed by VT Item Project nodes through the migrated read API.
import frappe
from frappe.tests.utils import FrappeTestCase

from vernon_tasks.task.api.dashboard import my_projects

PAGE_NAME = "vt-projects"
# Projects are VT Item nodes after the merge; this is the doctype the page's
# "Buat Proyek" action creates (frappe.new_doc("VT Item", {node_type:"Project"})).
PROJECT_DOCTYPE = "VT Item"
PROJECT_NODE_TYPE = "Project"
EXPECTED_ROLES = {"VT Member", "VT Leader", "VT Manager"}

_FIXTURE_BRAND = "TEST-VTPROJECTS-BRAND"
_FIXTURE_PROJECT_TITLE = "TEST-VTPROJECTS-PROJ"


def _ensure_brand():
    # VT Item.brand links to VT Brand (a real doctype, not part of the merge).
    if not frappe.db.exists("VT Brand", _FIXTURE_BRAND):
        frappe.get_doc({
            "doctype": "VT Brand",
            "brand_name": _FIXTURE_BRAND,
        }).insert(ignore_permissions=True)
    return _FIXTURE_BRAND


def _cleanup_projects():
    # NestedSet blocks deleting a parent before its children, so delete each
    # fixture project's whole subtree deepest-first (highest lft) then the root.
    for proj in frappe.get_all(
        PROJECT_DOCTYPE,
        {"title": _FIXTURE_PROJECT_TITLE, "node_type": PROJECT_NODE_TYPE},
        ["name", "lft", "rgt"],
    ):
        descendants = frappe.get_all(
            PROJECT_DOCTYPE,
            filters={"lft": [">", proj["lft"]], "rgt": ["<", proj["rgt"]]},
            fields=["name"],
            order_by="lft desc",
        )
        for d in descendants:
            frappe.delete_doc(PROJECT_DOCTYPE, d["name"], force=True)
        frappe.delete_doc(PROJECT_DOCTYPE, proj["name"], force=True)


class TestVtProjectsPage(FrappeTestCase):
    """Page metadata: existence, route name, role gating (unchanged by migration)."""

    def test_page_exists(self):
        self.assertTrue(frappe.db.exists("Page", PAGE_NAME))

    def test_page_route_name(self):
        page = frappe.get_doc("Page", PAGE_NAME)
        self.assertEqual(page.page_name, PAGE_NAME)

    def test_role_gating(self):
        page = frappe.get_doc("Page", PAGE_NAME)
        roles = {r.role for r in page.roles}
        self.assertEqual(roles, EXPECTED_ROLES)


class TestVtProjectsVtItemBacking(FrappeTestCase):
    """The page's project cards are backed by VT Item Project nodes.

    The "Buat Proyek" action creates VT Item nodes (node_type="Project"), and the
    card grid is fetched via the migrated my_projects API. Seed a Project node led
    by the current user, then assert the create target doctype is VT Item and the
    seeded node surfaces in the my_projects payload the page renders.
    """

    def setUp(self):
        frappe.set_user("Administrator")
        _cleanup_projects()
        self.project = frappe.get_doc({
            "doctype": PROJECT_DOCTYPE,
            "node_type": PROJECT_NODE_TYPE,
            "title": _FIXTURE_PROJECT_TITLE,
            "brand": _ensure_brand(),
            "owner_user": "Administrator",
            "leader_user": "Administrator",
            "health_status": "Open",
            "start_date": "2025-01-01",
            "end_date": "2025-12-31",
        })
        self.project.insert(ignore_permissions=True)

    def tearDown(self):
        frappe.set_user("Administrator")
        _cleanup_projects()

    def test_create_dialog_doctype_exists(self):
        # The page's "Buat Proyek" action targets VT Item (the merged doctype),
        # so the dialog has a real doctype to create.
        self.assertTrue(frappe.db.exists("DocType", PROJECT_DOCTYPE))

    def test_my_projects_surfaces_vt_item_node(self):
        # The card grid is fetched from the migrated my_projects API, which reads
        # VT Item Project nodes via the tree. The seeded node (led by Admin) must
        # appear as a card the page renders.
        data = my_projects()
        led_ids = {p["id"] for p in data.get("led", [])}
        member_ids = {p["id"] for p in data.get("member", [])}
        self.assertIn(self.project.name, led_ids | member_ids)

# Tests for vt-brand-detail desk Page (per-brand OKR surface).
#
# Unified hierarchy: an Objective is a VT Item node (node_type="OKR"); a Key Result
# is a "VT Item Key Result" child row on that node. The page reads the brand OKR
# payload via vernon_tasks.brand.api.brand_okr.get_brand_okr (already migrated to
# the VT Item tree) and routes objective create/edit through the VT Item form.
# These tests SEED VT Item nodes and assert the objective ids the page consumes
# (o.id, used for `set_route("Form", "VT Item", o.id)`) are real VT Item nodes.
import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import today

from vernon_tasks.brand.api import brand_okr

PAGE_NAME = "vt-brand-detail"
EXPECTED_ROLES = {"VT Member", "VT Leader", "VT Manager"}

VT_ITEM = "VT Item"
VT_BRAND = "VT Brand"
OKR_NODE_TYPE = "OKR"
TEST_BRAND = "TestVtBrandDetailPage-Z"


def _delete_brand_tree(brand: str) -> None:
	"""Delete every VT Item node owned by a brand, deepest-first.

	NestedSet blocks deleting a parent before its children, so descendants are
	removed in lft-desc order before their ancestors.
	"""
	roots = frappe.get_all(
		VT_ITEM, filters={"brand": brand, "parent_vt_item": ["is", "not set"]},
		fields=["name", "lft", "rgt"])
	for root in roots:
		descendants = frappe.get_all(
			VT_ITEM, filters={"lft": [">", root["lft"]], "rgt": ["<", root["rgt"]]},
			fields=["name"], order_by="lft desc")
		for d in descendants:
			frappe.delete_doc(VT_ITEM, d["name"], force=True, ignore_permissions=True)
		frappe.delete_doc(VT_ITEM, root["name"], force=True, ignore_permissions=True)
	for n in frappe.get_all(VT_ITEM, filters={"brand": brand},
			fields=["name"], order_by="lft desc"):
		frappe.delete_doc(VT_ITEM, n["name"], force=True, ignore_permissions=True)


class TestVtBrandDetailPage(FrappeTestCase):
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


class TestVtBrandDetailVtItemBacking(FrappeTestCase):
	"""The page's data flows through VT Item nodes via the migrated read API.

	Seeds an OKR-type VT Item node (the Objective) + a Key Result child row, then
	asserts the read payload the page renders carries VT Item node names as
	objective ids and surfaces the child-row Key Result.
	"""

	def setUp(self):
		frappe.set_user("Administrator")
		self._cleanup()
		frappe.get_doc({"doctype": VT_BRAND, "brand_name": TEST_BRAND}).insert(
			ignore_permissions=True)
		# Objective -> VT Item node_type="OKR" (the page's edit handler routes to
		# the VT Item form by this node's name; the page's create handler makes a
		# node of exactly this shape via frappe.new_doc("VT Item", {node_type:OKR}).
		self.okr = frappe.get_doc({
			"doctype": VT_ITEM, "node_type": OKR_NODE_TYPE, "title": "Detail Obj",
			"brand": TEST_BRAND, "period": "2026-Q2",
			"period_start": today(), "period_end": today(),
			"owner_user": "Administrator",
			"health_status": "Open", "pdca_phase": "PLAN"}).insert(ignore_permissions=True)
		# Key Result -> "VT Item Key Result" child row on the OKR node.
		self.okr.append("key_results", {
			"metric": "Signups", "target_value": 100, "current_value": 40})
		self.okr.save(ignore_permissions=True)

	def tearDown(self):
		self._cleanup()

	def _cleanup(self):
		_delete_brand_tree(TEST_BRAND)
		if frappe.db.exists(VT_BRAND, TEST_BRAND):
			frappe.delete_doc(VT_BRAND, TEST_BRAND, force=True, ignore_permissions=True)

	def test_objective_id_is_a_vt_item_node(self):
		# o.id (objective name in the read payload) MUST be a real VT Item OKR node,
		# because the page edits via frappe.set_route("Form", "VT Item", o.id).
		res = brand_okr.get_brand_okr(TEST_BRAND)
		objectives = [o for p in res["periods"] for o in p["objectives"]]
		self.assertEqual(len(objectives), 1)
		obj_id = objectives[0]["id"]
		self.assertEqual(obj_id, self.okr.name)
		self.assertTrue(frappe.db.exists(VT_ITEM, obj_id))
		self.assertEqual(
			frappe.db.get_value(VT_ITEM, obj_id, "node_type"), OKR_NODE_TYPE)

	def test_key_result_surfaces_from_vt_item_child_row(self):
		res = brand_okr.get_brand_okr(TEST_BRAND)
		objectives = [o for p in res["periods"] for o in p["objectives"]]
		krs = objectives[0]["key_results"]
		self.assertEqual(len(krs), 1)
		self.assertEqual(krs[0]["target"], 100.0)
		self.assertEqual(krs[0]["current"], 40.0)

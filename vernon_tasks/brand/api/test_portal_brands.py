import frappe
from frappe.tests.utils import FrappeTestCase

from vernon_tasks.brand.api import portal_brands

# VT Brand is independent of the VT Item tree, but the per-brand rollup walks the
# unified hierarchy: a Project node parents Sprint + Task nodes. Seed VT Item nodes
# (node_type="Project"/"Sprint"/"Task") — legacy VT Project/Sprint/Task are dead.
TEST_BRAND = "TestBrandAPI-X"
TEST_BRAND_2 = "TestBrandAPI-Y"
TEST_BRAND_EMPTY = "TestBrandAPI-Empty"

# A task is "done" when its terminal pdca_phase CLOSED maps to kanban_status "Done"
# (controller PDCA_KANBAN_MAP). DO maps to "In Progress" (open).
PHASE_OPEN = "DO"
PHASE_DONE = "CLOSED"


class TestPortalBrands(FrappeTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		for n in (TEST_BRAND, TEST_BRAND_2, TEST_BRAND_EMPTY):
			_purge_brand(n)

	def setUp(self):
		frappe.set_user("Administrator")

	def tearDown(self):
		# Brands can't be deleted while linked; tear down dependents first.
		# NestedSet blocks deleting a parent before its children, so drop the whole
		# Project subtree deepest-first (highest lft), then the brand.
		for n in (TEST_BRAND, TEST_BRAND_2, TEST_BRAND_EMPTY):
			_purge_brand(n)

	def _mk_project(self, brand: str) -> str:
		doc = frappe.get_doc({
			"doctype": "VT Item", "node_type": "Project",
			"title": f"Proj-{brand}", "brand": brand,
			"owner_user": "Administrator", "start_date": "2026-05-01",
			"end_date": "2026-05-31", "pdca_phase": "PLAN", "health_status": "Open",
		}).insert(ignore_permissions=True)
		return doc.name

	def _mk_task(self, project: str, phase: str, minutes: int) -> str:
		doc = frappe.get_doc({
			"doctype": "VT Item", "node_type": "Task",
			"title": f"T-{phase}-{minutes}", "parent_vt_item": project,
			"pdca_phase": phase, "estimated_minutes": minutes,
		}).insert(ignore_permissions=True)
		return doc.name

	def _mk_sprint(self, project: str, title: str) -> str:
		doc = frappe.get_doc({
			"doctype": "VT Item", "node_type": "Sprint",
			"title": title, "parent_vt_item": project,
			"sprint_state": "Active", "start_date": "2026-05-01",
			"end_date": "2026-05-14",
		}).insert(ignore_permissions=True)
		return doc.name

	def _row_for(self, brand: str) -> dict:
		rows = portal_brands.list_brands()
		return next(r for r in rows if r["id"] == brand)

	def test_list_includes_brand_stats(self):
		portal_brands.create_brand({"brand_name": TEST_BRAND})
		proj = self._mk_project(TEST_BRAND)
		self._mk_task(proj, PHASE_OPEN, 60)    # open (In Progress)
		self._mk_task(proj, PHASE_OPEN, 120)   # open
		self._mk_task(proj, PHASE_DONE, 60)    # done
		self._mk_sprint(proj, "S-1")

		row = self._row_for(TEST_BRAND)
		# total=240, remaining=180 (two DO), done=60 -> progress (240-180)/240 = 25%
		self.assertEqual(row["remaining_tasks"], 2)
		self.assertEqual(row["remaining_minutes"], 180)
		self.assertEqual(row["total_minutes"], 240)
		self.assertEqual(row["progress_pct"], 25)
		self.assertEqual(row["active_sprint_count"], 1)
		self.assertEqual(row["active_sprint_title"], "S-1")

	def test_cancelled_task_excluded(self):
		portal_brands.create_brand({"brand_name": TEST_BRAND})
		proj = self._mk_project(TEST_BRAND)
		task = self._mk_task(proj, PHASE_OPEN, 100)
		# Cancelled docs (docstatus=2) must drop out of every tally.
		frappe.db.set_value("VT Item", task, "docstatus", 2)

		row = self._row_for(TEST_BRAND)
		self.assertEqual(row["remaining_tasks"], 0)
		self.assertEqual(row["remaining_minutes"], 0)
		self.assertEqual(row["total_minutes"], 0)
		self.assertEqual(row["progress_pct"], 0)

	def test_progress_count_fallback_when_no_estimates(self):
		portal_brands.create_brand({"brand_name": TEST_BRAND})
		proj = self._mk_project(TEST_BRAND)
		self._mk_task(proj, PHASE_OPEN, 0)   # open, un-estimated
		self._mk_task(proj, PHASE_DONE, 0)   # done
		self._mk_task(proj, PHASE_DONE, 0)   # done

		row = self._row_for(TEST_BRAND)
		# total_minutes=0 -> fall back to done/total tasks = 2/3 = 67%
		self.assertEqual(row["total_minutes"], 0)
		self.assertEqual(row["remaining_tasks"], 1)
		self.assertEqual(row["progress_pct"], 67)

	def test_list_zero_stats_for_brand_without_projects(self):
		portal_brands.create_brand({"brand_name": TEST_BRAND})
		row = self._row_for(TEST_BRAND)
		self.assertEqual(row["remaining_tasks"], 0)
		self.assertEqual(row["total_minutes"], 0)
		self.assertEqual(row["progress_pct"], 0)
		self.assertEqual(row["active_sprint_count"], 0)
		self.assertIsNone(row["active_sprint_title"])

	def test_create_then_get(self):
		res = portal_brands.create_brand({"brand_name": TEST_BRAND, "description": "hi"})
		self.assertEqual(res["id"], TEST_BRAND)
		got = portal_brands.get_brand(TEST_BRAND)
		self.assertEqual(got["description"], "hi")

	def test_create_missing_name_raises(self):
		with self.assertRaises(frappe.ValidationError):
			portal_brands.create_brand({"description": "no name"})

	def test_list_filters_by_search(self):
		portal_brands.create_brand({"brand_name": TEST_BRAND})
		portal_brands.create_brand({"brand_name": TEST_BRAND_2})
		rows = portal_brands.list_brands(search="TestBrandAPI-X")
		names = [r["id"] for r in rows]
		self.assertIn(TEST_BRAND, names)
		self.assertNotIn(TEST_BRAND_2, names)

	def test_update_description(self):
		portal_brands.create_brand({"brand_name": TEST_BRAND})
		portal_brands.update_brand(TEST_BRAND, {"description": "changed"})
		self.assertEqual(
			frappe.db.get_value("VT Brand", TEST_BRAND, "description"), "changed"
		)

	def test_delete_blocked_when_linked_to_project(self):
		portal_brands.create_brand({"brand_name": TEST_BRAND})
		proj = frappe.get_doc({
			"doctype": "VT Item",
			"node_type": "Project",
			"title": "BrandLinkProj",
			"brand": TEST_BRAND,
			"owner_user": "Administrator",
			"start_date": "2026-05-01",
			"end_date": "2026-05-31",
			"pdca_phase": "PLAN",
			"health_status": "Open",
		}).insert(ignore_permissions=True)
		try:
			with self.assertRaises(frappe.ValidationError):
				portal_brands.delete_brand(TEST_BRAND)
		finally:
			proj.delete()

	def test_search_brands_returns_options(self):
		portal_brands.create_brand({"brand_name": TEST_BRAND})
		rows = portal_brands.search_brands(query="TestBrandAPI")
		self.assertTrue(any(r["id"] == TEST_BRAND for r in rows))

	def test_brand_execution_matches_stats_map_and_lists_projects(self):
		# PRD-brand | spec: 2026-06-06-brand-detail-informative
		# brand_execution(brand) must equal the per-brand slice of the list-endpoint
		# rollup (proves the numbers cannot drift) and must list the brand's projects.
		portal_brands.create_brand({"brand_name": TEST_BRAND})
		proj = self._mk_project(TEST_BRAND)
		self._mk_task(proj, PHASE_OPEN, 60)
		self._mk_task(proj, PHASE_OPEN, 120)
		self._mk_task(proj, PHASE_DONE, 60)
		self._mk_sprint(proj, "S-exec")

		exec_block = portal_brands.brand_execution(TEST_BRAND)
		map_slice = portal_brands._brand_stats_map().get(TEST_BRAND, portal_brands._zero_stats())

		self.assertEqual(exec_block["progress_pct"], map_slice["progress_pct"])
		self.assertEqual(exec_block["remaining_tasks"], map_slice["remaining_tasks"])
		self.assertEqual(exec_block["remaining_minutes"], map_slice["remaining_minutes"])
		self.assertEqual(exec_block["total_minutes"], map_slice["total_minutes"])
		self.assertEqual(exec_block["active_sprint_count"], map_slice["active_sprint_count"])
		self.assertEqual(exec_block["active_sprint_title"], map_slice["active_sprint_title"])

		self.assertGreaterEqual(exec_block["project_count"], 1)
		self.assertTrue(all({"id", "name", "progress"} <= set(p) for p in exec_block["projects"]))

	def test_brand_execution_empty_brand_is_zero(self):
		# A brand with no projects returns zeros + empty project list, never errors.
		portal_brands.create_brand({"brand_name": TEST_BRAND_EMPTY})
		block = portal_brands.brand_execution(TEST_BRAND_EMPTY)
		self.assertEqual(block["project_count"], 0)
		self.assertEqual(block["progress_pct"], 0)
		self.assertEqual(block["projects"], [])


def _purge_brand(brand: str) -> None:
	"""Delete a test brand and its VT Item subtree (Project -> Sprint/Task nodes).

	NestedSet rejects deleting a parent before its children, so each Project's
	subtree is removed deepest-first (highest lft) before the Project node, then
	the brand itself.
	"""
	for proj in frappe.get_all(
		"VT Item", filters={"node_type": "Project", "brand": brand}, pluck="name"
	):
		_delete_subtree(proj)
	if frappe.db.exists("VT Brand", brand):
		frappe.delete_doc("VT Brand", brand, force=True, ignore_permissions=True)


def _delete_subtree(project: str) -> None:
	"""Delete every descendant of `project` deepest-first, then `project` itself."""
	bounds = frappe.db.get_value("VT Item", project, ["lft", "rgt"], as_dict=True)
	if bounds:
		descendants = frappe.get_all(
			"VT Item",
			filters={"lft": [">", bounds.lft], "rgt": ["<", bounds.rgt]},
			fields=["name"],
			order_by="lft desc",
		)
		for d in descendants:
			frappe.delete_doc("VT Item", d["name"], force=True, ignore_permissions=True)
	frappe.delete_doc("VT Item", project, force=True, ignore_permissions=True)

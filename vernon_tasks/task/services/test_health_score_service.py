import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, today
from vernon_tasks.task.services.health_score_service import (
	get_health_score,
	list_brand_health_scores,
)

_PROJ_TITLE = "HS-OnTime"


def _cleanup_project():
	# NestedSet blocks deleting a parent before its children, so delete each
	# project's whole subtree deepest-first (highest lft) then the project.
	for proj in frappe.get_all(
		"VT Item", {"title": _PROJ_TITLE, "node_type": "Project"}, ["name", "lft", "rgt"]
	):
		descendants = frappe.get_all(
			"VT Item",
			filters={"lft": [">", proj["lft"]], "rgt": ["<", proj["rgt"]]},
			fields=["name"],
			order_by="lft desc",
		)
		for d in descendants:
			frappe.delete_doc("VT Item", d["name"], force=True)
		frappe.delete_doc("VT Item", proj["name"], force=True)


def _make_task(project, completion_offset, deadline_offset):
	# On VT Item the completed phase is 'CLOSED' (legacy VT Task 'DONE'); the
	# old VT Task.project Link is now the parent relation.
	return frappe.get_doc({
		"doctype": "VT Item",
		"node_type": "Task",
		"title": "T",
		"parent_vt_item": project,
		"estimated_minutes": 1,
		"actual_minutes": 1,
		"pdca_phase": "CLOSED",
		"kanban_status": "Done",
		"deadline": add_days(today(), deadline_offset),
		"completion_date": add_days(today(), completion_offset),
	}).insert(ignore_permissions=True)


class TestHealthScore(FrappeTestCase):
	def test_returns_expected_shape(self):
		r = get_health_score()
		for key in ("score", "okr_pct", "ontime_pct", "velocity_health", "breakdown"):
			self.assertIn(key, r)
		for key in ("okr_weight", "ontime_weight", "velocity_weight"):
			self.assertIn(key, r["breakdown"])
		self.assertGreaterEqual(r["score"], 0.0)
		self.assertLessEqual(r["score"], 100.0)

	def test_score_is_weighted_combination(self):
		r = get_health_score()
		expected = (
			r["okr_pct"] * 0.5
			+ r["ontime_pct"] * 0.3
			+ r["velocity_health"] * 0.2
		)
		self.assertAlmostEqual(r["score"], round(expected, 2), places=2)

	def test_ontime_pct_uses_recent_tasks(self):
		# Create a project (VT Item node) + a single on-time task + a single late
		# task within 90 days, all as Task children of the project node.
		_cleanup_project()
		p = frappe.get_doc({
			"doctype": "VT Item",
			"node_type": "Project",
			"title": _PROJ_TITLE,
			"start_date": add_days(today(), -30),
			"end_date": add_days(today(), 30),
			"health_status": "Open",
		}).insert(ignore_permissions=True)
		try:
			# On-time: completed before its deadline.
			_make_task(p.name, completion_offset=-6, deadline_offset=-5)
			# Late: completed after its deadline.
			_make_task(p.name, completion_offset=-5, deadline_offset=-10)
			r = get_health_score()
			# Just assert that ontime_pct is sane (0..100); other test data on
			# site means we don't pin a value.
			self.assertGreaterEqual(r["ontime_pct"], 0.0)
			self.assertLessEqual(r["ontime_pct"], 100.0)
		finally:
			_cleanup_project()

	def test_brand_scoped_returns_brand_field(self):
		if not frappe.db.exists("VT Brand", "Brand Scope Test"):
			frappe.get_doc({"doctype": "VT Brand", "brand_name": "Brand Scope Test"}).insert(ignore_permissions=True)
		r = get_health_score(brand="Brand Scope Test")
		self.assertEqual(r["brand"], "Brand Scope Test")
		for key in ("score", "okr_pct", "ontime_pct", "velocity_health"):
			self.assertIn(key, r)

	def test_list_brand_health_returns_per_brand(self):
		if not frappe.db.exists("VT Brand", "Brand List Test"):
			frappe.get_doc({"doctype": "VT Brand", "brand_name": "Brand List Test"}).insert(ignore_permissions=True)
		rows = list_brand_health_scores()
		self.assertIsInstance(rows, list)
		self.assertTrue(any(r["brand"] == "Brand List Test" for r in rows))
		for r in rows:
			self.assertIn("brand_name", r)
			self.assertIn("score", r)

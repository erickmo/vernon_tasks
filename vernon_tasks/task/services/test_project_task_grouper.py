import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, today

from vernon_tasks.task.services.project_task_grouper import group_tasks

_PROJ_TITLE = "PTG-Proj"
_OKR_TITLE = "PTG-OKR"


def _cleanup():
	# NestedSet blocks deleting a parent before its children, so delete each
	# tree's whole subtree deepest-first (highest lft) then the root node.
	roots = frappe.get_all(
		"VT Item",
		filters={"title": ["in", [_PROJ_TITLE, _OKR_TITLE]], "parent_vt_item": ["in", ["", None]]},
		fields=["name", "lft", "rgt"],
	)
	for root in roots:
		descendants = frappe.get_all(
			"VT Item",
			filters={"lft": [">", root["lft"]], "rgt": ["<", root["rgt"]]},
			fields=["name"],
			order_by="lft desc",
		)
		for d in descendants:
			frappe.delete_doc("VT Item", d["name"], force=True)
		frappe.delete_doc("VT Item", root["name"], force=True)


def _make(node_type, title, parent=None, **fields):
	doc = frappe.get_doc({
		"doctype": "VT Item",
		"node_type": node_type,
		"title": title,
		"parent_vt_item": parent,
		**fields,
	})
	doc.insert(ignore_permissions=True)
	return doc


class TestProjectTaskGrouper(FrappeTestCase):
	def test_invalid_group_by_raises(self):
		with self.assertRaises(ValueError):
			group_tasks(project_id="X", group_by="evil")

	def test_group_by_kr_buckets_unlinked(self):
		# Empty/unknown project still returns a list shape (no KR ancestor,
		# no tasks → no buckets).
		result = group_tasks(project_id="nonexistent", group_by="kr")
		self.assertIsInstance(result, list)
		if result:
			self.assertIn("key", result[0])
			self.assertIn("tasks", result[0])


class TestProjectTaskGrouperSeeded(FrappeTestCase):
	def setUp(self):
		_cleanup()
		# OKR with two KRs; Project hangs under the OKR so its KRs are reachable.
		self.okr = _make("OKR", _OKR_TITLE, period="2026-Q2")
		self.okr.append("key_results", {
			"metric": "Revenue", "target_value": 100, "current_value": 40,
			"progress_percent": 40, "unit": "%",
		})
		self.okr.append("key_results", {
			"metric": "NPS", "target_value": 50, "current_value": 25,
			"progress_percent": 50, "unit": "%",
		})
		self.okr.save(ignore_permissions=True)

		self.project = _make("Project", _PROJ_TITLE, parent=self.okr.name, health_status="Open")
		self.sprint = _make("Sprint", "PTG-S1", parent=self.project.name, sprint_state="Active")

		# Task directly under the project (no sprint), assigned to Administrator,
		# overdue, PLAN phase, 7 points via leader override.
		self.t_proj = _make(
			"Task", "PTG-Direct", parent=self.project.name,
			pdca_phase="PLAN", owner_user="Administrator",
			deadline=add_days(today(), -3), kanban_status="In Progress",
			base_points=3, earned_points=5, leader_override_points=7,
			override_reason="demo override", risk_flag="late",
		)
		# Task nested under the sprint, unassigned, DO phase, no deadline.
		# Only base_points is set; earned/override default to 0 (Int columns),
		# so COALESCE(override, earned, base, 0) yields 0 — same as legacy.
		self.t_sprint = _make(
			"Task", "PTG-Sprint", parent=self.sprint.name,
			pdca_phase="DO", kanban_status="Backlog",
			base_points=5,
		)

	def tearDown(self):
		_cleanup()

	def _all_task_ids(self, buckets):
		ids = []
		for b in buckets:
			ids.extend(tk["id"] for tk in b["tasks"])
		return ids

	def test_descendants_span_project_and_sprint_tasks(self):
		# Both the project-direct task and the sprint-nested task load.
		buckets = group_tasks(self.project.name, "pdca")
		ids = self._all_task_ids(buckets)
		self.assertIn(self.t_proj.name, ids)
		self.assertIn(self.t_sprint.name, ids)
		self.assertEqual(len(ids), 2)

	def test_group_by_pdca_buckets_by_phase(self):
		buckets = group_tasks(self.project.name, "pdca")
		by_key = {b["key"]: b for b in buckets}
		self.assertIn("PLAN", by_key)
		self.assertIn("DO", by_key)
		self.assertEqual(by_key["PLAN"]["tasks"][0]["id"], self.t_proj.name)
		self.assertEqual(by_key["DO"]["tasks"][0]["id"], self.t_sprint.name)

	def test_points_coalesce_matches_legacy(self):
		# COALESCE(leader_override, earned, base, 0) over Int columns that
		# default to 0: override (7) wins for t_proj; for t_sprint earned
		# defaults to 0 and wins over base — faithful to the legacy SQL.
		buckets = group_tasks(self.project.name, "pdca")
		rows = {tk["id"]: tk for b in buckets for tk in b["tasks"]}
		self.assertEqual(rows[self.t_proj.name]["points"], 7)
		self.assertEqual(rows[self.t_sprint.name]["points"], 0)

	def test_group_by_sprint_uses_ancestor_sprint(self):
		buckets = group_tasks(self.project.name, "sprint")
		by_key = {b["key"]: b for b in buckets}
		# Sprint-nested task buckets under the Sprint node name.
		self.assertIn(self.sprint.name, by_key)
		self.assertEqual(by_key[self.sprint.name]["tasks"][0]["id"], self.t_sprint.name)
		# Project-direct task buckets under "No Sprint".
		self.assertIn("__no_sprint__", by_key)
		self.assertEqual(by_key["__no_sprint__"]["label"], "No Sprint")
		self.assertEqual(by_key["__no_sprint__"]["tasks"][0]["id"], self.t_proj.name)

	def test_group_by_assignee_renames_owner_user(self):
		buckets = group_tasks(self.project.name, "assignee")
		by_key = {b["key"]: b for b in buckets}
		self.assertIn("Administrator", by_key)
		self.assertEqual(by_key["Administrator"]["tasks"][0]["id"], self.t_proj.name)
		self.assertIn("__unassigned__", by_key)
		self.assertEqual(by_key["__unassigned__"]["label"], "Unassigned")

	def test_group_by_due_overdue_and_no_date(self):
		buckets = group_tasks(self.project.name, "due")
		by_key = {b["key"]: b for b in buckets}
		self.assertIn("overdue", by_key)
		self.assertEqual(by_key["overdue"]["tasks"][0]["id"], self.t_proj.name)
		self.assertIn("no_date", by_key)
		self.assertEqual(by_key["no_date"]["tasks"][0]["id"], self.t_sprint.name)

	def test_group_by_kr_meta_from_okr_ancestor(self):
		# Every task is unlinked, but kr_meta resolves the OKR ancestor's KRs.
		buckets = group_tasks(self.project.name, "kr")
		self.assertEqual(len(buckets), 1)
		self.assertEqual(buckets[0]["key"], "__unlinked__")
		self.assertEqual(buckets[0]["label"], "Unlinked")
		self.assertEqual(len(buckets[0]["tasks"]), 2)

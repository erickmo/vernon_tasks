import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, today
from vernon_tasks.task.services.velocity_service import (
	get_sprint_velocity,
	get_velocity_trend,
)

_PROJ_TITLE = "Test-Proj-Vel"
_EMPTY_TITLE = "Empty-Proj-Vel"
_TITLES = (_PROJ_TITLE, _EMPTY_TITLE)


def _cleanup():
	# NestedSet blocks deleting a parent before its children, so delete each
	# project's whole subtree deepest-first (highest lft) then the project.
	for title in _TITLES:
		for proj in frappe.get_all(
			"VT Item", {"title": title, "node_type": "Project"}, ["name", "lft", "rgt"]
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


def _make_project(title=_PROJ_TITLE):
	return frappe.get_doc({
		"doctype": "VT Item",
		"node_type": "Project",
		"title": title,
		"start_date": add_days(today(), -60),
		"end_date": add_days(today(), 60),
		"health_status": "Open",
	}).insert(ignore_permissions=True)


def _make_sprint(project, idx, start_offset):
	return frappe.get_doc({
		"doctype": "VT Item",
		"node_type": "Sprint",
		"title": f"S{idx}",
		"parent_vt_item": project,
		"start_date": add_days(today(), start_offset),
		"end_date": add_days(today(), start_offset + 13),
		"sprint_state": "Closed",
	}).insert(ignore_permissions=True)


def _make_task(sprint, hours, completion_offset, phase="CLOSED"):
	# On VT Item the completed phase is 'CLOSED' (legacy VT Task 'DONE').
	done = phase == "CLOSED"
	return frappe.get_doc({
		"doctype": "VT Item",
		"node_type": "Task",
		"title": "T",
		"parent_vt_item": sprint,
		"estimated_minutes": hours,
		"actual_minutes": hours,
		"completion_date": add_days(today(), completion_offset) if done else None,
		"pdca_phase": phase,
		"kanban_status": "Done" if done else "Backlog",
	}).insert(ignore_permissions=True)


class TestVelocityService(FrappeTestCase):
	def setUp(self):
		_cleanup()
		self.project = _make_project()
		self.s1 = _make_sprint(self.project.name, 1, -42)
		self.s2 = _make_sprint(self.project.name, 2, -28)
		self.s3 = _make_sprint(self.project.name, 3, -14)
		_make_task(self.s1.name, 10, -32)
		_make_task(self.s1.name, 5, -30)  # 15 total
		_make_task(self.s2.name, 8, -18)  # 8 total
		_make_task(self.s3.name, 12, -4)  # 12 total
		_make_task(self.s3.name, 7, -10, phase="DO")  # excluded

	def tearDown(self):
		_cleanup()

	def test_sprint_velocity_sums_done_actual_hours(self):
		self.assertEqual(get_sprint_velocity(self.s1.name), 15.0)
		self.assertEqual(get_sprint_velocity(self.s2.name), 8.0)
		self.assertEqual(get_sprint_velocity(self.s3.name), 12.0)

	def test_velocity_trend_returns_last_n_closed_sprints_in_order(self):
		result = get_velocity_trend(self.project.name, n=6)
		self.assertEqual(result["velocity"], [15.0, 8.0, 12.0])
		self.assertEqual(result["sprints"], [self.s1.name, self.s2.name, self.s3.name])
		self.assertAlmostEqual(result["avg"], (15 + 8 + 12) / 3)

	def test_trend_pct_first_to_last(self):
		result = get_velocity_trend(self.project.name, n=6)
		self.assertAlmostEqual(result["trend_pct"], (12 - 15) / 15 * 100)

	def test_velocity_trend_empty(self):
		empty = _make_project(_EMPTY_TITLE)
		result = get_velocity_trend(empty.name, n=6)
		self.assertEqual(result["velocity"], [])
		self.assertEqual(result["avg"], 0.0)
		self.assertEqual(result["trend_pct"], 0.0)

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, today
from vernon_tasks.task.services.forecast_service import get_forecast

# Project nodes used by these tests (cleaned up subtree-first between runs).
_TITLES = ("FC-Few", "FC-Even", "FC-Stable", "FC-Range")


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


def _setup_project(name, sprint_velocities, remaining_hours, sprint_len=14):
	"""Seed a Project VT Item with closed Sprint children, each carrying a
	completed (CLOSED) Task whose actual_minutes is the sprint velocity, plus
	one open (DO) remaining-work Task directly under the project.

	On VT Item the legacy VT Sprint/VT Task Link to project/sprint is the
	parent relation; VT Sprint.status→sprint_state, the done phase 'DONE'→
	'CLOSED'. estimated_minutes/actual_minutes/pdca_phase keep their names.
	"""
	project = frappe.get_doc({
		"doctype": "VT Item",
		"node_type": "Project",
		"title": name,
		"start_date": add_days(today(), -180),
		"end_date": add_days(today(), 180),
		"health_status": "Open",
	}).insert(ignore_permissions=True)
	for idx, v in enumerate(sprint_velocities):
		offset = -((len(sprint_velocities) - idx) * sprint_len)
		sprint = frappe.get_doc({
			"doctype": "VT Item",
			"node_type": "Sprint",
			"title": f"FC-{name}-{idx}",
			"parent_vt_item": project.name,
			"start_date": add_days(today(), offset),
			"end_date": add_days(today(), offset + sprint_len - 1),
			"sprint_state": "Closed",
		}).insert(ignore_permissions=True)
		if v > 0:
			frappe.get_doc({
				"doctype": "VT Item",
				"node_type": "Task",
				"title": "T",
				"parent_vt_item": sprint.name,
				"estimated_minutes": v,
				"actual_minutes": v,
				"completion_date": add_days(today(), offset + 1),
				"pdca_phase": "CLOSED",
				"kanban_status": "Done",
			}).insert(ignore_permissions=True)
	if remaining_hours > 0:
		frappe.get_doc({
			"doctype": "VT Item",
			"node_type": "Task",
			"title": "Remain",
			"parent_vt_item": project.name,
			"estimated_minutes": remaining_hours,
			"actual_minutes": 0,
			"pdca_phase": "DO",
			"kanban_status": "Backlog",
		}).insert(ignore_permissions=True)
	return project


class TestForecastService(FrappeTestCase):
	def setUp(self):
		_cleanup()

	def tearDown(self):
		_cleanup()

	def test_insufficient_data_under_three_sprints(self):
		project = _setup_project("FC-Few", [10, 12], remaining_hours=20)
		result = get_forecast(project.name)
		self.assertTrue(result["insufficient_data"])
		self.assertEqual(result["sprints_needed"], 1)

	def test_predicted_end_uses_avg_velocity(self):
		project = _setup_project("FC-Even", [10, 10, 10], remaining_hours=30)
		result = get_forecast(project.name)
		self.assertFalse(result.get("insufficient_data"))
		self.assertAlmostEqual(result["avg_velocity"], 10.0)
		self.assertEqual(result["remaining_hours"], 30.0)
		self.assertEqual(result["sprints_used"], 3)

	def test_confidence_high_when_stdev_low(self):
		project = _setup_project("FC-Stable", [10, 10, 10, 10], remaining_hours=10)
		result = get_forecast(project.name)
		self.assertGreaterEqual(result["confidence"], 0.95)

	def test_pmin_after_predicted_after_pmax(self):
		project = _setup_project("FC-Range", [5, 10, 15], remaining_hours=30)
		result = get_forecast(project.name)
		from frappe.utils import getdate
		self.assertGreaterEqual(getdate(result["p_min"]), getdate(result["predicted_end"]))
		self.assertLessEqual(getdate(result["p_max"]), getdate(result["predicted_end"]))

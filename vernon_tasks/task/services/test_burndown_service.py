import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, today, getdate
from vernon_tasks.task.services.burndown_service import get_burndown

_PROJ_TITLE = "BD-Proj"


def _cleanup():
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


def _make_project():
	return frappe.get_doc({
		"doctype": "VT Item",
		"node_type": "Project",
		"title": _PROJ_TITLE,
		"start_date": add_days(today(), -10),
		"end_date": add_days(today(), 10),
		"health_status": "Open",
	}).insert(ignore_permissions=True)


def _make_sprint(project):
	# 5-day sprint starting 4 days ago
	return frappe.get_doc({
		"doctype": "VT Item",
		"node_type": "Sprint",
		"title": "BD-S1",
		"parent_vt_item": project,
		"start_date": add_days(today(), -4),
		"end_date": add_days(today(), 0),
		"sprint_state": "Active",
	}).insert(ignore_permissions=True)


def _make_task(sprint, estimated, completion_offset):
	done = completion_offset is not None
	return frappe.get_doc({
		"doctype": "VT Item",
		"node_type": "Task",
		"title": "T" if estimated else "U",
		"parent_vt_item": sprint,
		"estimated_minutes": estimated,
		"actual_minutes": estimated,
		"completion_date": add_days(today(), completion_offset) if done else None,
		# On VT Item the legacy VT Task done phase ("DONE") is "CLOSED".
		"pdca_phase": "CLOSED" if done else "DO",
		"kanban_status": "Done" if done else "In Progress",
	}).insert(ignore_permissions=True)


class TestBurndownService(FrappeTestCase):
	def setUp(self):
		_cleanup()
		self.project = _make_project()
		self.sprint = _make_sprint(self.project.name)
		# 3 tasks, 10h each = 30h total
		for offset in (-2, -1, None):
			_make_task(self.sprint.name, 10, offset)
		# Unestimated task
		_make_task(self.sprint.name, 0, None)

	def tearDown(self):
		_cleanup()

	def test_labels_cover_sprint_window_inclusive(self):
		result = get_burndown(self.sprint.name)
		self.assertEqual(len(result["labels"]), 5)
		self.assertEqual(result["labels"][0], str(getdate(add_days(today(), -4))))
		self.assertEqual(result["labels"][-1], str(getdate(today())))

	def test_ideal_starts_at_total_ends_at_zero(self):
		result = get_burndown(self.sprint.name)
		self.assertEqual(result["ideal"][0], 30.0)
		self.assertEqual(result["ideal"][-1], 0.0)

	def test_remaining_decreases_as_tasks_complete(self):
		result = get_burndown(self.sprint.name)
		self.assertEqual(result["remaining"][0], 30.0)
		self.assertEqual(result["remaining"][-1], 10.0)

	def test_unestimated_count(self):
		result = get_burndown(self.sprint.name)
		self.assertEqual(result["unestimated_count"], 1)

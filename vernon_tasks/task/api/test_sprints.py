import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, today

from vernon_tasks.task.api import sprints

_PROJ_TITLE = "SPRINTS-API-Proj"


def _cleanup():
	# NestedSet blocks deleting a parent before its children, so delete each
	# project's whole subtree deepest-first (highest lft) then the project.
	for proj in frappe.get_all(
		"VT Item",
		{"title": _PROJ_TITLE, "node_type": "Project"},
		["name", "lft", "rgt"],
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


def _make_sprint(project, start_offset, end_offset):
	return frappe.get_doc({
		"doctype": "VT Item",
		"node_type": "Sprint",
		"title": "SP1",
		"parent_vt_item": project,
		"start_date": add_days(today(), start_offset),
		"end_date": add_days(today(), end_offset),
		"sprint_state": "Active",
	}).insert(ignore_permissions=True)


def _make_task(sprint, done):
	# Controller derives kanban_status from pdca_phase; "DONE" → "CLOSED".
	return frappe.get_doc({
		"doctype": "VT Item",
		"node_type": "Task",
		"title": "T",
		"parent_vt_item": sprint,
		"pdca_phase": "CLOSED" if done else "DO",
	}).insert(ignore_permissions=True)


class TestSprintsGetBurndown(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		_cleanup()

	def tearDown(self):
		_cleanup()

	def test_get_burndown_nonexistent_raises(self):
		with self.assertRaises(frappe.DoesNotExistError):
			sprints.get_burndown("nonexistent-sprint-id")

	def test_get_burndown_no_schedule_returns_empty(self):
		project = _make_project()
		sprint = frappe.get_doc({
			"doctype": "VT Item",
			"node_type": "Sprint",
			"title": "SP1",
			"parent_vt_item": project.name,
			"sprint_state": "Active",
		}).insert(ignore_permissions=True)
		self.assertEqual(sprints.get_burndown(sprint.name), [])

	def test_get_burndown_no_tasks_returns_empty(self):
		project = _make_project()
		sprint = _make_sprint(project.name, -4, 0)
		self.assertEqual(sprints.get_burndown(sprint.name), [])

	def test_get_burndown_shape_and_counts(self):
		project = _make_project()
		# 5-day window: 4 days ago → today inclusive = 5 points.
		sprint = _make_sprint(project.name, -4, 0)
		_make_task(sprint.name, done=True)
		_make_task(sprint.name, done=False)
		_make_task(sprint.name, done=False)

		result = sprints.get_burndown(sprint.name)

		# Inclusive window: total_days+1 points.
		self.assertEqual(len(result), 5)
		first, last = result[0], result[-1]
		self.assertEqual(set(first.keys()), {"date", "ideal", "actual"})
		# Ideal burns linearly from total (3) to 0.
		self.assertEqual(first["ideal"], 3.0)
		self.assertEqual(last["ideal"], 0.0)
		# Today's actual = open task count (2 non-Done).
		self.assertEqual(last["actual"], 2.0)
		# Past days fall back to total task count.
		self.assertEqual(first["actual"], 3.0)

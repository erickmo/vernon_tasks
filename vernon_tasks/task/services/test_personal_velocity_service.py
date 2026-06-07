import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, today
from vernon_tasks.task.services.personal_velocity_service import get_personal_velocity

# On VT Item the legacy VT Task done phase ("DONE") is the unified completion
# phase "CLOSED"; the per-task assignee Link assigned_to→owner_user.
_PROJ_TITLE = "PV-Proj"
_EMPTY_TITLE = "PV-Empty"
_TITLES = (_PROJ_TITLE, _EMPTY_TITLE)
_ME = "pv-me@x.com"
_OTHER = "pv-other@x.com"


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


def _ensure_users():
	for email in (_ME, _OTHER):
		if not frappe.db.exists("User", email):
			frappe.get_doc({
				"doctype": "User", "email": email, "first_name": "T",
				"send_welcome_email": 0, "enabled": 1,
			}).insert(ignore_permissions=True)


def _make_project(title=_PROJ_TITLE):
	return frappe.get_doc({
		"doctype": "VT Item",
		"node_type": "Project",
		"title": title,
		"start_date": add_days(today(), -60),
		"end_date": add_days(today(), 30),
		"health_status": "Open",
	}).insert(ignore_permissions=True)


def _make_sprint(project, idx, start_offset):
	return frappe.get_doc({
		"doctype": "VT Item",
		"node_type": "Sprint",
		"title": f"PV-S{idx}",
		"parent_vt_item": project,
		"start_date": add_days(today(), start_offset),
		"end_date": add_days(today(), start_offset + 13),
		"sprint_state": "Closed",
	}).insert(ignore_permissions=True)


def _make_task(sprint, user, hours, completion_offset):
	frappe.get_doc({
		"doctype": "VT Item",
		"node_type": "Task",
		"title": "T",
		"parent_vt_item": sprint,
		"owner_user": user,
		"estimated_minutes": hours,
		"actual_minutes": hours,
		"pdca_phase": "CLOSED",
		"kanban_status": "Done",
		"completion_date": add_days(today(), completion_offset + 2),
	}).insert(ignore_permissions=True)


class TestPersonalVelocity(FrappeTestCase):
	def setUp(self):
		_cleanup()
		_ensure_users()
		self.project = _make_project()
		self.s1 = _make_sprint(self.project.name, 1, -28)
		self.s2 = _make_sprint(self.project.name, 2, -14)
		_make_task(self.s1.name, _ME, 10, -28)
		_make_task(self.s1.name, _OTHER, 20, -28)
		_make_task(self.s2.name, _ME, 6, -14)
		_make_task(self.s2.name, _OTHER, 10, -14)

	def tearDown(self):
		_cleanup()

	def test_personal_vs_team_avg(self):
		r = get_personal_velocity(_ME, self.project.name, n=6)
		self.assertEqual(r["personal"], [10.0, 6.0])
		self.assertEqual(r["team_avg"], [15.0, 8.0])
		self.assertAlmostEqual(r["avg"], 8.0)
		self.assertAlmostEqual(r["team_avg_total"], 11.5)

	def test_empty_project(self):
		p = _make_project(_EMPTY_TITLE)
		r = get_personal_velocity(_ME, p.name)
		self.assertEqual(r["personal"], [])
		self.assertEqual(r["avg"], 0.0)

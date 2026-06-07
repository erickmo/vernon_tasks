import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, today
from vernon_tasks.task.services.streak_service import get_streak

_PROJ_TITLE = "SK-Proj"
_EMPTY_TITLE = "SK-Empty"
_TITLES = (_PROJ_TITLE, _EMPTY_TITLE)
_USER = "sk-me@x.com"


def _ensure_user():
	if not frappe.db.exists("User", _USER):
		frappe.get_doc({
			"doctype": "User", "email": _USER,
			"first_name": "T", "send_welcome_email": 0, "enabled": 1,
		}).insert(ignore_permissions=True)
	return _USER


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
		"start_date": add_days(today(), -120),
		"end_date": add_days(today(), 30),
		"health_status": "Open",
	}).insert(ignore_permissions=True)


def _make_sprint(project, idx, start_offset):
	return frappe.get_doc({
		"doctype": "VT Item",
		"node_type": "Sprint",
		"title": f"SK-S{idx}",
		"parent_vt_item": project,
		"start_date": add_days(today(), start_offset),
		"end_date": add_days(today(), start_offset + 13),
		"sprint_state": "Closed",
	}).insert(ignore_permissions=True)


def _make_task(sprint, user_hrs, completion_offset):
	# On VT Item the completed phase is 'CLOSED' (legacy VT Task 'DONE').
	return frappe.get_doc({
		"doctype": "VT Item",
		"node_type": "Task",
		"title": "T",
		"parent_vt_item": sprint,
		"owner_user": _USER,
		"estimated_minutes": user_hrs,
		"actual_minutes": user_hrs,
		"pdca_phase": "CLOSED",
		"kanban_status": "Done",
		"completion_date": add_days(today(), completion_offset),
	}).insert(ignore_permissions=True)


class TestStreak(FrappeTestCase):
	def setUp(self):
		_ensure_user()
		_cleanup()
		self.project = _make_project()

		def _s(idx, off, user_hrs):
			s = _make_sprint(self.project.name, idx, off)
			if user_hrs > 0:
				_make_task(s.name, user_hrs, off + 2)
			return s

		_s(1, -84, 0)   # gap (oldest)
		_s(2, -56, 4)
		_s(3, -28, 6)
		_s(4, -14, 8)   # newest

	def tearDown(self):
		_cleanup()

	def test_streak_three(self):
		r = get_streak(_USER, self.project.name)
		self.assertEqual(r["streak"], 3)
		self.assertEqual(r["sprints_checked"], 4)

	def test_no_sprints(self):
		p = _make_project(_EMPTY_TITLE)
		r = get_streak(_USER, p.name)
		self.assertEqual(r["streak"], 0)
		self.assertEqual(r["sprints_checked"], 0)

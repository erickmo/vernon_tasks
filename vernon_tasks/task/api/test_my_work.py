import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_tasks.task.api.my_work import list as my_work_list, detail

# Tasks live in the unified VT Item tree: a Project node parents Task nodes.
_FIXTURE_PROJECT_TITLE = "TEST-MY-WORK-PROJ"


def _ensure_project():
	existing = frappe.db.get_value(
		"VT Item", {"title": _FIXTURE_PROJECT_TITLE, "node_type": "Project"}, "name"
	)
	if existing:
		return existing
	return frappe.get_doc({
		"doctype": "VT Item",
		"node_type": "Project",
		"title": _FIXTURE_PROJECT_TITLE,
		"owner_user": "Administrator",
		"start_date": "2025-01-01",
		"end_date": "2025-12-31",
		"health_status": "Open",
	}).insert(ignore_permissions=True).name


def _ensure_user(email):
	if not frappe.db.exists("User", email):
		frappe.get_doc({
			"doctype": "User",
			"email": email,
			"first_name": email.split("@")[0],
			"send_welcome_email": 0,
			"enabled": 1,
			"roles": [{"role": "VT Member"}],
		}).insert(ignore_permissions=True)
	return email


def _clear_project_tasks(project):
	# NestedSet blocks deleting a parent before its children; tasks are leaves
	# directly under the project, so deepest-first (highest lft) is safe.
	for t in frappe.get_all(
		"VT Item",
		filters={"parent_vt_item": project, "node_type": "Task"},
		fields=["name"],
		order_by="lft desc",
	):
		frappe.delete_doc("VT Item", t["name"], force=True)


class TestMyWork(FrappeTestCase):
	def setUp(self):
		self.user_a = _ensure_user("a-mywork@test.local")
		self.user_b = _ensure_user("b-mywork@test.local")
		self.project = _ensure_project()
		_clear_project_tasks(self.project)

	def tearDown(self):
		frappe.set_user("Administrator")

	def _make_task(self, owner, deadline, title="T"):
		return frappe.get_doc({
			"doctype": "VT Item",
			"node_type": "Task",
			"title": title,
			"deadline": deadline,
			"owner_user": owner,
			"parent_vt_item": self.project,
		}).insert(ignore_permissions=True)

	def test_list_groups_correctly(self):
		frappe.set_user(self.user_a)
		today = frappe.utils.today()
		self._make_task(self.user_a, frappe.utils.add_days(today, -2), "old")
		self._make_task(self.user_a, today, "now")
		self._make_task(self.user_a, frappe.utils.add_days(today, 3), "soon")
		result = my_work_list()
		self.assertEqual(len(result["overdue"]), 1)
		self.assertEqual(len(result["today"]), 1)
		self.assertEqual(len(result["upcoming"]), 1)

	def test_detail_rejects_other_user(self):
		frappe.set_user("Administrator")
		task = self._make_task(self.user_a, frappe.utils.today())
		frappe.set_user(self.user_b)
		with self.assertRaises(frappe.PermissionError):
			detail(task.name)

	def test_detail_returns_expected_keys(self):
		frappe.set_user("Administrator")
		task = self._make_task(self.user_a, frappe.utils.today(), "Detail Test")
		frappe.set_user(self.user_a)
		result = detail(task.name)
		for key in ("id", "title", "status", "priority", "due_date", "project", "points", "description", "activity"):
			self.assertIn(key, result)
		self.assertIsNone(result["description"])
		self.assertIsInstance(result["activity"], list)

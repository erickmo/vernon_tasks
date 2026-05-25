"""Tests for VT Sprint + Sprint Task child."""
import frappe
from frappe.tests.utils import FrappeTestCase

from vernon_tasks.project.doctype.vt_sprint.vt_sprint import SPRINT_TITLE_MAX_LEN

OWNER_EMAIL = "test_sprint_owner@example.com"
LEADER_EMAIL = "test_sprint_leader@example.com"
TEST_BRAND = "Test Sprint Brand"


def _ensure_brand():
	if not frappe.db.exists("VT Brand", TEST_BRAND):
		frappe.get_doc({"doctype": "VT Brand", "brand_name": TEST_BRAND}).insert(ignore_permissions=True)


def _ensure_user(email: str, role: str):
	if not frappe.db.exists("User", email):
		frappe.get_doc({
			"doctype": "User", "email": email,
			"first_name": email.split("@")[0], "last_name": "T",
			"enabled": 1, "roles": [{"role": role}],
		}).insert(ignore_permissions=True)


class _SprintBase(FrappeTestCase):
	def setUp(self):
		_ensure_brand()
		_ensure_user(OWNER_EMAIL, "VT Manager")
		_ensure_user(LEADER_EMAIL, "VT Leader")
		self.project = frappe.get_doc({
			"doctype": "VT Project",
			"title": "Sprint Test Project",
			"brand": TEST_BRAND,
			"project_owner": OWNER_EMAIL,
			"project_leader": LEADER_EMAIL,
			"start_date": "2026-05-01",
			"end_date": "2026-05-31",
			"pdca_phase": "PLAN",
			"status": "Open",
		}).insert(ignore_permissions=True)

	def tearDown(self):
		for s in frappe.get_all("VT Sprint", filters={"project": self.project.name}, pluck="name"):
			frappe.delete_doc("VT Sprint", s, force=True, ignore_permissions=True)
		for t in frappe.get_all("VT Task", filters={"project": self.project.name}, pluck="name"):
			frappe.delete_doc("VT Task", t, force=True, ignore_permissions=True)
		frappe.delete_doc("VT Project", self.project.name, force=True, ignore_permissions=True)

	def _make(self, **overrides):
		base = {
			"doctype": "VT Sprint",
			"sprint_title": "Sprint 1",
			"project": self.project.name,
			"start_date": "2026-05-01",
			"end_date": "2026-05-14",
			"status": "Planning",
		}
		base.update(overrides)
		return frappe.get_doc(base)


class TestVTSprintCRUD(_SprintBase):
	def test_create_sprint(self):
		sprint = self._make().insert(ignore_permissions=True)
		self.assertTrue(sprint.name.startswith("SP-"))


class TestVTSprintValidations(_SprintBase):
	def test_title_normalized(self):
		sprint = self._make(sprint_title="  Sprint   One  ").insert(ignore_permissions=True)
		self.assertEqual(sprint.sprint_title, "Sprint One")

	def test_title_max_length(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(sprint_title="X" * (SPRINT_TITLE_MAX_LEN + 1)).insert(ignore_permissions=True)

	def test_end_before_start_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(start_date="2026-05-14", end_date="2026-05-01").insert(ignore_permissions=True)

	def test_sprint_outside_project_range_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(start_date="2026-06-01", end_date="2026-06-14").insert(ignore_permissions=True)


class TestVTSprintStatusTransition(_SprintBase):
	def test_valid_forward_transition(self):
		sprint = self._make(status="Planning").insert(ignore_permissions=True)
		sprint.status = "Active"
		sprint.save()
		self.assertEqual(sprint.status, "Active")

	def test_invalid_skip_rejected(self):
		"""Planning → Review skips Active — forbidden."""
		sprint = self._make(status="Planning").insert(ignore_permissions=True)
		sprint.status = "Review"
		with self.assertRaises(frappe.ValidationError):
			sprint.save()

	def test_reverse_transition_rejected(self):
		"""Active → Planning is forbidden (forward-only)."""
		sprint = self._make(status="Planning").insert(ignore_permissions=True)
		sprint.status = "Active"
		sprint.save()
		sprint.status = "Planning"
		with self.assertRaises(frappe.ValidationError):
			sprint.save()


class TestSprintTasks(_SprintBase):
	def setUp(self):
		super().setUp()
		self.task = frappe.get_doc({
			"doctype": "VT Task",
			"title": "Sprint Task A",
			"project": self.project.name,
			"weight": 1.0,
		}).insert(ignore_permissions=True)
		# Task in another project — for cross-project test.
		self.other_project = frappe.get_doc({
			"doctype": "VT Project",
			"title": "Other Sprint Project",
			"brand": TEST_BRAND,
			"project_owner": OWNER_EMAIL,
			"project_leader": LEADER_EMAIL,
			"start_date": "2026-05-01",
			"end_date": "2026-05-31",
		}).insert(ignore_permissions=True)
		self.cross_task = frappe.get_doc({
			"doctype": "VT Task",
			"title": "Cross Project Task",
			"project": self.other_project.name,
			"weight": 1.0,
		}).insert(ignore_permissions=True)

	def tearDown(self):
		frappe.delete_doc("VT Task", self.cross_task.name, force=True, ignore_permissions=True)
		frappe.delete_doc("VT Project", self.other_project.name, force=True, ignore_permissions=True)
		super().tearDown()

	def test_task_belonging_to_project_allowed(self):
		sprint = self._make(tasks=[{"task": self.task.name}]).insert(ignore_permissions=True)
		self.assertEqual(len(sprint.tasks), 1)

	def test_cross_project_task_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(tasks=[{"task": self.cross_task.name}]).insert(ignore_permissions=True)

	def test_duplicate_task_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(tasks=[
				{"task": self.task.name},
				{"task": self.task.name},
			]).insert(ignore_permissions=True)

	def test_nonexistent_task_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(tasks=[{"task": "TASK-DOES-NOT-EXIST"}]).insert(ignore_permissions=True)

	def test_get_total_weight(self):
		sprint = self._make(tasks=[{"task": self.task.name}]).insert(ignore_permissions=True)
		self.assertEqual(sprint.get_total_weight(), 1.0)

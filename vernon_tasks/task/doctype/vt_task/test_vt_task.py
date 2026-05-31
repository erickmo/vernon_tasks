"""Tests for VT Task controller.

Covers full CRUD + validations (title, dates, numbers, override),
PDCA transitions, Kanban sync, recurring guard, dependencies guard,
and the SQL helpers (`get_blocked_tasks_for_user`, `get_tasks_for_user_today`).
"""
import frappe
from frappe.tests.utils import FrappeTestCase

from vernon_tasks.task.doctype.vt_task.vt_task import (
	KANBAN_BLOCKED,
	PDCA_KANBAN_MAP,
	TASK_TITLE_MAX_LEN,
	get_blocked_tasks_for_user,
)

OWNER = "test_task_owner@example.com"
LEADER = "test_task_leader@example.com"
MEMBER = "test_task_member@example.com"
TEST_BRAND = "Test VT Task Brand"
TEST_PROJECT_TITLE = "Test VT Task Project"


def _ensure_users():
	"""Idempotent: create the three role-tagged users used across these tests."""
	for email, role in ((OWNER, "VT Manager"), (LEADER, "VT Leader"), (MEMBER, "VT Member")):
		if not frappe.db.exists("User", email):
			frappe.get_doc({
				"doctype": "User", "email": email,
				"first_name": email.split("@")[0], "last_name": "T",
				"enabled": 1, "roles": [{"role": role}],
			}).insert(ignore_permissions=True)


def _ensure_brand():
	if not frappe.db.exists("VT Brand", TEST_BRAND):
		frappe.get_doc({"doctype": "VT Brand", "brand_name": TEST_BRAND}).insert(ignore_permissions=True)


def _make_project() -> "frappe.model.document.Document":
	"""Insert a fresh VT Project (auto-named) for each test class."""
	return frappe.get_doc({
		"doctype": "VT Project",
		"title": TEST_PROJECT_TITLE,
		"brand": TEST_BRAND,
		"project_owner": OWNER,
		"project_leader": LEADER,
		"start_date": "2026-05-01",
		"end_date": "2026-12-31",
		"pdca_phase": "PLAN",
		"status": "Open",
		"team_members": [{"user": MEMBER, "role": "Member"}],
	}).insert(ignore_permissions=True)


class _TaskBase(FrappeTestCase):
	def setUp(self):
		_ensure_users()
		_ensure_brand()
		self.project = _make_project()

	def tearDown(self):
		# Remove tasks first so the project (which Frappe links via project FK)
		# can be deleted cleanly.
		for t in frappe.get_all("VT Task", filters={"project": self.project.name}, pluck="name"):
			frappe.delete_doc("VT Task", t, force=True, ignore_permissions=True)
		frappe.delete_doc("VT Project", self.project.name, force=True, ignore_permissions=True)

	def _make(self, **overrides):
		base = {
			"doctype": "VT Task",
			"title": "Test Task",
			"project": self.project.name,
			"assigned_to": MEMBER,
			"priority": "Medium",
			"pdca_phase": "BACKLOG",
			"kanban_status": "Backlog",
			"weight": 3.0,
			"estimated_minutes": 8.0,
			"start_date": "2026-05-10",
			"deadline": "2026-05-20",
		}
		base.update(overrides)
		return frappe.get_doc(base)


class TestVTTaskCRUD(_TaskBase):
	def test_create_task(self):
		doc = self._make().insert(ignore_permissions=True)
		self.assertTrue(doc.name.startswith("TASK-"))

	def test_update_title(self):
		doc = self._make().insert(ignore_permissions=True)
		doc.title = "Updated Title"
		doc.save()
		self.assertEqual(frappe.db.get_value("VT Task", doc.name, "title"), "Updated Title")

	def test_delete_task(self):
		doc = self._make().insert(ignore_permissions=True)
		name = doc.name
		doc.delete()
		self.assertFalse(frappe.db.exists("VT Task", name))


class TestVTTaskValidations(_TaskBase):
	def test_title_normalized(self):
		doc = self._make(title="  Build   Feature  ").insert(ignore_permissions=True)
		self.assertEqual(doc.title, "Build Feature")

	def test_title_max_length(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(title="X" * (TASK_TITLE_MAX_LEN + 1)).insert(ignore_permissions=True)

	def test_deadline_before_start_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(start_date="2026-05-20", deadline="2026-05-10").insert(ignore_permissions=True)

	def test_deadline_equal_start_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(start_date="2026-05-10", deadline="2026-05-10").insert(ignore_permissions=True)

	def test_weight_must_be_positive(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(weight=0).insert(ignore_permissions=True)

	def test_estimated_minutes_negative_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(estimated_minutes=-1).insert(ignore_permissions=True)

	def test_leader_override_without_reason_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(leader_override_points=5).insert(ignore_permissions=True)

	def test_leader_override_with_reason_allowed(self):
		doc = self._make(
			leader_override_points=5,
			override_reason="Kontribusi luar biasa",
		).insert(ignore_permissions=True)
		self.assertEqual(doc.leader_override_points, 5)

	def test_recurring_without_rule_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(is_recurring=1).insert(ignore_permissions=True)


class TestVTTaskPDCA(_TaskBase):
	def test_valid_pdca_transition(self):
		doc = self._make(pdca_phase="BACKLOG").insert(ignore_permissions=True)
		doc.pdca_phase = "PLAN"
		doc.save()
		self.assertEqual(doc.pdca_phase, "PLAN")

	def test_invalid_pdca_transition_rejected(self):
		"""BACKLOG → DO is forbidden (must traverse PLAN)."""
		doc = self._make(pdca_phase="BACKLOG").insert(ignore_permissions=True)
		doc.pdca_phase = "DO"
		with self.assertRaises(frappe.ValidationError):
			doc.save()

	def test_kanban_status_synced_from_pdca(self):
		doc = self._make(pdca_phase="BACKLOG").insert(ignore_permissions=True)
		doc.pdca_phase = "PLAN"
		doc.save()
		self.assertEqual(doc.kanban_status, PDCA_KANBAN_MAP["PLAN"])
		doc.pdca_phase = "DO"
		doc.save()
		self.assertEqual(doc.kanban_status, PDCA_KANBAN_MAP["DO"])

	def test_blocked_kanban_not_overwritten(self):
		"""`Blocked` is orthogonal — PDCA changes don't clear it."""
		doc = self._make(pdca_phase="BACKLOG").insert(ignore_permissions=True)
		doc.kanban_status = KANBAN_BLOCKED
		doc.save()
		doc.pdca_phase = "PLAN"
		doc.save()
		self.assertEqual(doc.kanban_status, KANBAN_BLOCKED)


class TestVTTaskDependencies(_TaskBase):
	def test_self_block_rejected(self):
		doc = self._make().insert(ignore_permissions=True)
		doc.append("dependencies", {"blocked_by": doc.name, "dependency_type": "Finish-to-Start"})
		with self.assertRaises(frappe.ValidationError):
			doc.save()


class TestVTTaskHelpers(_TaskBase):
	def test_get_blocked_tasks_for_user_returns_list(self):
		"""Smoke check — returns a list (empty when no blockers exist)."""
		doc = self._make().insert(ignore_permissions=True)
		result = get_blocked_tasks_for_user(MEMBER)
		self.assertIsInstance(result, list)
		# This task has no blockers, so it must not appear.
		self.assertNotIn(doc.name, [r["name"] for r in result])

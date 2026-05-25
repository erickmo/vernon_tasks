"""Tests for Task Dependency (child table on VT Task)."""
import frappe
from frappe.tests.utils import FrappeTestCase

TEST_BRAND = "Test Dep Brand"
TEST_PROJECT_TITLE = "Test Dep Project"


def _ensure_brand():
	if not frappe.db.exists("VT Brand", TEST_BRAND):
		frappe.get_doc({"doctype": "VT Brand", "brand_name": TEST_BRAND}).insert(ignore_permissions=True)


def _ensure_project() -> str:
	existing = frappe.db.get_value("VT Project", {"title": TEST_PROJECT_TITLE}, "name")
	if existing:
		return existing
	return frappe.get_doc({
		"doctype": "VT Project",
		"title": TEST_PROJECT_TITLE,
		"brand": TEST_BRAND,
		"project_owner": "Administrator",
		"start_date": "2026-01-01",
		"end_date": "2026-12-31",
	}).insert(ignore_permissions=True).name


class _DepBase(FrappeTestCase):
	def setUp(self):
		_ensure_brand()
		self.project = _ensure_project()
		# Two tasks: A blocks B (so B has A in its dependencies child table).
		self.task_a = frappe.get_doc({
			"doctype": "VT Task", "title": "Blocker A", "project": self.project, "weight": 1,
		}).insert(ignore_permissions=True)
		self.task_b = frappe.get_doc({
			"doctype": "VT Task", "title": "Blocked B", "project": self.project, "weight": 1,
		}).insert(ignore_permissions=True)

	def tearDown(self):
		for t in (self.task_b, self.task_a):
			frappe.delete_doc("VT Task", t.name, force=True, ignore_permissions=True)


class TestTaskDependency(_DepBase):
	def test_create_dependency(self):
		self.task_b.append("dependencies", {
			"blocked_by": self.task_a.name,
			"dependency_type": "Finish-to-Start",
		})
		self.task_b.save()
		self.assertEqual(len(self.task_b.dependencies), 1)
		self.assertEqual(self.task_b.dependencies[0].blocked_by, self.task_a.name)

	def test_nonexistent_blocker_rejected(self):
		self.task_b.append("dependencies", {
			"blocked_by": "TASK-DOES-NOT-EXIST",
			"dependency_type": "Finish-to-Start",
		})
		with self.assertRaises(frappe.ValidationError):
			self.task_b.save()

	def test_invalid_dependency_type_rejected(self):
		self.task_b.append("dependencies", {
			"blocked_by": self.task_a.name,
			"dependency_type": "Bogus-Type",
		})
		# Frappe's Select field rejects unknown options before our validate
		# runs, so we accept any ValidationError here.
		with self.assertRaises(frappe.ValidationError):
			self.task_b.save()

	def test_self_block_rejected(self):
		"""Tested by VT Task — referenced here to document coverage boundary."""
		self.task_b.append("dependencies", {
			"blocked_by": self.task_b.name,
			"dependency_type": "Finish-to-Start",
		})
		with self.assertRaises(frappe.ValidationError):
			self.task_b.save()

	def test_start_to_start_allowed(self):
		self.task_b.append("dependencies", {
			"blocked_by": self.task_a.name,
			"dependency_type": "Start-to-Start",
		})
		self.task_b.save()
		self.assertEqual(self.task_b.dependencies[0].dependency_type, "Start-to-Start")

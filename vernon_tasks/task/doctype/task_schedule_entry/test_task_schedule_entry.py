"""Tests for Task Schedule Entry (child table on VT Task)."""
import frappe
from frappe.tests.utils import FrappeTestCase

TEST_BRAND = "Test Schedule Entry Brand"
TEST_PROJECT_TITLE = "Test Schedule Entry Project"


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


class _SchedBase(FrappeTestCase):
	def setUp(self):
		_ensure_brand()
		self.project = _ensure_project()
		self.task = frappe.get_doc({
			"doctype": "VT Task",
			"title": "Sched Test Task",
			"project": self.project,
			"weight": 1.0,
		}).insert(ignore_permissions=True)

	def tearDown(self):
		frappe.delete_doc("VT Task", self.task.name, force=True, ignore_permissions=True)

	def _append(self, **fields):
		"""Append a schedule_entries row with sane defaults overridable by `fields`."""
		row = {"date": "2026-05-15", "allocated_minutes": 4.0, "hour_start": 9, "minutes_planned": 4.0}
		row.update(fields)
		self.task.append("schedule_entries", row)
		return self.task


class TestScheduleEntryCRUD(_SchedBase):
	def test_create_entry(self):
		self._append().save()
		self.assertEqual(len(self.task.schedule_entries), 1)
		self.assertEqual(self.task.schedule_entries[0].allocated_minutes, 4.0)

	def test_delete_entry(self):
		self._append().save()
		self.task.schedule_entries = []
		self.task.save()
		self.assertEqual(len(self.task.schedule_entries), 0)


class TestScheduleEntryValidations(_SchedBase):
	def test_allocated_minutes_zero_rejected(self):
		self._append(allocated_minutes=0)
		with self.assertRaises(frappe.ValidationError):
			self.task.save()

	def test_allocated_minutes_negative_rejected(self):
		self._append(allocated_minutes=-1)
		with self.assertRaises(frappe.ValidationError):
			self.task.save()

	def test_allocated_minutes_above_1440_rejected(self):
		self._append(allocated_minutes=1441)
		with self.assertRaises(frappe.ValidationError):
			self.task.save()

	def test_hour_start_above_23_rejected(self):
		self._append(hour_start=24)
		with self.assertRaises(frappe.ValidationError):
			self.task.save()

	def test_hour_start_negative_rejected(self):
		self._append(hour_start=-1)
		with self.assertRaises(frappe.ValidationError):
			self.task.save()

	def test_hour_start_boundary_zero_allowed(self):
		self._append(hour_start=0).save()
		self.assertEqual(self.task.schedule_entries[0].hour_start, 0)

	def test_hour_start_boundary_23_allowed(self):
		self._append(hour_start=23).save()
		self.assertEqual(self.task.schedule_entries[0].hour_start, 23)

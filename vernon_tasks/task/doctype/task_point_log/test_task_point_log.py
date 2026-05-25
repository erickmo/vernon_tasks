"""Tests for Task Point Log — append-only ledger semantics."""
from datetime import timedelta

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import now_datetime

TEST_BRAND = "Test Point Log Brand"
TEST_USER = "test_point_log@example.com"
TEST_PROJECT_TITLE = "Test Point Log Project"


def _ensure_user():
	if not frappe.db.exists("User", TEST_USER):
		frappe.get_doc({
			"doctype": "User", "email": TEST_USER,
			"first_name": "PL", "last_name": "Test",
			"enabled": 1, "roles": [{"role": "VT Member"}],
		}).insert(ignore_permissions=True)


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


class _PLBase(FrappeTestCase):
	def setUp(self):
		_ensure_user()
		_ensure_brand()
		self.project = _ensure_project()
		self.task = frappe.get_doc({
			"doctype": "VT Task", "title": "PL Test Task",
			"project": self.project, "weight": 1.0,
		}).insert(ignore_permissions=True)

	def tearDown(self):
		for log in frappe.get_all("Task Point Log", filters={"task": self.task.name}, pluck="name"):
			frappe.delete_doc("Task Point Log", log, force=True, ignore_permissions=True)
		frappe.delete_doc("VT Task", self.task.name, force=True, ignore_permissions=True)

	def _make(self, **overrides):
		base = {
			"doctype": "Task Point Log",
			"task": self.task.name,
			"user": TEST_USER,
			"transaction_type": "earned",
			"amount": 10.0,
			"log_timestamp": now_datetime().strftime("%Y-%m-%d %H:%M:%S"),
		}
		base.update(overrides)
		return frappe.get_doc(base)


class TestPointLogCRUD(_PLBase):
	def test_create_earned(self):
		doc = self._make().insert(ignore_permissions=True)
		self.assertTrue(doc.name.startswith("TPL-"))


class TestPointLogSignRules(_PLBase):
	def test_earned_must_be_positive(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(transaction_type="earned", amount=-5).insert(ignore_permissions=True)

	def test_earned_zero_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(transaction_type="earned", amount=0).insert(ignore_permissions=True)

	def test_late_penalty_must_be_negative(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(transaction_type="late_penalty", amount=5).insert(ignore_permissions=True)

	def test_revision_deduction_must_be_negative(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(transaction_type="revision_deduction", amount=3).insert(ignore_permissions=True)

	def test_revision_deduction_negative_allowed(self):
		doc = self._make(transaction_type="revision_deduction", amount=-3).insert(ignore_permissions=True)
		self.assertEqual(doc.amount, -3)

	def test_override_zero_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(
				transaction_type="leader_override",
				amount=0,
				overridden_by="Administrator",
				note="x",
			).insert(ignore_permissions=True)


class TestPointLogTimestamp(_PLBase):
	def test_future_timestamp_rejected(self):
		"""1 hour is well past the 5-minute clock-skew tolerance."""
		future = (now_datetime() + timedelta(hours=1)).strftime("%Y-%m-%d %H:%M:%S")
		with self.assertRaises(frappe.ValidationError):
			self._make(log_timestamp=future).insert(ignore_permissions=True)


class TestPointLogOverrideAudit(_PLBase):
	def test_override_requires_overridden_by(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(
				transaction_type="leader_override",
				amount=5,
				note="reason",
			).insert(ignore_permissions=True)

	def test_override_requires_note(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(
				transaction_type="leader_override",
				amount=5,
				overridden_by="Administrator",
			).insert(ignore_permissions=True)

	def test_override_with_audit_trail_allowed(self):
		doc = self._make(
			transaction_type="leader_override",
			amount=5,
			overridden_by="Administrator",
			note="Adjusted by leader for fairness",
		).insert(ignore_permissions=True)
		self.assertEqual(doc.amount, 5)


class TestPointLogImmutability(_PLBase):
	def test_amount_cannot_be_changed(self):
		doc = self._make(amount=10.0).insert(ignore_permissions=True)
		doc.amount = 20.0
		with self.assertRaises(frappe.ValidationError):
			doc.save()

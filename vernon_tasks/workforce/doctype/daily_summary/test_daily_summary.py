"""Tests for Daily Summary controller + helpers."""
from datetime import date, timedelta

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import today

from vernon_tasks.workforce.doctype.daily_summary.daily_summary import (
	MAX_HOURS_PER_DAY,
	get_or_create_today,
	update_scheduled_hours,
)

TEST_USER = "test_ds_user@example.com"


def _ensure_user():
	if not frappe.db.exists("User", TEST_USER):
		frappe.get_doc({
			"doctype": "User", "email": TEST_USER,
			"first_name": "Test", "last_name": "DS",
			"enabled": 1, "roles": [{"role": "VT Member"}],
		}).insert(ignore_permissions=True)


class _DSBase(FrappeTestCase):
	def setUp(self):
		_ensure_user()
		frappe.db.delete("Daily Summary", {"user": TEST_USER})

	def tearDown(self):
		frappe.db.delete("Daily Summary", {"user": TEST_USER})

	def _make(self, **overrides):
		base = {
			"doctype": "Daily Summary",
			"user": TEST_USER,
			"date": today(),
			"target_hours": 8.0,
			"scheduled_hours": 0,
			"completed_hours": 0,
			"total_points_today": 0,
		}
		base.update(overrides)
		return frappe.get_doc(base)


class TestDailySummaryCRUD(_DSBase):
	def test_create(self):
		doc = self._make(scheduled_hours=6.5, completed_hours=4.0).insert(ignore_permissions=True)
		self.assertEqual(doc.scheduled_hours, 6.5)


class TestDailySummaryValidations(_DSBase):
	def test_nonexistent_user_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(user="ghost@example.com").insert(ignore_permissions=True)

	def test_future_date_rejected(self):
		tomorrow = (date.today() + timedelta(days=1)).isoformat()
		with self.assertRaises(frappe.ValidationError):
			self._make(date=tomorrow).insert(ignore_permissions=True)

	def test_negative_hours_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(completed_hours=-1).insert(ignore_permissions=True)

	def test_hours_above_24_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(scheduled_hours=MAX_HOURS_PER_DAY + 1).insert(ignore_permissions=True)

	def test_negative_points_allowed(self):
		"""Net penalties can push points_today below 0 — must be allowed."""
		doc = self._make(total_points_today=-5).insert(ignore_permissions=True)
		self.assertEqual(doc.total_points_today, -5)


class TestDailySummaryHelpers(_DSBase):
	def test_get_or_create_today_idempotent(self):
		doc1 = get_or_create_today(TEST_USER, target_hours=8.0)
		doc2 = get_or_create_today(TEST_USER, target_hours=8.0)
		self.assertEqual(doc1.name, doc2.name)

	def test_update_scheduled_hours_increments(self):
		get_or_create_today(TEST_USER, target_hours=8.0)
		update_scheduled_hours(TEST_USER, today(), 3.5)
		hours = frappe.db.get_value(
			"Daily Summary", {"user": TEST_USER, "date": today()}, "scheduled_hours"
		)
		self.assertEqual(hours, 3.5)

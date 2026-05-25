"""Tests for Work Profile + Work Schedule Day child."""
import frappe
from frappe.tests.utils import FrappeTestCase

from vernon_tasks.workforce.doctype.work_profile.work_profile import (
	MAX_DAILY_TARGET_HOURS,
	get_daily_target_hours,
	get_user_profile,
)

TEST_USER = "test_wp_user@example.com"


def _ensure_user():
	if not frappe.db.exists("User", TEST_USER):
		frappe.get_doc({
			"doctype": "User", "email": TEST_USER,
			"first_name": "Test", "last_name": "WP",
			"enabled": 1, "roles": [{"role": "VT Member"}],
		}).insert(ignore_permissions=True)


class _WPBase(FrappeTestCase):
	def setUp(self):
		_ensure_user()
		frappe.db.delete("Work Profile", {"user": TEST_USER})

	def tearDown(self):
		frappe.db.delete("Work Profile", {"user": TEST_USER})

	def _make(self, **overrides):
		base = {"doctype": "Work Profile", "user": TEST_USER, "daily_target_hours": 8.0}
		base.update(overrides)
		return frappe.get_doc(base)


class TestWorkProfileCRUD(_WPBase):
	def test_create(self):
		doc = self._make().insert(ignore_permissions=True)
		self.assertEqual(doc.user, TEST_USER)

	def test_update_target(self):
		doc = self._make().insert(ignore_permissions=True)
		doc.daily_target_hours = 6.0
		doc.save()
		self.assertEqual(doc.daily_target_hours, 6.0)


class TestWorkProfileValidations(_WPBase):
	def test_zero_target_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(daily_target_hours=0).insert(ignore_permissions=True)

	def test_negative_target_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(daily_target_hours=-1).insert(ignore_permissions=True)

	def test_target_above_max_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(daily_target_hours=MAX_DAILY_TARGET_HOURS + 1).insert(ignore_permissions=True)

	def test_work_window_start_after_end_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(work_start_time="17:00:00", work_end_time="09:00:00").insert(ignore_permissions=True)

	def test_working_day_time_inverted_rejected(self):
		doc = self._make(working_days=[{
			"day_of_week": "Monday",
			"is_working": 1,
			"start_time": "17:00:00",
			"end_time": "09:00:00",
		}])
		with self.assertRaises(frappe.ValidationError):
			doc.insert(ignore_permissions=True)

	def test_duplicate_day_rejected(self):
		doc = self._make(working_days=[
			{"day_of_week": "Monday", "is_working": 1},
			{"day_of_week": "Monday", "is_working": 0},
		])
		with self.assertRaises(frappe.ValidationError):
			doc.insert(ignore_permissions=True)


class TestWorkProfileHelpers(_WPBase):
	def test_get_working_day_names(self):
		doc = self._make(working_days=[
			{"day_of_week": "Monday", "is_working": 1},
			{"day_of_week": "Tuesday", "is_working": 1},
			{"day_of_week": "Saturday", "is_working": 0},
			{"day_of_week": "Sunday", "is_working": 0},
		]).insert(ignore_permissions=True)
		names = doc.get_working_day_names()
		self.assertIn("Monday", names)
		self.assertIn("Tuesday", names)
		self.assertNotIn("Saturday", names)
		self.assertNotIn("Sunday", names)

	def test_get_user_profile_returns_doc(self):
		self._make().insert(ignore_permissions=True)
		profile = get_user_profile(TEST_USER)
		self.assertIsNotNone(profile)
		self.assertEqual(profile.user, TEST_USER)

	def test_get_user_profile_returns_none_when_missing(self):
		self.assertIsNone(get_user_profile("ghost@example.com"))

	def test_get_daily_target_uses_profile(self):
		self._make(daily_target_hours=6.5).insert(ignore_permissions=True)
		self.assertEqual(get_daily_target_hours(TEST_USER), 6.5)

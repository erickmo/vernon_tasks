"""Tests for Recurring Rule controller + scheduler helpers."""
from datetime import date, timedelta

import frappe
from frappe.tests.utils import FrappeTestCase

from vernon_tasks.task.doctype.recurring_rule.recurring_rule import (
	MAX_INTERVAL,
	get_next_occurrence,
	is_rule_expired,
)


class _RRBase(FrappeTestCase):
	def setUp(self):
		self._created: list[str] = []

	def tearDown(self):
		for name in self._created:
			if frappe.db.exists("Recurring Rule", name):
				frappe.delete_doc("Recurring Rule", name, force=True, ignore_permissions=True)

	def _make(self, **overrides):
		base = {"doctype": "Recurring Rule", "rule_type": "Daily", "interval": 1}
		base.update(overrides)
		doc = frappe.get_doc(base).insert(ignore_permissions=True)
		self._created.append(doc.name)
		return doc


class TestRecurringRuleCRUD(_RRBase):
	def test_create_daily(self):
		doc = self._make()
		self.assertTrue(doc.name.startswith("RR-"))

	def test_create_weekly_with_custom_interval(self):
		doc = self._make(rule_type="Weekly", interval=2)
		self.assertEqual(doc.interval, 2)


class TestRecurringRuleValidations(_RRBase):
	def test_interval_zero_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(interval=0)

	def test_interval_above_max_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(interval=MAX_INTERVAL + 1)

	def test_day_of_month_out_of_range_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(rule_type="Monthly", day_of_month=32)

	def test_day_of_month_zero_treated_as_unset(self):
		"""0 = 'not specified' (Frappe Int default) — must NOT raise."""
		doc = self._make(rule_type="Monthly", day_of_month=0)
		self.assertIn(doc.day_of_month, (0, None))

	def test_days_of_week_invalid_token_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(rule_type="Custom", days_of_week="Mon,Funday")

	def test_days_of_week_valid_subset_allowed(self):
		doc = self._make(rule_type="Custom", days_of_week="Mon,Wed,Fri")
		self.assertEqual(doc.days_of_week, "Mon,Wed,Fri")

	def test_max_occurrences_zero_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(max_occurrences=0)

	def test_end_date_in_past_rejected_on_create(self):
		past = (date.today() - timedelta(days=1)).isoformat()
		with self.assertRaises(frappe.ValidationError):
			self._make(end_date=past)


class TestNextOccurrence(_RRBase):
	def test_daily(self):
		rule = self._make(rule_type="Daily", interval=3)
		self.assertEqual(
			get_next_occurrence(rule.name, date(2026, 6, 1)),
			date(2026, 6, 4),
		)

	def test_weekly(self):
		rule = self._make(rule_type="Weekly", interval=1)
		self.assertEqual(
			get_next_occurrence(rule.name, date(2026, 6, 1)),
			date(2026, 6, 8),
		)

	def test_monthly(self):
		rule = self._make(rule_type="Monthly", interval=1)
		self.assertEqual(
			get_next_occurrence(rule.name, date(2026, 6, 1)),
			date(2026, 7, 1),
		)

	def test_custom_picks_next_allowed_weekday(self):
		# 2026-06-01 is a Monday; the next Wed is 2026-06-03.
		rule = self._make(rule_type="Custom", days_of_week="Wed,Fri")
		self.assertEqual(
			get_next_occurrence(rule.name, date(2026, 6, 1)),
			date(2026, 6, 3),
		)


class TestIsRuleExpired(_RRBase):
	def test_not_expired_no_constraints(self):
		rule = self._make()
		self.assertFalse(is_rule_expired(rule.name, occurrence_count=10, as_of=date.today()))

	def test_expired_by_max_occurrences(self):
		rule = self._make(max_occurrences=5)
		self.assertTrue(is_rule_expired(rule.name, occurrence_count=5, as_of=date.today()))

	def test_not_expired_below_max(self):
		rule = self._make(max_occurrences=5)
		self.assertFalse(is_rule_expired(rule.name, occurrence_count=4, as_of=date.today()))

	def test_expired_by_end_date(self):
		"""End date is created in the future then back-dated via db_set —
		bypassing validate() so we can exercise the helper's past-date path."""
		future = (date.today() + timedelta(days=30)).isoformat()
		rule = self._make(end_date=future)
		past = (date.today() - timedelta(days=1)).isoformat()
		frappe.db.set_value("Recurring Rule", rule.name, "end_date", past)
		self.assertTrue(is_rule_expired(rule.name, occurrence_count=0, as_of=date.today()))

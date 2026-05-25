"""Tests for User Point Summary controller + helpers."""
import frappe
from frappe.tests.utils import FrappeTestCase

from vernon_tasks.workforce.doctype.user_point_summary.user_point_summary import (
	add_points_to_period,
	get_or_create_period,
)

TEST_USER = "test_ups_user@example.com"
TEST_PERIOD = "2026-05"


def _ensure_user():
	if not frappe.db.exists("User", TEST_USER):
		frappe.get_doc({
			"doctype": "User", "email": TEST_USER,
			"first_name": "Test", "last_name": "UPS",
			"enabled": 1, "roles": [{"role": "VT Member"}],
		}).insert(ignore_permissions=True)


class _UPSBase(FrappeTestCase):
	def setUp(self):
		_ensure_user()
		frappe.db.delete("User Point Summary", {"user": TEST_USER})

	def tearDown(self):
		frappe.db.delete("User Point Summary", {"user": TEST_USER})

	def _make(self, **overrides):
		base = {
			"doctype": "User Point Summary",
			"user": TEST_USER,
			"period": TEST_PERIOD,
			"total_earned": 0,
			"total_bonus": 0,
			"total_penalty": 0,
			"total_override_delta": 0,
		}
		base.update(overrides)
		return frappe.get_doc(base)


class TestUPSCRUD(_UPSBase):
	def test_create(self):
		doc = self._make(
			total_earned=200, total_bonus=15, total_penalty=20, total_override_delta=-10,
		).insert(ignore_permissions=True)
		# net = 200 + 15 - 20 + (-10) = 185
		self.assertEqual(doc.net_points, 185)


class TestUPSValidations(_UPSBase):
	def test_nonexistent_user_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(user="ghost@example.com").insert(ignore_permissions=True)

	def test_invalid_period_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(period="not-a-period").insert(ignore_permissions=True)

	def test_period_year_allowed(self):
		doc = self._make(period="2026").insert(ignore_permissions=True)
		self.assertEqual(doc.period, "2026")

	def test_period_quarter_allowed(self):
		doc = self._make(period="2026-Q2").insert(ignore_permissions=True)
		self.assertEqual(doc.period, "2026-Q2")

	def test_negative_earned_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(total_earned=-1).insert(ignore_permissions=True)

	def test_negative_penalty_rejected(self):
		"""Penalty is an absolute value — signed direction is encoded in formula."""
		with self.assertRaises(frappe.ValidationError):
			self._make(total_penalty=-5).insert(ignore_permissions=True)

	def test_negative_override_delta_allowed(self):
		"""Override delta is signed; leader can subtract points via override."""
		doc = self._make(total_override_delta=-10).insert(ignore_permissions=True)
		self.assertEqual(doc.total_override_delta, -10)

	def test_net_points_auto_synced(self):
		"""net_points always recomputed from components on save."""
		doc = self._make(total_earned=100).insert(ignore_permissions=True)
		doc.total_earned = 50
		doc.save()
		self.assertEqual(doc.net_points, 50)


class TestUPSHelpers(_UPSBase):
	def test_get_or_create_period_idempotent(self):
		doc1 = get_or_create_period(TEST_USER, TEST_PERIOD)
		doc2 = get_or_create_period(TEST_USER, TEST_PERIOD)
		self.assertEqual(doc1.name, doc2.name)

	def test_add_points_accumulates(self):
		add_points_to_period(TEST_USER, TEST_PERIOD, earned=100, bonus=10, penalty=5)
		doc = frappe.get_doc(
			"User Point Summary",
			frappe.db.get_value(
				"User Point Summary", {"user": TEST_USER, "period": TEST_PERIOD}, "name"
			),
		)
		self.assertEqual(doc.total_earned, 100)
		self.assertEqual(doc.total_bonus, 10)
		self.assertEqual(doc.total_penalty, 5)
		self.assertEqual(doc.net_points, 105)  # 100 + 10 - 5 + 0

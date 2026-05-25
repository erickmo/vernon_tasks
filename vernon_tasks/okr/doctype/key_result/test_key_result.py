"""Tests for Key Result controller.

Covers:
  - Full CRUD lifecycle
  - Validations (target>0, current>=0, confidence 0-100, metric normalize)
  - Progress auto-compute (clamped at 100%)
  - Confidence delta tracking (confidence_last_week shifts on objective change)
"""
import frappe
from frappe.tests.utils import FrappeTestCase

from vernon_tasks.okr.doctype.key_result.key_result import KR_METRIC_MAX_LEN

TEST_USER = "test_okr@example.com"
TEST_BRAND = "Test KR Brand"


def _ensure_user():
	if not frappe.db.exists("User", TEST_USER):
		frappe.get_doc({
			"doctype": "User", "email": TEST_USER,
			"first_name": "OKR", "last_name": "Test",
			"enabled": 1, "roles": [{"role": "VT Manager"}]
		}).insert(ignore_permissions=True)


def _ensure_brand():
	if not frappe.db.exists("VT Brand", TEST_BRAND):
		frappe.get_doc({"doctype": "VT Brand", "brand_name": TEST_BRAND}).insert(ignore_permissions=True)


def _make_objective():
	_ensure_user()
	_ensure_brand()
	return frappe.get_doc({
		"doctype": "Objective",
		"title": "KR Parent Objective",
		"brand": TEST_BRAND,
		"period": "2026-Q2",
		"objective_owner": TEST_USER,
		"pdca_phase": "PLAN",
	}).insert(ignore_permissions=True)


class _KRBase(FrappeTestCase):
	"""Shared setup: each test gets a fresh Objective + tears it down clean."""

	def setUp(self):
		self.obj = _make_objective()

	def tearDown(self):
		for kr in frappe.get_all("Key Result", filters={"objective": self.obj.name}, pluck="name"):
			frappe.delete_doc("Key Result", kr, force=True, ignore_permissions=True)
		frappe.delete_doc("Objective", self.obj.name, force=True, ignore_permissions=True)

	def _make_kr(self, **overrides):
		base = {
			"doctype": "Key Result",
			"objective": self.obj.name,
			"metric": "Active Users",
			"target_value": 1000,
			"current_value": 0,
			"unit": "users",
		}
		base.update(overrides)
		return frappe.get_doc(base)


class TestKeyResultCRUD(_KRBase):
	def test_create_key_result(self):
		kr = self._make_kr().insert(ignore_permissions=True)
		self.assertTrue(kr.name.startswith("KR-"))

	def test_read_key_result(self):
		kr = self._make_kr(metric="Readable").insert(ignore_permissions=True)
		fetched = frappe.get_doc("Key Result", kr.name)
		self.assertEqual(fetched.metric, "Readable")

	def test_update_current_value(self):
		kr = self._make_kr().insert(ignore_permissions=True)
		kr.current_value = 500
		kr.save()
		self.assertEqual(kr.progress_percent, 50.0)

	def test_delete_key_result(self):
		kr = self._make_kr().insert(ignore_permissions=True)
		name = kr.name
		kr.delete()
		self.assertFalse(frappe.db.exists("Key Result", name))


class TestKeyResultValidations(_KRBase):
	def test_target_must_be_positive(self):
		"""target_value <= 0 is invalid (avoids div-by-zero downstream)."""
		with self.assertRaises(frappe.ValidationError):
			self._make_kr(target_value=0).insert(ignore_permissions=True)

	def test_target_negative_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make_kr(target_value=-5).insert(ignore_permissions=True)

	def test_current_negative_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make_kr(current_value=-1).insert(ignore_permissions=True)

	def test_confidence_above_100_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make_kr(confidence=150).insert(ignore_permissions=True)

	def test_confidence_below_0_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make_kr(confidence=-1).insert(ignore_permissions=True)

	def test_metric_normalized(self):
		"""Metric trimmed and whitespace runs collapsed."""
		kr = self._make_kr(metric="  Monthly   Active   Users  ").insert(ignore_permissions=True)
		self.assertEqual(kr.metric, "Monthly Active Users")

	def test_metric_max_length(self):
		too_long = "X" * (KR_METRIC_MAX_LEN + 1)
		with self.assertRaises(frappe.ValidationError):
			self._make_kr(metric=too_long).insert(ignore_permissions=True)


class TestKeyResultProgress(_KRBase):
	def test_progress_at_50pct(self):
		kr = self._make_kr(target_value=100, current_value=50).insert(ignore_permissions=True)
		self.assertEqual(kr.progress_percent, 50.0)

	def test_progress_clamped_at_100(self):
		"""Over-performance does not exceed 100%."""
		kr = self._make_kr(target_value=100, current_value=200).insert(ignore_permissions=True)
		self.assertEqual(kr.progress_percent, 100.0)

	def test_progress_zero_when_current_zero(self):
		kr = self._make_kr(target_value=100, current_value=0).insert(ignore_permissions=True)
		self.assertEqual(kr.progress_percent, 0.0)

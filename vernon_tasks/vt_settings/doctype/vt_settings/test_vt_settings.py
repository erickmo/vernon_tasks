"""Tests for VT Settings (Single)."""
import frappe
from frappe.tests.utils import FrappeTestCase

from vernon_tasks.vt_settings.doctype.vt_settings.vt_settings import (
	MAX_DAILY_TARGET_HOURS,
	MAX_RATE,
	MAX_WEIGHT_MULTIPLIER,
	get_settings,
)


class TestVTSettings(FrappeTestCase):
	"""Single-row doctype — restore values after each mutation test."""

	def setUp(self):
		self.settings = frappe.get_single("VT Settings")
		self._snapshot = {
			"weight_multiplier": self.settings.weight_multiplier,
			"early_bonus_rate": self.settings.early_bonus_rate,
			"late_penalty_rate": self.settings.late_penalty_rate,
			"revision_deduct_rate": self.settings.revision_deduct_rate,
			"default_daily_target_hours": self.settings.default_daily_target_hours,
		}

	def tearDown(self):
		# Restore so other test files in the suite see stable defaults.
		for k, v in self._snapshot.items():
			frappe.db.set_value("VT Settings", None, k, v)

	# --- Defaults + helper ------------------------------------------------
	def test_default_values_exist(self):
		self.assertIsNotNone(self.settings.weight_multiplier)
		self.assertIsNotNone(self.settings.early_bonus_rate)
		self.assertIsNotNone(self.settings.late_penalty_rate)
		self.assertIsNotNone(self.settings.revision_deduct_rate)
		self.assertIsNotNone(self.settings.default_daily_target_hours)

	def test_get_settings_returns_single(self):
		self.assertEqual(get_settings().doctype, "VT Settings")

	# --- Validations ------------------------------------------------------
	def test_weight_multiplier_zero_rejected(self):
		self.settings.weight_multiplier = 0
		with self.assertRaises(frappe.ValidationError):
			self.settings.validate()

	def test_weight_multiplier_above_max_rejected(self):
		self.settings.weight_multiplier = MAX_WEIGHT_MULTIPLIER + 1
		with self.assertRaises(frappe.ValidationError):
			self.settings.validate()

	def test_negative_bonus_rate_rejected(self):
		self.settings.early_bonus_rate = -0.01
		with self.assertRaises(frappe.ValidationError):
			self.settings.validate()

	def test_rate_above_max_rejected(self):
		"""Rate > 1.0 likely means the user entered a percent instead of fraction."""
		self.settings.late_penalty_rate = MAX_RATE + 0.1
		with self.assertRaises(frappe.ValidationError):
			self.settings.validate()

	def test_daily_target_zero_rejected(self):
		self.settings.default_daily_target_hours = 0
		with self.assertRaises(frappe.ValidationError):
			self.settings.validate()

	def test_daily_target_above_24_rejected(self):
		self.settings.default_daily_target_hours = MAX_DAILY_TARGET_HOURS + 1
		with self.assertRaises(frappe.ValidationError):
			self.settings.validate()

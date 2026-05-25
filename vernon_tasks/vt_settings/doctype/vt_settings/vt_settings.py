"""VT Settings (Single) — app-wide configuration.

Layer: Frappe DocType controller for a Single doctype (one row global).

Holds tunable knobs for point calculation, default daily target, analytics
threshold defaults, push notification VAPID keys, and portal feature flags.
Validations keep numeric values in sensible ranges so a typo in the desk
form can't break the whole point calculation pipeline.

Source of truth: docs/domains/vt_settings/README.html.
"""
import frappe
from frappe.model.document import Document

# --- Validation caps -----------------------------------------------------
# Rates are fractions per day. Capping at 1.0 prevents a stray "100" from
# being entered as a percentage (which would zero-out everyone's points).
MAX_RATE = 1.0
# Daily target should never exceed 24h; matches Work Profile cap.
MAX_DAILY_TARGET_HOURS = 24.0
# Multiplier reasonable upper bound — guards against accidental e.g. 1e6.
MAX_WEIGHT_MULTIPLIER = 1000.0


class VTSettings(Document):
	"""Single-row app configuration."""

	def validate(self) -> None:
		self._validate_point_calc()
		self._validate_daily_target()
		self._validate_analytics_defaults()

	def _validate_point_calc(self) -> None:
		"""Point calculation knobs — weight_multiplier > 0, rates ∈ [0, MAX_RATE]."""
		if (self.weight_multiplier or 0) <= 0:
			frappe.throw(
				"Weight Multiplier harus lebih besar dari 0",
				frappe.ValidationError,
			)
		if self.weight_multiplier > MAX_WEIGHT_MULTIPLIER:
			frappe.throw(
				f"Weight Multiplier maksimal {MAX_WEIGHT_MULTIPLIER:.0f}",
				frappe.ValidationError,
			)
		for fieldname, label in (
			("early_bonus_rate", "Early Bonus Rate"),
			("late_penalty_rate", "Late Penalty Rate"),
			("revision_deduct_rate", "Revision Deduction Rate"),
		):
			value = getattr(self, fieldname, 0) or 0
			if value < 0:
				frappe.throw(
					f"{label} tidak boleh negatif",
					frappe.ValidationError,
				)
			if value > MAX_RATE:
				frappe.throw(
					f"{label} maksimal {MAX_RATE} (fraksi per hari, mis. 0.05 = 5%)",
					frappe.ValidationError,
				)

	def _validate_daily_target(self) -> None:
		"""default_daily_target_hours ∈ (0, 24]."""
		hours = self.default_daily_target_hours or 0
		if hours <= 0:
			frappe.throw(
				"Default Daily Target Hours harus lebih besar dari 0",
				frappe.ValidationError,
			)
		if hours > MAX_DAILY_TARGET_HOURS:
			frappe.throw(
				f"Default Daily Target Hours maksimal {MAX_DAILY_TARGET_HOURS:.0f} jam",
				frappe.ValidationError,
			)

	def _validate_analytics_defaults(self) -> None:
		"""Analytics thresholds (when set) must be non-negative.

		blocked_days_threshold is a count; slip_pct/capacity_pct are percent
		fractions (0..100 by Frappe Percent semantics — already enforced by
		the column type).
		"""
		if self.default_blocked_days_threshold is not None and self.default_blocked_days_threshold < 0:
			frappe.throw(
				"Default Blocked Days Threshold tidak boleh negatif",
				frappe.ValidationError,
			)


def get_settings():
	"""Return the singleton VT Settings doc."""
	return frappe.get_single("VT Settings")

"""User Point Summary controller — per-user per-period rollup of points.

Aggregates Task Point Log rows into a fast-readable summary for the
leaderboard / personal dashboard. Name format `UPS-{user}-{period}` makes
the (user, period) pair the natural unique key.

Validations:
  - period grammar matches the Objective period grammar (YYYY, YYYY-Hn,
    YYYY-Qn, YYYY-MM) so cross-domain reports can group safely.
  - total_earned / total_bonus / total_penalty ≥ 0 (raw aggregates)
  - net_points stays consistent with the formula on save

Source of truth: docs/domains/workforce/README.html.
"""
import re

import frappe
from frappe.model.document import Document

# --- Period grammar (mirrors Objective) ----------------------------------
# Reusing the Objective period regex keeps cross-domain group-by queries
# trivial — both tables speak the same shape.
_PERIOD_RE = re.compile(r"^(\d{4})(-(H[12]|Q[1-4]|0[1-9]|1[0-2]))?$")


class UserPointSummary(Document):
	"""One (user, period) rollup of point components + net total."""

	def validate(self) -> None:
		self._validate_user()
		self._validate_period()
		self._validate_components_non_negative()
		self._sync_net_points()

	def _validate_user(self) -> None:
		"""user FK back-stop."""
		if not self.user:
			frappe.throw("User wajib diisi", frappe.MandatoryError)
		if not frappe.db.exists("User", self.user):
			frappe.throw(
				f"User '{self.user}' tidak ditemukan",
				frappe.ValidationError,
			)

	def _validate_period(self) -> None:
		"""period must match Objective period grammar."""
		if not self.period:
			frappe.throw("Period wajib diisi", frappe.MandatoryError)
		if not _PERIOD_RE.match(self.period):
			frappe.throw(
				f"Format period tidak valid: '{self.period}'. "
				"Gunakan YYYY, YYYY-Hn, YYYY-Qn, atau YYYY-MM",
				frappe.ValidationError,
			)

	def _validate_components_non_negative(self) -> None:
		"""Raw aggregates (earned/bonus/penalty) are absolute values ≥ 0.

		`total_override_delta` is signed (an override can subtract) — so it
		is intentionally NOT range-checked here.
		"""
		for fieldname, label in (
			("total_earned", "Total Earned"),
			("total_bonus", "Total Bonus"),
			("total_penalty", "Total Penalty"),
		):
			value = getattr(self, fieldname, 0) or 0
			if value < 0:
				frappe.throw(
					f"{label} tidak boleh negatif",
					frappe.ValidationError,
				)

	def _sync_net_points(self) -> None:
		"""Recompute net_points from components so the field is always coherent.

		Formula: earned + bonus - penalty + override_delta. The override
		delta is signed (penalties from the leader are negative).
		"""
		self.net_points = (
			(self.total_earned or 0)
			+ (self.total_bonus or 0)
			- (self.total_penalty or 0)
			+ (self.total_override_delta or 0)
		)


# --- Module-level helpers (used by point_calculator + scheduler) ---------

def get_or_create_period(user: str, period: str) -> "UserPointSummary":
	"""Return the UPS for (user, period), creating one if missing.

	Idempotent — safe to call on every transaction.
	"""
	name = frappe.db.get_value(
		"User Point Summary", {"user": user, "period": period}, "name"
	)
	if name:
		return frappe.get_doc("User Point Summary", name)
	doc = frappe.get_doc({
		"doctype": "User Point Summary",
		"user": user,
		"period": period,
		"total_earned": 0,
		"total_penalty": 0,
		"total_bonus": 0,
		"total_override_delta": 0,
		"net_points": 0,
	})
	doc.insert(ignore_permissions=True)
	return doc


def add_points_to_period(
	user: str,
	period: str,
	earned: float = 0,
	bonus: float = 0,
	penalty: float = 0,
	override_delta: float = 0,
) -> None:
	"""Increment each component on the UPS row, recompute net_points, save."""
	doc = get_or_create_period(user, period)
	doc.total_earned += earned
	doc.total_bonus += bonus
	doc.total_penalty += penalty
	doc.total_override_delta += override_delta
	# Save() runs validate() which calls _sync_net_points, so we don't need
	# to set net_points explicitly here. Kept for resilience in case validate
	# is bypassed elsewhere.
	doc.net_points = (
		doc.total_earned + doc.total_bonus - doc.total_penalty + doc.total_override_delta
	)
	doc.save(ignore_permissions=True)

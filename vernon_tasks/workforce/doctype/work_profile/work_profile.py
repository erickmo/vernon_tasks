"""Work Profile controller — Workforce domain.

Layer: Frappe DocType controller (Layer 2, Priority 1).

`user` is the permanent PK (`autoname: field:user`). Each user has at most
one Work Profile that captures their daily target, baseline work hours,
and which weekdays they work.

Source of truth: docs/domains/workforce/README.html.
"""
import frappe
from frappe.model.document import Document

# --- Validation caps ------------------------------------------------------
# A profile can't ask for more than 24 hours/day. Real-world ceiling for
# planning is ~12; 24 here is the absolute upper bound to prevent bad data.
MAX_DAILY_TARGET_HOURS = 24.0
MIN_DAILY_TARGET_HOURS = 0.0  # exclusive — checked as > 0


class WorkProfile(Document):
	"""Per-user work configuration (hours target + weekday schedule)."""

	def validate(self) -> None:
		self._validate_daily_target()
		self._validate_work_window()
		self._validate_working_days()

	def _validate_daily_target(self) -> None:
		"""daily_target_hours ∈ (0, 24]."""
		hours = self.daily_target_hours or 0
		if hours <= MIN_DAILY_TARGET_HOURS:
			frappe.throw(
				"Daily Target Hours harus lebih besar dari 0",
				frappe.ValidationError,
			)
		if hours > MAX_DAILY_TARGET_HOURS:
			frappe.throw(
				f"Daily Target Hours maksimal {MAX_DAILY_TARGET_HOURS:.0f} jam",
				frappe.ValidationError,
			)

	def _validate_work_window(self) -> None:
		"""When both work_start_time and work_end_time are set, start < end."""
		if self.work_start_time and self.work_end_time:
			if self.work_start_time >= self.work_end_time:
				frappe.throw(
					"Work Start Time harus sebelum Work End Time",
					frappe.ValidationError,
				)

	def _validate_working_days(self) -> None:
		"""Run child validation + reject duplicate day_of_week rows.

		Frappe doesn't auto-invoke child `validate()`; we wire it here so
		the row-local time check fires. We also enforce uniqueness across
		the week — two "Monday" rows would shadow each other.
		"""
		seen: set[str] = set()
		for row in self.working_days or []:
			row.run_method("validate")
			if row.day_of_week in seen:
				frappe.throw(
					f"Hari kerja duplikat: {row.day_of_week}",
					frappe.ValidationError,
				)
			seen.add(row.day_of_week)

	def get_working_day_names(self) -> list[str]:
		"""Return weekday names (Monday..Sunday) flagged as working."""
		return [row.day_of_week for row in self.working_days if row.is_working]


# --- Module-level helpers (used by scheduler + daily_summary) ------------

def get_user_profile(user: str) -> "WorkProfile | None":
	"""Return the WorkProfile doc for `user`, or None if missing."""
	name = frappe.db.get_value("Work Profile", {"user": user}, "name")
	if name:
		return frappe.get_doc("Work Profile", name)
	return None


def get_daily_target_hours(user: str) -> float:
	"""Return user's daily target hours, falling back to VT Settings default.

	Used by the scheduler when generating daily_summary rows.
	"""
	profile = get_user_profile(user)
	if profile:
		return profile.daily_target_hours
	settings = frappe.get_single("VT Settings")
	return settings.default_daily_target_hours or 8.0

"""Task Schedule Entry controller — child table on VT Task.

One row = one day's allocated work for a task. Validations enforce
realistic minute bounds and a valid clock-hour (0-23) so scheduling UI
calculations never see junk data.

Source of truth: docs/domains/task/README.html.
"""
import frappe
from frappe.model.document import Document

# Working-minute upper bound — a single day cannot have more than 24 hours
# (1440 minutes) of work. The UI typically caps lower but we permit up to a
# full day for catch-up days.
MAX_MINUTES_PER_DAY = 1440.0
MIN_HOUR = 0
MAX_HOUR = 23


class TaskScheduleEntry(Document):
	"""Per-day allocation row for a parent VT Task."""

	def validate(self) -> None:
		self._validate_minutes()
		self._validate_hour_start()

	def _validate_minutes(self) -> None:
		"""allocated_minutes and minutes_planned in (0, 1440]."""
		allocated = self.allocated_minutes or 0
		if allocated <= 0:
			frappe.throw(
				"Allocated Minutes harus lebih besar dari 0",
				frappe.ValidationError,
			)
		if allocated > MAX_MINUTES_PER_DAY:
			frappe.throw(
				f"Allocated Minutes maksimal {MAX_MINUTES_PER_DAY:.0f} menit per hari",
				frappe.ValidationError,
			)
		planned = self.minutes_planned or 0
		if planned < 0:
			frappe.throw(
				"Minutes Planned tidak boleh negatif",
				frappe.ValidationError,
			)
		if planned > MAX_MINUTES_PER_DAY:
			frappe.throw(
				f"Minutes Planned maksimal {MAX_MINUTES_PER_DAY:.0f} menit",
				frappe.ValidationError,
			)

	def _validate_hour_start(self) -> None:
		"""hour_start must be a valid clock hour (0..23)."""
		hour = self.hour_start
		if hour is None:
			return
		if hour < MIN_HOUR or hour > MAX_HOUR:
			frappe.throw(
				f"Hour Start harus antara {MIN_HOUR} dan {MAX_HOUR}",
				frappe.ValidationError,
			)

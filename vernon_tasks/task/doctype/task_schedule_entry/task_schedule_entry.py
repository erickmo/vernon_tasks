"""Task Schedule Entry controller — child table on VT Task.

One row = one day's allocated work for a task. Validations enforce
realistic hour bounds and a valid clock-hour (0-23) so scheduling UI
calculations never see junk data.

Source of truth: docs/domains/task/README.html.
"""
import frappe
from frappe.model.document import Document

# Working-hour upper bound — a single day cannot have more than 24 hours of
# work. The UI typically caps at 12 but we permit up to 24 for catch-up days.
MAX_HOURS_PER_DAY = 24.0
MIN_HOUR = 0
MAX_HOUR = 23


class TaskScheduleEntry(Document):
	"""Per-day allocation row for a parent VT Task."""

	def validate(self) -> None:
		self._validate_hours()
		self._validate_hour_start()

	def _validate_hours(self) -> None:
		"""allocated_hours and hours_planned in (0, 24]."""
		allocated = self.allocated_hours or 0
		if allocated <= 0:
			frappe.throw(
				"Allocated Hours harus lebih besar dari 0",
				frappe.ValidationError,
			)
		if allocated > MAX_HOURS_PER_DAY:
			frappe.throw(
				f"Allocated Hours maksimal {MAX_HOURS_PER_DAY:.0f} jam per hari",
				frappe.ValidationError,
			)
		planned = self.hours_planned or 0
		if planned < 0:
			frappe.throw(
				"Hours Planned tidak boleh negatif",
				frappe.ValidationError,
			)
		if planned > MAX_HOURS_PER_DAY:
			frappe.throw(
				f"Hours Planned maksimal {MAX_HOURS_PER_DAY:.0f} jam",
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

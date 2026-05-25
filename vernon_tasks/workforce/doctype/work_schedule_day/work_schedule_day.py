"""Work Schedule Day — child table on Work Profile.

One row per weekday. When `is_working` is set, the optional start/end times
must form a valid window (start < end). The parent Work Profile enforces
uniqueness across the week so two "Monday" rows can't coexist.
"""
import frappe
from frappe.model.document import Document

ALLOWED_DAYS = (
	"Monday", "Tuesday", "Wednesday", "Thursday",
	"Friday", "Saturday", "Sunday",
)


class WorkScheduleDay(Document):
	"""One weekday schedule entry on the parent Work Profile."""

	def validate(self) -> None:
		self._validate_day_of_week()
		self._validate_time_window()

	def _validate_day_of_week(self) -> None:
		"""day_of_week required and must be one of the seven names."""
		if not self.day_of_week:
			frappe.throw("Day of Week wajib diisi", frappe.MandatoryError)
		if self.day_of_week not in ALLOWED_DAYS:
			frappe.throw(
				f"Day of Week tidak valid: '{self.day_of_week}'",
				frappe.ValidationError,
			)

	def _validate_time_window(self) -> None:
		"""When working AND both times set, start_time must be before end_time."""
		if not self.is_working:
			return
		if self.start_time and self.end_time:
			if self.start_time >= self.end_time:
				frappe.throw(
					f"{self.day_of_week}: Start Time harus sebelum End Time",
					frappe.ValidationError,
				)

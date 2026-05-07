import frappe
from frappe.model.document import Document


class WorkScheduleDay(Document):
	def validate(self):
		if self.is_working and self.start_time and self.end_time:
			if self.start_time >= self.end_time:
				frappe.throw(f"{self.day_of_week}: Start Time must be before End Time")

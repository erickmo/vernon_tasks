import frappe
from frappe.model.document import Document


class KeyResult(Document):
    def validate(self):
        if self.target_value <= 0:
            frappe.throw("Target Value must be greater than 0")
        ratio = self.current_value / self.target_value
        self.progress_percent = round(min(ratio, 1.0) * 100, 2)

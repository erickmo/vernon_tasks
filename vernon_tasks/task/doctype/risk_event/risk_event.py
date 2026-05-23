import frappe
from frappe.model.document import Document


class RiskEvent(Document):
    def validate(self):
        if self.severity not in ("high", "med", "low"):
            frappe.throw("Severity must be high/med/low")

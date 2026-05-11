import frappe
from frappe.model.document import Document


class VernonTelemetryEvent(Document):
    def before_insert(self):
        if not self.timestamp:
            self.timestamp = frappe.utils.now_datetime()
        if not self.user:
            self.user = frappe.session.user

import frappe
from frappe.model.document import Document


class VernonPushSubscription(Document):
    def before_insert(self):
        if not self.last_seen:
            self.last_seen = frappe.utils.now_datetime()

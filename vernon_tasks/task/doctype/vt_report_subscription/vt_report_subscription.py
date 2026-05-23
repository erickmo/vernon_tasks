import frappe
from frappe.model.document import Document

ALLOWED_SLUGS = {
    "project-health",
    "okr-pacing",
    "team-throughput",
    "my-points",
    "project-burndown-archive",
    "risk-log",
}


class VTReportSubscription(Document):
    def validate(self):
        if self.slug not in ALLOWED_SLUGS:
            frappe.throw(f"Unknown report slug: {self.slug}")
        if not self.recipients:
            frappe.throw("At least one recipient is required")

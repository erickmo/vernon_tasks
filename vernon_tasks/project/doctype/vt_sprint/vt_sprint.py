import frappe
from datetime import date as date_type
from frappe.model.document import Document
from frappe.utils import getdate


class VTSprint(Document):
    def validate(self):
        start = getdate(self.start_date)
        end = getdate(self.end_date)
        if end <= start:
            frappe.throw("Sprint End Date must be after Start Date")
        proj_start, proj_end = frappe.db.get_value(
            "VT Project", self.project, ["start_date", "end_date"]
        )
        proj_start = getdate(proj_start)
        proj_end = getdate(proj_end)
        if start < proj_start or end > proj_end:
            frappe.throw(
                f"Sprint dates must be within project range ({proj_start} to {proj_end})"
            )

    def get_total_weight(self) -> float:
        if not self.tasks:
            return 0.0
        task_names = [row.task for row in self.tasks if row.task]
        if not task_names:
            return 0.0
        total = frappe.db.sql(
            "SELECT SUM(weight) FROM `tabVT Task` WHERE name IN %(names)s",
            {"names": task_names}
        )
        return float(total[0][0] or 0)

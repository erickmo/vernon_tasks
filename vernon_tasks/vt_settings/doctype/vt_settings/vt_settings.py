import frappe
from frappe.model.document import Document


class VTSettings(Document):
    def validate(self):
        if self.weight_multiplier <= 0:
            frappe.throw("Weight Multiplier must be greater than 0")
        if self.early_bonus_rate < 0:
            frappe.throw("Early Bonus Rate cannot be negative")
        if self.late_penalty_rate < 0:
            frappe.throw("Late Penalty Rate cannot be negative")
        if self.revision_deduct_rate < 0:
            frappe.throw("Revision Deduction Rate cannot be negative")
        if self.default_daily_target_hours <= 0:
            frappe.throw("Default Daily Target Hours must be greater than 0")


def get_settings():
    return frappe.get_single("VT Settings")

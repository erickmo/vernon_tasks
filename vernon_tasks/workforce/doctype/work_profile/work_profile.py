import frappe
from frappe.model.document import Document


class WorkProfile(Document):
    def validate(self):
        if self.daily_target_hours <= 0:
            frappe.throw("Daily Target Hours must be greater than 0")
        self._validate_working_days_times()

    def _validate_working_days_times(self):
        for row in self.working_days:
            if row.is_working and row.start_time and row.end_time:
                if row.start_time >= row.end_time:
                    frappe.throw(
                        f"Start Time must be before End Time for {row.day_of_week}"
                    )

    def get_working_day_names(self) -> list:
        return [row.day_of_week for row in self.working_days if row.is_working]


def get_user_profile(user: str):
    name = frappe.db.get_value("Work Profile", {"user": user}, "name")
    if name:
        return frappe.get_doc("Work Profile", name)
    return None


def get_daily_target_hours(user: str) -> float:
    profile = get_user_profile(user)
    if profile:
        return profile.daily_target_hours
    settings = frappe.get_single("VT Settings")
    return settings.default_daily_target_hours or 8.0

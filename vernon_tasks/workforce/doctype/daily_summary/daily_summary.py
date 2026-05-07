import frappe
from frappe.model.document import Document
from frappe.utils import getdate, today


class DailySummary(Document):
    pass


def get_or_create_today(user: str, target_hours: float = 8.0) -> "DailySummary":
    date = getdate(today())
    name = frappe.db.get_value(
        "Daily Summary", {"user": user, "date": date}, "name"
    )
    if name:
        return frappe.get_doc("Daily Summary", name)
    doc = frappe.get_doc({
        "doctype": "Daily Summary",
        "user": user,
        "date": date,
        "target_hours": target_hours,
        "scheduled_hours": 0,
        "completed_hours": 0,
        "total_points_today": 0,
    })
    doc.insert(ignore_permissions=True)
    return doc


def update_scheduled_hours(user: str, date, delta: float) -> None:
    name = frappe.db.get_value("Daily Summary", {"user": user, "date": date}, "name")
    if name:
        current = frappe.db.get_value("Daily Summary", name, "scheduled_hours") or 0
        frappe.db.set_value("Daily Summary", name, "scheduled_hours", current + delta)


def generate_daily_summaries() -> None:
    from vernon_tasks.workforce.doctype.work_profile.work_profile import get_daily_target_hours
    users = frappe.get_all("Work Profile", fields=["user"])
    for u in users:
        get_or_create_today(u.user, get_daily_target_hours(u.user))

from datetime import date, timedelta
import frappe
from frappe.utils import getdate

DAY_NAME_TO_WEEKDAY = {
    "Monday": 0, "Tuesday": 1, "Wednesday": 2,
    "Thursday": 3, "Friday": 4, "Saturday": 5, "Sunday": 6,
}


def get_working_days_in_range(user: str, start: date, end: date) -> list:
    from vernon_tasks.workforce.doctype.work_profile.work_profile import get_user_profile
    profile = get_user_profile(user)
    if profile:
        working_weekdays = {
            DAY_NAME_TO_WEEKDAY[row.day_of_week]
            for row in profile.working_days
            if row.is_working
        }
    else:
        working_weekdays = {0, 1, 2, 3, 4}

    days = []
    cursor = start
    while cursor <= end:
        if cursor.weekday() in working_weekdays:
            days.append(cursor)
        cursor += timedelta(days=1)
    return days


def check_capacity_conflict(user: str, day: date, additional_minutes: float) -> bool:
    from vernon_tasks.workforce.doctype.work_profile.work_profile import get_daily_target_hours
    # Daily target is stored in hours; allocations are in minutes — compare in
    # minutes by converting the target (×60).
    MINUTES_PER_HOUR = 60
    target_minutes = (get_daily_target_hours(user) or 0) * MINUTES_PER_HOUR
    existing = frappe.db.sql("""
        SELECT COALESCE(SUM(se.allocated_minutes), 0)
        FROM `tabTask Schedule Entry` se
        INNER JOIN `tabVT Task` t ON t.name = se.parent
        WHERE t.assigned_to = %(user)s AND se.date = %(date)s AND t.docstatus < 2
    """, {"user": user, "date": day})[0][0] or 0.0
    return (float(existing) + additional_minutes) > target_minutes


def distribute_task_schedule(task_name: str) -> dict:
    task = frappe.get_doc("VT Task", task_name)
    if not task.start_date or not task.deadline or not task.assigned_to:
        frappe.throw("Task must have start_date, deadline, and assigned_to before scheduling")

    start = getdate(task.start_date)
    end = getdate(task.deadline)
    working_days = get_working_days_in_range(task.assigned_to, start, end)

    if not working_days:
        frappe.throw("No working days found between start date and deadline")

    minutes_per_day = round(task.estimated_minutes / len(working_days), 2)
    conflicts = []

    task.schedule_entries = []
    for day in working_days:
        if check_capacity_conflict(task.assigned_to, day, minutes_per_day):
            conflicts.append(str(day))
        task.append("schedule_entries", {
            "date": day, "allocated_minutes": minutes_per_day, "is_override": 0,
        })

    task.save(ignore_permissions=True)
    return {"conflicts": conflicts, "days_scheduled": len(working_days), "minutes_per_day": minutes_per_day}


def override_schedule_entry(task_name: str, day: date, new_minutes: float) -> None:
    task = frappe.get_doc("VT Task", task_name)
    for row in task.schedule_entries:
        if getdate(row.date) == day:
            row.allocated_minutes = new_minutes
            row.is_override = 1
            break

    override_total = sum(r.allocated_minutes for r in task.schedule_entries if r.is_override)
    remaining_minutes = task.estimated_minutes - override_total
    free_days = [r for r in task.schedule_entries if not r.is_override]

    if free_days and remaining_minutes > 0:
        per_day = round(remaining_minutes / len(free_days), 2)
        for row in free_days:
            row.allocated_minutes = per_day

    task.save(ignore_permissions=True)


def generate_recurring_tasks() -> None:
    from frappe.utils import getdate, today
    from vernon_tasks.task.doctype.recurring_rule.recurring_rule import get_next_occurrence, is_rule_expired
    today_date = getdate(today())
    recurring_tasks = frappe.get_all(
        "VT Task",
        filters={"is_recurring": 1, "next_occurrence": ["<=", today_date], "docstatus": ["<", 2]},
        fields=["name", "recurring_rule", "next_occurrence"],
    )
    for rec in recurring_tasks:
        task = frappe.get_doc("VT Task", rec.name)
        occurrence_count = frappe.db.count("VT Task", {"parent_task": task.name})
        if is_rule_expired(task.recurring_rule, occurrence_count, today_date):
            frappe.db.set_value("VT Task", task.name, "is_recurring", 0)
            continue
        new_task = frappe.copy_doc(task)
        new_task.pdca_phase = "BACKLOG"
        new_task.kanban_status = "Backlog"
        new_task.parent_task = task.name
        new_task.is_recurring = 0
        new_task.next_occurrence = None
        new_task.completion_date = None
        new_task.earned_points = 0
        new_task.base_points = 0
        new_task.leader_override_points = None
        new_task.revision_count = 0
        new_task.schedule_entries = []
        new_task.insert(ignore_permissions=True)
        next_occ = get_next_occurrence(task.recurring_rule, getdate(rec.next_occurrence))
        frappe.db.set_value("VT Task", task.name, "next_occurrence", next_occ)


def on_task_update(doc, method):
    pass


def check_deadline_notifications() -> None:
    from frappe.utils import add_days, today
    tomorrow = add_days(today(), 1)
    approaching = frappe.get_all(
        "VT Task",
        filters={"deadline": tomorrow, "pdca_phase": ["not in", ["DONE"]], "assigned_to": ["!=", ""]},
        fields=["name", "title", "assigned_to", "project"],
    )
    for task in approaching:
        frappe.sendmail(
            recipients=[task.assigned_to],
            subject=f"Task deadline tomorrow: {task.title}",
            message=f"Your task <b>{task.title}</b> is due tomorrow.",
        )

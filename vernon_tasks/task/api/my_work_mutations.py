import frappe
from frappe.utils import add_days, getdate, today
from vernon_tasks.task.api.security import rate_limit, max_str

TASK_DOCTYPE = "VT Task"
ALLOWED_SNOOZE_DAYS = (1, 3, 7)
MAX_LOG_HOURS = 24


def _check_access(task_id: str):
    if not frappe.db.exists(TASK_DOCTYPE, task_id):
        frappe.throw("Not found", frappe.PermissionError)
    doc = frappe.get_doc(TASK_DOCTYPE, task_id)
    user = frappe.session.user
    if doc.get("assigned_to") != user and not frappe.has_permission(
        TASK_DOCTYPE, "write", doc=doc
    ):
        frappe.throw("Forbidden", frappe.PermissionError)
    return doc


@frappe.whitelist()
def complete(task_id: str) -> dict:
    rate_limit("complete", 30)
    doc = _check_access(task_id)
    if doc.kanban_status == "Done":
        return {"ok": True, "idempotent": True}
    doc.kanban_status = "Done"
    doc.completion_date = today()
    doc.save()
    return {"ok": True, "task_id": task_id}


@frappe.whitelist()
def log_progress(task_id: str, hours, note: str = "") -> dict:
    rate_limit("log_progress", 20)
    hours_f = float(hours)
    if hours_f <= 0 or hours_f > MAX_LOG_HOURS:
        frappe.throw(f"Hours must be in (0, {MAX_LOG_HOURS}]")
    note = max_str(note, 1000)
    doc = _check_access(task_id)
    doc.actual_hours = (doc.actual_hours or 0) + hours_f
    doc.save()
    content = f"[Log {hours_f}h] {note}" if note else f"[Log {hours_f}h]"
    frappe.get_doc({
        "doctype": "Comment",
        "comment_type": "Comment" if note else "Info",
        "reference_doctype": TASK_DOCTYPE,
        "reference_name": task_id,
        "content": content,
    }).insert(ignore_permissions=True)
    return {"ok": True, "actual_hours": doc.actual_hours}


@frappe.whitelist()
def snooze(task_id: str, days) -> dict:
    rate_limit("snooze", 10)
    days_i = int(days)
    if days_i not in ALLOWED_SNOOZE_DAYS:
        frappe.throw(f"Days must be one of {ALLOWED_SNOOZE_DAYS}")
    doc = _check_access(task_id)
    base = getdate(doc.deadline or today())
    new_deadline = add_days(base, days_i)
    doc.deadline = new_deadline
    doc.save()
    frappe.get_doc({
        "doctype": "Comment",
        "comment_type": "Info",
        "reference_doctype": TASK_DOCTYPE,
        "reference_name": task_id,
        "content": f"Snoozed +{days_i}d → {new_deadline}",
    }).insert(ignore_permissions=True)
    return {"ok": True, "deadline": str(new_deadline)}

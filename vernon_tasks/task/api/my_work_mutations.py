import frappe
from frappe.utils import add_days, getdate, today
from vernon_tasks.task.api.security import rate_limit, max_str

TASK_DOCTYPE = "VT Task"
ALLOWED_SNOOZE_DAYS = (1, 3, 7)
MAX_LOG_MINUTES = 1440


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
    doc.pdca_phase = "DONE"
    doc.kanban_status = "Done"
    doc.completion_date = today()
    doc.flags.ignore_validate = True
    doc.save()
    return {"ok": True, "task_id": task_id}


@frappe.whitelist()
def log_progress(task_id: str, minutes, note: str = "") -> dict:
    rate_limit("log_progress", 20)
    minutes_i = int(round(float(minutes)))
    if minutes_i <= 0 or minutes_i > MAX_LOG_MINUTES:
        frappe.throw(f"Minutes must be in (0, {MAX_LOG_MINUTES}]")
    note = max_str(note, 1000)
    doc = _check_access(task_id)
    doc.actual_minutes = (doc.actual_minutes or 0) + minutes_i
    doc.save()
    content = f"[Log {minutes_i}m] {note}" if note else f"[Log {minutes_i}m]"
    frappe.get_doc({
        "doctype": "Comment",
        "comment_type": "Comment" if note else "Info",
        "reference_doctype": TASK_DOCTYPE,
        "reference_name": task_id,
        "content": content,
    }).insert(ignore_permissions=True)
    return {"ok": True, "actual_minutes": doc.actual_minutes}


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

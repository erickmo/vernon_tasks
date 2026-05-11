import frappe
from frappe.utils import today, add_days, getdate

TASK_DOCTYPE = "VT Task"


def _serialize(row: dict) -> dict:
    return {
        "id": row["name"],
        "title": row.get("title"),
        "status": row.get("kanban_status"),
        "priority": row.get("priority"),
        "due_date": row.get("deadline"),
        "project": row.get("project"),
        "sprint": row.get("sprint"),
        "points": row.get("base_points") or 0,
    }


@frappe.whitelist()
def list() -> dict:
    user = frappe.session.user
    if user == "Guest":
        frappe.throw("Login required", frappe.PermissionError)

    rows = frappe.get_all(
        TASK_DOCTYPE,
        filters=[
            ["assigned_to", "=", user],
            ["kanban_status", "!=", "Cancelled"],
        ],
        fields=["name", "title", "kanban_status", "priority", "deadline", "project", "sprint", "base_points"],
        order_by="deadline asc",
        limit_page_length=500,
    )

    today_d = getdate(today())
    upcoming_cap = add_days(today_d, 7)
    overdue, today_list, upcoming = [], [], []
    for r in rows:
        d = getdate(r["deadline"]) if r["deadline"] else None
        item = _serialize(r)
        if d is None or d > getdate(upcoming_cap):
            continue
        if d < today_d:
            overdue.append(item)
        elif d == today_d:
            today_list.append(item)
        else:
            upcoming.append(item)
    return {"overdue": overdue, "today": today_list, "upcoming": upcoming}


@frappe.whitelist()
def detail(task_id: str) -> dict:
    user = frappe.session.user
    if not frappe.db.exists(TASK_DOCTYPE, task_id):
        frappe.throw("Not found", frappe.PermissionError)

    doc = frappe.get_doc(TASK_DOCTYPE, task_id)
    if doc.get("assigned_to") != user and not frappe.has_permission(TASK_DOCTYPE, "read", doc=doc):
        frappe.throw("Forbidden", frappe.PermissionError)

    activity = frappe.get_all(
        "Comment",
        filters={"reference_doctype": TASK_DOCTYPE, "reference_name": task_id},
        fields=["content", "comment_type", "creation", "owner"],
        order_by="creation desc",
        limit_page_length=10,
    )
    return {
        **_serialize(doc.as_dict()),
        "description": None,
        "activity": activity,
    }

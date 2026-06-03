import frappe
from frappe.utils import today, add_days, getdate
from vernon_tasks.task.api.security import require_login, max_str

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
def search(
    query: str = "",
    priority: str = "",
    project: str = "",
    due_range: str = "all",
) -> dict:
    user = frappe.session.user
    if user == "Guest":
        frappe.throw("Login required", frappe.PermissionError)
    query = max_str(query, 200)

    filters: list = [
        ["assigned_to", "=", user],
        ["kanban_status", "!=", "Cancelled"],
    ]
    if query:
        filters.append(["title", "like", f"%{query}%"])
    if priority:
        choices = [p.strip() for p in priority.split(",") if p.strip()]
        if choices:
            filters.append(["priority", "in", choices])
    if project:
        filters.append(["project", "=", project])
    if due_range:
        today_d = getdate(today())
        if due_range == "today":
            filters.append(["deadline", "=", today_d])
        elif due_range == "week":
            filters.append(["deadline", "between", [today_d, add_days(today_d, 7)]])
        elif due_range == "overdue":
            filters.append(["deadline", "<", today_d])

    rows = frappe.get_all(
        TASK_DOCTYPE,
        filters=filters,
        fields=["name", "title", "kanban_status", "priority", "deadline", "project", "sprint", "base_points"],
        order_by="deadline asc",
        limit_page_length=200,
    )
    return {"results": [_serialize(r) for r in rows], "total": len(rows)}


@frappe.whitelist()
def detail(task_id: str) -> dict:
    require_login()
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


@frappe.whitelist()
def get_my_day() -> list:
    """
    Retrieve today's scheduled tasks for the current user.

    Returns tasks assigned to the current user with schedule entries for today,
    excluding completed tasks (pdca_phase = 'DONE').

    Ordered by priority (High, Medium, Low) and deadline.
    Moved from the retired my-work desk Page (now the vt-home "Tugas Saya" tab).
    """
    user = frappe.session.user
    return frappe.db.sql("""
        SELECT
            t.name, t.title, t.project, t.priority,
            t.pdca_phase, t.kanban_status,
            se.allocated_minutes
        FROM `tabVT Task` t
        INNER JOIN `tabTask Schedule Entry` se ON se.parent = t.name
        WHERE t.assigned_to = %(user)s
          AND se.date = %(date)s
          AND t.pdca_phase NOT IN ('DONE')
        ORDER BY
            FIELD(t.priority, 'High', 'Medium', 'Low'),
            t.deadline ASC
    """, {"user": user, "date": today()}, as_dict=True)


@frappe.whitelist()
def get_what_to_do_today() -> list:
    """
    Retrieve prioritized tasks for today based on PDCA phase and priority.

    Returns high-priority unfinished tasks that should be worked on today.
    Moved from the retired my-work desk Page.
    """
    user = frappe.session.user
    cutoff = add_days(today(), 3)
    return frappe.db.sql("""
        SELECT t.name, t.title, t.project, t.priority, t.deadline,
               t.pdca_phase, t.kanban_status
        FROM `tabVT Task` t
        WHERE t.assigned_to = %(user)s
          AND t.deadline <= %(cutoff)s
          AND t.pdca_phase NOT IN ('DONE', 'ACT')
          AND NOT EXISTS (
              SELECT 1 FROM `tabTask Dependency` td
              INNER JOIN `tabVT Task` bt ON bt.name = td.blocked_by
              WHERE td.parent = t.name AND bt.pdca_phase != 'DONE'
          )
        ORDER BY
            FIELD(t.priority, 'High', 'Medium', 'Low'),
            t.deadline ASC
    """, {"user": user, "cutoff": cutoff}, as_dict=True)


@frappe.whitelist()
def get_my_blocked_tasks() -> list:
    """
    Retrieve tasks that are currently blocked due to dependencies.

    Returns tasks where blockers are not yet completed.
    Moved from the retired my-work desk Page.
    """
    user = frappe.session.user
    return frappe.db.sql("""
        SELECT
            t.name, t.title, t.project, t.priority, t.deadline,
            t.pdca_phase, t.kanban_status,
            td.blocked_by AS blocker_name,
            bt.title AS blocker_title,
            bt.assigned_to AS blocker_assignee,
            DATEDIFF(CURDATE(), t.start_date) AS days_blocked
        FROM `tabVT Task` t
        INNER JOIN `tabTask Dependency` td ON td.parent = t.name
        INNER JOIN `tabVT Task` bt ON bt.name = td.blocked_by
        WHERE t.assigned_to = %(user)s
          AND t.pdca_phase NOT IN ('DONE')
          AND bt.pdca_phase != 'DONE'
        ORDER BY days_blocked DESC
    """, {"user": user}, as_dict=True)


@frappe.whitelist()
def start_task(task: str) -> dict:
    """
    Transition a task to 'In Progress' status.

    Args:
        task: Task name (ID)

    Returns:
        dict: {"status": "ok"} on success.
    Moved from the retired my-work desk Page.
    """
    user = frappe.session.user
    doc = frappe.db.get_value(
        "VT Task", task,
        ["assigned_to", "pdca_phase", "kanban_status", "title"],
        as_dict=True,
    )
    if not doc:
        frappe.throw(f"Task {task} not found", frappe.DoesNotExistError)
    if doc.assigned_to != user:
        frappe.throw("Not authorized to act on this task", frappe.PermissionError)
    if doc.pdca_phase not in ("BACKLOG", "PLAN"):
        frappe.throw(
            f"Task must be Backlog or Scheduled to start (current: {doc.kanban_status})",
            frappe.ValidationError,
        )
    blocker = frappe.db.sql("""
        SELECT bt.title FROM `tabTask Dependency` td
        INNER JOIN `tabVT Task` bt ON bt.name = td.blocked_by
        WHERE td.parent = %(task)s AND bt.pdca_phase != 'DONE'
        LIMIT 1
    """, {"task": task}, as_dict=True)
    if blocker:
        frappe.throw(
            f"Task is blocked by: {blocker[0].title}",
            frappe.ValidationError,
        )
    frappe.db.set_value("VT Task", task, {
        "pdca_phase": "DO",
        "kanban_status": "In Progress",
    })
    return {"status": "ok"}


@frappe.whitelist()
def submit_for_review(task: str) -> dict:
    """
    Submit a task for peer/manager review.

    Args:
        task: Task name (ID)

    Returns:
        dict: {"status": "ok"} on success.
    Moved from the retired my-work desk Page.
    """
    user = frappe.session.user
    doc = frappe.db.get_value(
        "VT Task", task,
        ["assigned_to", "pdca_phase", "kanban_status"],
        as_dict=True,
    )
    if not doc:
        frappe.throw(f"Task {task} not found", frappe.DoesNotExistError)
    if doc.assigned_to != user:
        frappe.throw("Not authorized to act on this task", frappe.PermissionError)
    if doc.pdca_phase != "DO":
        frappe.throw(
            f"Task must be In Progress to submit for review (current: {doc.kanban_status})",
            frappe.ValidationError,
        )
    frappe.db.set_value("VT Task", task, {
        "pdca_phase": "CHECK",
        "kanban_status": "In Review",
    })
    return {"status": "ok"}

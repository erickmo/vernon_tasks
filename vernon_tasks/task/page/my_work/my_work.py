import frappe
from frappe.utils import today, add_days

_PRIORITY_ORDER = ("High", "Medium", "Low")


@frappe.whitelist()
def get_my_day() -> list:
    """
    Retrieve today's scheduled tasks for the current user.

    Returns tasks assigned to the current user with schedule entries for today,
    excluding completed tasks (pdca_phase = 'DONE').

    Ordered by priority (High, Medium, Low) and deadline.
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
        Updated task document
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
        Updated task document with review status
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

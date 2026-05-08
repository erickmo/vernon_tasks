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
            se.allocated_hours
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
    pass


@frappe.whitelist()
def start_task(task: str) -> dict:
    """
    Transition a task to 'In Progress' status.

    Args:
        task: Task name (ID)

    Returns:
        Updated task document
    """
    pass


@frappe.whitelist()
def submit_for_review(task: str) -> dict:
    """
    Submit a task for peer/manager review.

    Args:
        task: Task name (ID)

    Returns:
        Updated task document with review status
    """
    pass

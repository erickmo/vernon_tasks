# vernon_tasks/api/portal_dashboard.py
from datetime import date
import frappe

ROLE_MANAGER = "VT Manager"
ROLE_LEADER  = "VT Leader"
ROLE_MEMBER  = "VT Member"

DOCTYPE_TASK   = "VT Task"
DOCTYPE_SPRINT = "VT Sprint"


def _is_leader_or_above(roles: set) -> bool:
    return bool({ROLE_MANAGER, "System Manager"} & roles) or ROLE_LEADER in roles


def _is_manager(roles: set) -> bool:
    return bool({ROLE_MANAGER, "System Manager"} & roles)


@frappe.whitelist()
def get_summary() -> dict:
    """Single-call aggregate for Dashboard summary bar. Cached 60s per user."""
    user  = frappe.session.user
    cache_key = f"portal_dashboard_summary_{user}"
    cached = frappe.cache().get_value(cache_key)
    if cached:
        return cached

    roles = set(frappe.get_roles(user))
    today = date.today().isoformat()

    # team_blocked + unassigned — only for leaders
    team_blocked = 0
    unassigned_tasks = 0
    if _is_leader_or_above(roles):
        team_blocked = frappe.db.count(DOCTYPE_TASK, filters={
            "assigned_to": ["!=", ""],
            "kanban_status": "Blocked",
        }) or 0
        unassigned_tasks = frappe.db.count(DOCTYPE_TASK, filters={
            "assigned_to": ["in", ["", None]],
            "status": ["!=", "Closed"],
        }) or 0

    # my overdue tasks
    my_overdue = frappe.db.count(DOCTYPE_TASK, filters={
        "assigned_to": user,
        "deadline": ["<", today],
        "kanban_status": ["not in", ["Done"]],
    }) or 0

    # OKR average progress
    okr_progress = 0.0
    try:
        rows = frappe.db.get_all("VT OKR", filters={"status": "Active"},
                                  fields=["progress_pct"])
        if rows:
            okr_progress = round(sum(r.progress_pct or 0 for r in rows) / len(rows), 1)
    except Exception:
        okr_progress = 0.0

    # sprint days remaining (nearest active sprint for user)
    sprint_days_remaining = 0
    sprints = frappe.db.get_all(
        DOCTYPE_SPRINT,
        filters={"status": "Active"},
        fields=["end_date"],
        order_by="end_date asc",
        limit=1,
    )
    if sprints and sprints[0].get("end_date"):
        delta = (sprints[0]["end_date"] - date.today()).days
        sprint_days_remaining = max(0, delta)

    result = {
        "team_blocked": team_blocked,
        "unassigned_tasks": unassigned_tasks,
        "okr_progress": okr_progress,
        "my_overdue": my_overdue,
        "sprint_days_remaining": sprint_days_remaining,
    }
    frappe.cache().set_value(cache_key, result, expires_in_sec=60)
    return result

# vernon_tasks/api/portal_dashboard.py
from datetime import date
import frappe

ROLE_MANAGER = "VT Manager"
ROLE_LEADER  = "VT Leader"
ROLE_MEMBER  = "VT Member"

ROLE_SYSTEM_MANAGER = "System Manager"
DOCTYPE_TASK   = "VT Task"
DOCTYPE_SPRINT = "VT Sprint"
DOCTYPE_OKR    = "VT OKR"
CACHE_TTL_SECONDS = 60


def _is_leader_or_above(roles: set) -> bool:
    return bool({ROLE_MANAGER, ROLE_SYSTEM_MANAGER} & roles) or ROLE_LEADER in roles


def _is_manager(roles: set) -> bool:
    return bool({ROLE_MANAGER, ROLE_SYSTEM_MANAGER} & roles)


def _count_team_blocked() -> int:
    return frappe.db.count(DOCTYPE_TASK, filters={
        "assigned_to": ["!=", ""],
        "kanban_status": "Blocked",
    }) or 0


def _count_unassigned() -> int:
    return frappe.db.count(DOCTYPE_TASK, filters={
        "assigned_to": ["in", ["", None]],
        "kanban_status": ["!=", "Done"],
    }) or 0


def _count_my_overdue(user: str, today: str) -> int:
    return frappe.db.count(DOCTYPE_TASK, filters={
        "assigned_to": user,
        "deadline": ["<", today],
        "kanban_status": ["not in", ["Done"]],
    }) or 0


def _avg_okr_progress() -> float:
    try:
        rows = frappe.db.get_all(DOCTYPE_OKR, filters={"status": "Active"},
                                  fields=["progress_pct"])
        if rows:
            return round(sum(r.progress_pct or 0 for r in rows) / len(rows), 1)
    except Exception:
        pass
    return 0.0


def _sprint_days_remaining() -> int:
    sprints = frappe.db.get_all(
        DOCTYPE_SPRINT,
        filters={"status": "Active"},
        fields=["end_date"],
        order_by="end_date asc",
        limit=1,
    )
    if sprints and sprints[0].get("end_date"):
        delta = (sprints[0]["end_date"] - date.today()).days
        return max(0, delta)
    return 0


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

    team_blocked = 0
    unassigned_tasks = 0
    if _is_leader_or_above(roles):
        team_blocked = _count_team_blocked()
        unassigned_tasks = _count_unassigned()

    result = {
        "team_blocked": team_blocked,
        "unassigned_tasks": unassigned_tasks,
        "okr_progress": _avg_okr_progress(),
        "my_overdue": _count_my_overdue(user, today),
        "sprint_days_remaining": _sprint_days_remaining(),
    }
    frappe.cache().set_value(cache_key, result, expires_in_sec=CACHE_TTL_SECONDS)
    return result

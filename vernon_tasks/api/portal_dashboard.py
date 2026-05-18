# vernon_tasks/api/portal_dashboard.py
from datetime import date, timedelta
import frappe

ROLE_MANAGER = "VT Manager"
ROLE_LEADER  = "VT Leader"
ROLE_MEMBER  = "VT Member"

ROLE_SYSTEM_MANAGER = "System Manager"
DOCTYPE_TASK    = "VT Task"
DOCTYPE_SPRINT  = "VT Sprint"
DOCTYPE_PROJECT = "VT Project"
DOCTYPE_OKR    = "VT OKR"
CACHE_TTL_SECONDS = 60

MEMBER_STATUS_BLOCKED  = "blocked"
MEMBER_STATUS_OVERDUE  = "overdue"
MEMBER_STATUS_ON_TRACK = "on_track"


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


def _task_member_status(t: dict, today: str) -> str:
    """Derive member status from a single task row."""
    if t["kanban_status"] == "Blocked":
        return MEMBER_STATUS_BLOCKED
    if t.get("deadline") and str(t["deadline"]) < today and t["kanban_status"] != "Done":
        return MEMBER_STATUS_OVERDUE
    return MEMBER_STATUS_ON_TRACK


@frappe.whitelist()
def get_team_pulse(project: str | None = None) -> list:
    """Returns member status for Leader section. Leader+ only."""
    roles = set(frappe.get_roles(frappe.session.user))
    if not _is_leader_or_above(roles):
        raise frappe.PermissionError("Leader role required")

    filters: dict = {"assigned_to": ["!=", ""], "kanban_status": ["!=", "Done"]}
    if project:
        filters["project"] = project

    tasks = frappe.db.get_all(
        DOCTYPE_TASK,
        filters=filters,
        fields=["name", "title", "assigned_to", "kanban_status", "pdca_phase", "deadline"],
        order_by="assigned_to asc",
        limit=50,
    )

    today = date.today().isoformat()
    members: dict[str, dict] = {}
    for t in tasks:
        member = t["assigned_to"]
        if member not in members:
            members[member] = {
                "user": member,
                "task_id": t["name"],
                "task_title": t["title"],
                "pdca_phase": t.get("pdca_phase", ""),
                "kanban_status": t["kanban_status"],
                "status": _task_member_status(t, today),
            }
    return list(members.values())


@frappe.whitelist()
def get_unassigned_tasks(project: str | None = None) -> list:
    """Tasks without assigned_to in active sprint. Leader+ only."""
    roles = set(frappe.get_roles(frappe.session.user))
    if not _is_leader_or_above(roles):
        raise frappe.PermissionError("Leader role required")

    filters: dict = {
        "assigned_to": ["in", ["", None]],
        "kanban_status": ["not in", ["Done"]],
    }
    if project:
        filters["project"] = project

    tasks = frappe.db.get_all(
        DOCTYPE_TASK,
        filters=filters,
        fields=["name", "title", "pdca_phase", "sprint", "project"],
        order_by="creation desc",
        limit=20,
    )
    return tasks


@frappe.whitelist()
def get_my_tasks_timeline(days_back: int = 3, days_forward: int = 3) -> dict:
    """Tasks grouped by deadline date for H-N..H+N timeline."""
    user  = frappe.session.user
    today = date.today()
    start = (today - timedelta(days=int(days_back))).isoformat()
    end   = (today + timedelta(days=int(days_forward))).isoformat()

    tasks = frappe.db.get_all(
        DOCTYPE_TASK,
        filters={
            "assigned_to": user,
            "deadline": ["between", [start, end]],
        },
        fields=["name", "title", "deadline", "pdca_phase", "kanban_status"],
        order_by="deadline asc",
    )

    result: dict[str, list] = {}
    for t in tasks:
        key = str(t["deadline"]) if t.get("deadline") else "no_date"
        result.setdefault(key, []).append({
            "id": t["name"],
            "title": t["title"],
            "pdca_phase": t.get("pdca_phase", ""),
            "done": t.get("kanban_status") == "Done",
        })
    return result


@frappe.whitelist()
def get_portfolio_summary() -> list:
    """Project list with RAG status. Manager only."""
    roles = set(frappe.get_roles(frappe.session.user))
    if not _is_manager(roles):
        raise frappe.PermissionError("Manager role required")

    projects = frappe.db.get_all(
        DOCTYPE_PROJECT,
        filters={"status": ["!=", "Closed"]},
        fields=["name", "title", "status"],
        order_by="creation desc",
    )

    result = []
    for p in projects:
        total = frappe.db.count(DOCTYPE_TASK, filters={"project": p["name"]}) or 0
        done  = frappe.db.count(DOCTYPE_TASK,
                                 filters={"project": p["name"], "kanban_status": "Done"}) or 0
        pct   = round(done / total * 100) if total else 0
        rag   = "green" if pct >= 70 else ("amber" if pct >= 40 else "red")

        sprint = frappe.db.get_value(
            DOCTYPE_SPRINT,
            filters={"project": p["name"], "status": "Active"},
            fieldname=["name", "title", "end_date"],
            as_dict=True,
        )
        result.append({
            "project": p["name"],
            "title": p["title"],
            "progress_pct": pct,
            "rag": rag,
            "sprint_title": sprint.get("title") if sprint else None,
            "sprint_days_remaining": (
                max(0, (sprint["end_date"] - date.today()).days)
                if sprint and sprint.get("end_date") else None
            ),
        })
    return result

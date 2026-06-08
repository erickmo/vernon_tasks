"""leader-review page API: review queue, team workload, blocked tasks.

Reads/writes the unified VT Item tree (node_type Project/Task/Sprint) instead
of the legacy VT Task / VT Project / VT Sprint doctypes. Field renames vs
legacy: VT Project ``project_leader`` -> VT Item ``leader_user``; VT Task
``assigned_to`` -> VT Item ``owner_user``; VT Sprint ``status`` -> VT Item
``sprint_state``; a Task's ``project`` link is now implicit tree ancestry
(``tree.project_of``). PDCA "done" is ``pdca_phase == 'CLOSED'``. Review fields
(review_scheduled_date / rejection_note / revision_count) keep their names.

The API response shapes are kept identical to the legacy SQL output so the
frontend (leader_review.js) keeps working unchanged: each task row still
exposes an ``assigned_to`` key (mapped from ``owner_user``) and workload rows
still expose ``total_minutes``.
"""
import frappe

from vernon_tasks.task.services import vt_item_tree as tree

_PROJECT_NODE = "Project"
_TASK_NODE = "Task"
_SPRINT_NODE = "Sprint"
_LEADER_ROLE = "Leader"

# pdca_phase values that count as "done" (legacy DONE -> CLOSED) and the set
# excluded from workload (no active capacity consumed).
_CLOSED_PHASE = "CLOSED"
_WORKLOAD_EXCLUDED_PHASES = ["BACKLOG", "CLOSED"]

_PRIORITY_ORDER = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}
_FAR_FUTURE = "9999-12-31"

# Task-node fields the review queue needs. owner_user is mapped to the
# legacy-named ``assigned_to`` key before returning to the frontend.
_REVIEW_FIELDS = [
    "name", "title", "priority", "deadline", "owner_user",
    "pdca_phase", "kanban_status", "estimated_minutes", "review_scheduled_date",
]


def _leader_project_names(user: str) -> list:
    """Project node names where ``user`` is the leader_user OR a team_members
    row with role Leader. Mirrors the legacy UNION of VT Project.project_leader
    and Project Team Member(role='Leader')."""
    names = {
        row["name"]
        for row in tree.nodes(_PROJECT_NODE, filters={"leader_user": user},
            fields=["name"])
    }
    for proj in tree.nodes(_PROJECT_NODE, fields=["name"]):
        for member in tree.child_table_rows(proj["name"], "team_members"):
            if member.get("user") == user and member.get("role") == _LEADER_ROLE:
                names.add(proj["name"])
                break
    return list(names)


def _is_leader_of_project(user: str, project: str) -> bool:
    proj_leader = frappe.db.get_value("VT Item", project, "leader_user")
    if proj_leader == user:
        return True
    for member in tree.child_table_rows(project, "team_members"):
        if member.get("user") == user and member.get("role") == _LEADER_ROLE:
            return True
    return False


@frappe.whitelist()
def get_review_queue() -> list:
    user = frappe.session.user
    projects = _leader_project_names(user)
    if not projects:
        return []
    rows = []
    for project in projects:
        tasks = tree.descendants(
            project, node_type=_TASK_NODE,
            filters={"pdca_phase": "CHECK"}, fields=_REVIEW_FIELDS,
        )
        for t in tasks:
            t["project"] = project
            t["assigned_to"] = t.pop("owner_user", None)
            rows.append(t)
    rows.sort(key=lambda t: (
        _PRIORITY_ORDER.get(t.get("priority"), len(_PRIORITY_ORDER)),
        t.get("deadline") or _FAR_FUTURE,
    ))
    return rows


@frappe.whitelist()
def get_team_workload() -> list:
    user = frappe.session.user
    projects = _leader_project_names(user)
    if not projects:
        return []
    totals: dict = {}
    for project in projects:
        tasks = tree.descendants(
            project, node_type=_TASK_NODE,
            filters={"pdca_phase": ["not in", _WORKLOAD_EXCLUDED_PHASES]},
            fields=["owner_user", "estimated_minutes"],
        )
        for t in tasks:
            owner = t.get("owner_user")
            if not owner:
                continue
            totals[owner] = totals.get(owner, 0) + (t.get("estimated_minutes") or 0)
    capacity = frappe.db.get_single_value("VT Settings", "default_daily_target_hours") or 8.0
    rows = [
        {
            "assigned_to": owner,
            "total_minutes": total,
            "capacity": float(capacity),
            "overloaded": total > float(capacity),
        }
        for owner, total in totals.items()
    ]
    rows.sort(key=lambda r: r["total_minutes"], reverse=True)
    return rows


@frappe.whitelist()
def get_team_blocked_tasks() -> list:
    user = frappe.session.user
    projects = _leader_project_names(user)
    if not projects:
        return []
    from frappe.utils import date_diff, today

    rows = []
    for project in projects:
        tasks = tree.descendants(
            project, node_type=_TASK_NODE,
            filters={"pdca_phase": ["not in", [_CLOSED_PHASE]]},
            fields=["name", "title", "priority", "deadline", "owner_user",
                "pdca_phase", "kanban_status", "start_date"],
        )
        for t in tasks:
            for dep in tree.child_table_rows(t["name"], "dependencies"):
                blocker_name = dep.get("blocked_by")
                if not blocker_name:
                    continue
                blocker = frappe.db.get_value(
                    "VT Item", blocker_name,
                    ["title", "owner_user", "pdca_phase"], as_dict=True,
                )
                if not blocker or blocker.pdca_phase == _CLOSED_PHASE:
                    continue
                rows.append({
                    "name": t["name"],
                    "title": t["title"],
                    "project": project,
                    "priority": t.get("priority"),
                    "deadline": t.get("deadline"),
                    "assigned_to": t.get("owner_user"),
                    "pdca_phase": t.get("pdca_phase"),
                    "kanban_status": t.get("kanban_status"),
                    "blocker_name": blocker_name,
                    "blocker_title": blocker.title,
                    "blocker_assignee": blocker.owner_user,
                    "days_blocked": date_diff(today(), t.get("start_date"))
                        if t.get("start_date") else 0,
                })
    rows.sort(key=lambda r: r["days_blocked"], reverse=True)
    return rows


@frappe.whitelist()
def approve_task(task_name: str) -> dict:
    user = frappe.session.user
    # Acquire row lock to prevent concurrent approvals.
    locked = frappe.db.sql(
        "SELECT name, pdca_phase, kanban_status FROM `tabVT Item` WHERE name=%s FOR UPDATE",
        task_name, as_dict=True
    )
    if not locked:
        frappe.throw(f"Task {task_name} not found", frappe.DoesNotExistError)
    row = locked[0]
    project = tree.project_of(task_name)
    if not _is_leader_of_project(user, project):
        frappe.throw("Not authorized to approve this task", frappe.PermissionError)
    if row.pdca_phase != "CHECK":
        frappe.throw(
            f"Task must be in CHECK phase to approve (current phase: {row.pdca_phase})",
            frappe.ValidationError,
        )
    doc = frappe.get_doc("VT Item", task_name)
    doc.pdca_phase = _CLOSED_PHASE
    doc.save(ignore_permissions=True)
    doc.submit()
    return {"status": "ok"}


@frappe.whitelist()
def reject_task(task_name: str, reason: str) -> dict:
    user = frappe.session.user
    if not reason or not reason.strip():
        frappe.throw("Rejection reason is required", frappe.ValidationError)
    doc = frappe.get_doc("VT Item", task_name)
    project = tree.project_of(task_name)
    if not _is_leader_of_project(user, project):
        frappe.throw("Not authorized to reject this task", frappe.PermissionError)
    if doc.pdca_phase != "CHECK":
        frappe.throw(
            f"Task must be in CHECK phase to reject (current phase: {doc.pdca_phase})",
            frappe.ValidationError,
        )
    current_revisions = frappe.db.get_value("VT Item", task_name, "revision_count") or 0
    frappe.db.set_value("VT Item", task_name, {
        "pdca_phase": "DO",
        "kanban_status": "In Progress",
        "rejection_note": reason.strip(),
        "revision_count": current_revisions + 1,
    })
    return {"status": "ok"}


@frappe.whitelist()
def get_my_led_projects() -> list:
    return _leader_project_names(frappe.session.user)


@frappe.whitelist()
def get_latest_sprint(project: str):
    user = frappe.session.user
    if not _is_leader_of_project(user, project):
        frappe.throw("Not authorized", frappe.PermissionError)
    rows = tree.descendants(
        project, node_type=_SPRINT_NODE,
        fields=["name", "title", "start_date", "end_date", "sprint_state"],
        order_by="start_date desc",
    )
    if not rows:
        return None
    sprint = rows[0]
    # Preserve the legacy ``status`` key the frontend expects (renamed field).
    sprint["status"] = sprint.pop("sprint_state", None)
    return sprint

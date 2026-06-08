"""vt-team page API: team capacity and workload for Leaders and Managers.

Computes per-member utilization from Work Profile (daily_target_hours)
vs active task estimated_minutes. Returns sorted by utilization descending.

Task workload reads from the unified VT Item tree (node_type="Task") instead
of the legacy VT Task doctype: when a Project is given we take its tree
descendants, otherwise every Task node. Field renames vs legacy: VT Task
``assigned_to`` -> VT Item ``owner_user``; ``project`` -> tree ancestry
(``parent_vt_item``). ``kanban_status``/``estimated_minutes``/``deadline``
are unchanged on the Task node.
"""
from __future__ import annotations

import frappe

from vernon_tasks.task.services import vt_item_tree as tree

_ALLOWED_ROLES = ("VT Leader", "VT Manager")
_PROFILE_DOCTYPE = "Work Profile"
_TASK_NODE_TYPE = "Task"
_ACTIVE_STATUSES = ("Scheduled", "In Progress", "In Review")
_WORKING_DAYS_PER_WEEK = 5
# Task-node fields the page needs; parent_vt_item replaces the legacy
# VT Task.project link (a Task node's parent may be a Sprint or the Project).
_TASK_FIELDS = ["name", "title", "estimated_minutes", "kanban_status", "deadline", "parent_vt_item"]


def _require_leader() -> None:
    """Raise PermissionError unless caller holds VT Leader or VT Manager."""
    frappe.only_for(_ALLOWED_ROLES)


def _active_tasks_for(user: str, project: str | None) -> list[dict]:
    """Active Task nodes assigned to ``user`` from the VT Item tree.

    When ``project`` (a Project VT Item name) is given, scope to that
    Project's tree descendants; otherwise return every Task node. Filters by
    owner_user and the active kanban statuses.
    """
    task_filters = {
        "owner_user": user,
        "kanban_status": ("in", list(_ACTIVE_STATUSES)),
    }
    if project:
        return tree.descendants(
            project, node_type=_TASK_NODE_TYPE,
            filters=task_filters, fields=_TASK_FIELDS,
        )
    return tree.nodes(_TASK_NODE_TYPE, filters=task_filters, fields=_TASK_FIELDS)


@frappe.whitelist()
def get_team_capacity(project: str | None = None) -> list[dict]:
    """Return per-member utilization computed from Work Profile vs active tasks.

    utilization_pct = total_estimated_hours / (daily_target_hours * 5) * 100
    Sorted by utilization_pct descending (most loaded first).
    """
    _require_leader()

    profiles = frappe.get_all(
        _PROFILE_DOCTYPE,
        fields=["user", "daily_target_hours"],
    )

    # Batch-fetch all full_names to avoid N+1 query
    user_names = [p["user"] for p in profiles]
    name_map = {
        r["name"]: r["full_name"] or r["name"]
        for r in frappe.get_all("User", filters={"name": ("in", user_names)}, fields=["name", "full_name"])
    } if user_names else {}

    result: list[dict] = []
    for profile in profiles:
        user = profile["user"]
        daily_target = profile["daily_target_hours"] or 8.0

        tasks = _active_tasks_for(user, project)

        total_hours = sum((t["estimated_minutes"] or 0) / 60.0 for t in tasks)
        capacity_hours = daily_target * _WORKING_DAYS_PER_WEEK
        utilization_pct = round((total_hours / capacity_hours) * 100, 1) if capacity_hours else 0.0

        full_name = name_map.get(user, user)

        result.append({
            "user": user,
            "full_name": full_name,
            "daily_target_hours": daily_target,
            "active_tasks": len(tasks),
            "total_estimated_hours": round(total_hours, 1),
            "utilization_pct": utilization_pct,
            "tasks": tasks,
        })

    result.sort(key=lambda x: x["utilization_pct"], reverse=True)
    return result

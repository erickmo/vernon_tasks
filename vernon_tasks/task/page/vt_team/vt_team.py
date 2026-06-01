"""vt-team page API: team capacity and workload for Leaders and Managers.

Computes per-member utilization from Work Profile (daily_target_hours)
vs active task estimated_minutes. Returns sorted by utilization descending.
"""
from __future__ import annotations

import frappe

_ALLOWED_ROLES = ("VT Leader", "VT Manager")
_PROFILE_DOCTYPE = "Work Profile"
_TASK_DOCTYPE = "VT Task"
_ACTIVE_STATUSES = ("Scheduled", "In Progress", "In Review")
_WORKING_DAYS_PER_WEEK = 5


def _require_leader() -> None:
    """Raise PermissionError unless caller holds VT Leader or VT Manager."""
    frappe.only_for(_ALLOWED_ROLES)


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

    result: list[dict] = []
    for profile in profiles:
        user = profile["user"]
        daily_target = profile["daily_target_hours"] or 8.0

        task_filters: dict = {
            "assigned_to": user,
            "kanban_status": ("in", list(_ACTIVE_STATUSES)),
        }
        if project:
            task_filters["project"] = project

        tasks = frappe.get_all(
            _TASK_DOCTYPE,
            filters=task_filters,
            fields=["name", "title", "estimated_minutes", "kanban_status", "deadline", "project"],
        )

        total_hours = sum((t["estimated_minutes"] or 0) / 60.0 for t in tasks)
        capacity_hours = daily_target * _WORKING_DAYS_PER_WEEK
        utilization_pct = round((total_hours / capacity_hours) * 100, 1) if capacity_hours else 0.0

        full_name = frappe.db.get_value("User", user, "full_name") or user

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

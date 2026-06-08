"""vt-scorecard page API: personal point log and monthly summary.

Exposes get_point_log and get_monthly_summary for VT Member, Leader, Manager.
Managers may optionally query a different user via the `user` param.
"""
from __future__ import annotations

import frappe

from vernon_tasks.task.services import vt_item_tree as tree

_ALLOWED_ROLES = ("VT Member", "VT Leader", "VT Manager")
_MANAGER_ROLE = "VT Manager"
_LOG_DOCTYPE = "Task Point Log"
_SUMMARY_DOCTYPE = "User Point Summary"
# Tasks are now VT Item nodes (node_type="Task"); titles read via VT Item.
_ITEM_DOCTYPE = "VT Item"


def _resolve_target_user(user: str | None) -> str:
    """Return the user whose data to query.

    Non-managers always get their own data regardless of the `user` param.
    Managers may specify a different user to view their scorecard.
    """
    frappe.only_for(_ALLOWED_ROLES)
    if user and _MANAGER_ROLE in frappe.get_roles():
        return user
    return frappe.session.user


@frappe.whitelist()
def get_point_log(user: str | None = None, project: str | None = None,
                  limit: int = 50, offset: int = 0) -> list[dict]:
    """Return paginated Task Point Log rows for a user, newest first.

    Each row is enriched with task_title from the linked VT Item Task node.
    """
    target = _resolve_target_user(user)
    filters: dict = {"user": target}

    if project:
        # Legacy VT Task.project=P is now the nested-set tree: a Project's
        # Tasks are its Task-typed descendants (spans skipped Sprint levels).
        task_names = [t["name"] for t in tree.descendants(project, node_type="Task", fields=["name"])]
        if not task_names:
            return []
        filters["task"] = ("in", task_names)

    rows = frappe.get_all(
        _LOG_DOCTYPE,
        filters=filters,
        fields=["name", "task", "transaction_type", "amount", "original_amount",
                "log_timestamp", "note", "overridden_by"],
        order_by="log_timestamp desc",
        limit=int(limit),
        start=int(offset),
    )

    title_cache: dict[str, str] = {}
    for row in rows:
        task = row["task"]
        if task not in title_cache:
            title_cache[task] = frappe.db.get_value(_ITEM_DOCTYPE, task, "title") or task
        row["task_title"] = title_cache[task]

    return rows


@frappe.whitelist()
def get_monthly_summary(user: str | None = None, months: int = 6) -> list[dict]:
    """Return last N monthly User Point Summary rows in chronological order."""
    target = _resolve_target_user(user)

    rows = frappe.get_all(
        _SUMMARY_DOCTYPE,
        filters={"user": target},
        fields=["period", "total_earned", "total_penalty", "total_bonus",
                "total_override_delta", "net_points"],
        order_by="period desc",
        limit=int(months),
    )

    return list(reversed(rows))

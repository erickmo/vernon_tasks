"""Portal Worksheet API."""
from __future__ import annotations

from datetime import date as Date, timedelta

import frappe

from vernon_tasks.task.api.security import max_str, require_login
from vernon_tasks.task.services.worksheet_aggregator import build_worksheet

_WEEK_START_MAX_LEN = 10
_DAYS_IN_WEEK = 7
_SCHEDULE_ENTRY_TABLE = "tabTask Schedule Entry"
_TASK_TABLE = "tabVT Task"
_USER_TABLE = "tabUser"
_LEADER_ROLES = ("Vernon Leader", "Vernon PM")
_NOT_SUPPORTED_MSG = "Schedule entries not yet supported"


@frappe.whitelist()
def get_worksheet(week_start: str) -> dict:
    require_login()
    return build_worksheet(
        user=frappe.session.user,
        week_start=max_str(week_start, _WEEK_START_MAX_LEN),
    )


@frappe.whitelist()
def schedule_task(
    task_id: str,
    date: str,
    hour_start: int = 8,
    hours: float = 1.0,
) -> dict:
    require_login()
    frappe.throw(_NOT_SUPPORTED_MSG)


@frappe.whitelist()
def update_entry(
    entry_id: str,
    date: str | None = None,
    hour_start: int | None = None,
    hours: float | None = None,
) -> dict:
    require_login()
    frappe.throw(_NOT_SUPPORTED_MSG)


@frappe.whitelist()
def unschedule(entry_id: str) -> dict:
    require_login()
    frappe.throw(_NOT_SUPPORTED_MSG)


@frappe.whitelist()
def bulk_carry_over(week_start: str) -> dict:
    require_login()
    frappe.throw(_NOT_SUPPORTED_MSG)


@frappe.whitelist()
def get_team_worksheet(week_start: str) -> list[dict]:
    require_login()
    user = frappe.session.user
    user_roles = set(frappe.get_roles(user))
    if user != "Administrator" and not user_roles.intersection(set(_LEADER_ROLES)):
        raise frappe.PermissionError("Team view requires Leader/PM role")

    start = Date.fromisoformat(max_str(week_start, _WEEK_START_MAX_LEN))
    end = start + timedelta(days=_DAYS_IN_WEEK - 1)

    try:
        rows = frappe.db.sql(
            f"""
            SELECT t.assigned_to AS user,
                   u.full_name,
                   se.date,
                   SUM(se.allocated_hours) AS hours,
                   COUNT(*) AS task_count
              FROM `{_SCHEDULE_ENTRY_TABLE}` se
              JOIN `{_TASK_TABLE}` t ON t.name = se.parent
              JOIN `{_USER_TABLE}` u ON u.name = t.assigned_to
             WHERE se.parenttype = 'VT Task'
               AND se.date BETWEEN %(s)s AND %(e)s
             GROUP BY t.assigned_to, se.date, u.full_name
             ORDER BY u.full_name, se.date
            """,
            {"s": start, "e": end},
            as_dict=True,
        )
    except frappe.db.DatabaseError:
        return []

    by_user: dict[str, dict] = {}
    for r in rows:
        u = by_user.setdefault(r.user, {
            "user": r.user,
            "full_name": r.full_name,
            "days": {
                str(start + timedelta(days=i)): {"hours": 0, "task_count": 0}
                for i in range(_DAYS_IN_WEEK)
            },
        })
        u["days"][str(r.date)] = {
            "hours": float(r.hours or 0),
            "task_count": int(r.task_count or 0),
        }
    return list(by_user.values())

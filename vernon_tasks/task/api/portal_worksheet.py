"""Portal Worksheet API."""
from __future__ import annotations

from datetime import date as Date, timedelta

import frappe

from vernon_tasks.task.api.security import max_str, require_login
from vernon_tasks.task.services.worksheet_aggregator import build_worksheet

_WEEK_START_MAX_LEN = 10
_HOUR_MIN = 0
_HOUR_MAX = 23
_HOURS_MIN = 0.25
_HOURS_MAX = 12.0
_DEFAULT_HOUR_START = 8
_DEFAULT_HOURS = 1.0
_DAYS_IN_WEEK = 7
_SCHEDULE_ENTRY_DOCTYPE = "VT Task Schedule Entry"
_TASK_DOCTYPE = "VT Task"
_LEADER_ROLES = ("Vernon Leader", "Vernon PM")
_CLOSED_STATUSES = ("DONE", "ACT")


def _clamp(value, lo, hi):
    """Bound `value` to the inclusive range [lo, hi]."""
    if value < lo:
        return lo
    if value > hi:
        return hi
    return value


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
    hour_start: int = _DEFAULT_HOUR_START,
    hours: float = _DEFAULT_HOURS,
) -> dict:
    require_login()
    user = frappe.session.user

    owner = frappe.db.get_value(_TASK_DOCTYPE, task_id, "assignee")
    if owner != user:
        raise frappe.PermissionError("Cannot schedule another user's task")

    entry = frappe.get_doc({
        "doctype": _SCHEDULE_ENTRY_DOCTYPE,
        "task": task_id,
        "owner_user": user,
        "date": date,
        "hour_start": _clamp(int(hour_start), _HOUR_MIN, _HOUR_MAX),
        "hours_planned": float(_clamp(float(hours), _HOURS_MIN, _HOURS_MAX)),
    }).insert()
    return {"entry_id": entry.name}


@frappe.whitelist()
def update_entry(
    entry_id: str,
    date: str | None = None,
    hour_start: int | None = None,
    hours: float | None = None,
) -> dict:
    require_login()
    e = frappe.get_doc(_SCHEDULE_ENTRY_DOCTYPE, entry_id)
    if e.owner_user != frappe.session.user:
        raise frappe.PermissionError
    if date is not None:
        e.date = date
    if hour_start is not None:
        e.hour_start = _clamp(int(hour_start), _HOUR_MIN, _HOUR_MAX)
    if hours is not None:
        e.hours_planned = float(_clamp(float(hours), _HOURS_MIN, _HOURS_MAX))
    e.save()
    return {"entry_id": e.name}


@frappe.whitelist()
def unschedule(entry_id: str) -> dict:
    require_login()
    e = frappe.get_doc(_SCHEDULE_ENTRY_DOCTYPE, entry_id)
    if e.owner_user != frappe.session.user:
        raise frappe.PermissionError
    e.delete()
    return {"deleted": entry_id}


@frappe.whitelist()
def bulk_carry_over(week_start: str) -> dict:
    require_login()
    user = frappe.session.user
    cur = Date.fromisoformat(week_start)
    nxt = cur + timedelta(days=_DAYS_IN_WEEK)

    # Compat shim: schedule entry doctype may not yet be installed.
    if not frappe.db.table_exists(_SCHEDULE_ENTRY_DOCTYPE):
        return {"moved": 0}

    incomplete = frappe.db.sql(
        """
        SELECT se.name, se.task FROM `tabVT Task Schedule Entry` se
          JOIN `tabVT Task` t ON t.name = se.task
         WHERE se.owner_user = %(u)s
           AND se.date BETWEEN %(s)s AND %(e)s
           AND t.status NOT IN %(closed)s
        """,
        {
            "u": user,
            "s": cur,
            "e": cur + timedelta(days=_DAYS_IN_WEEK - 1),
            "closed": _CLOSED_STATUSES,
        },
        as_dict=True,
    )
    moved = 0
    for row in incomplete:
        frappe.db.set_value(_SCHEDULE_ENTRY_DOCTYPE, row.name, "date", nxt)
        moved += 1
    return {"moved": moved}


@frappe.whitelist()
def get_team_worksheet(week_start: str) -> list[dict]:
    require_login()
    user = frappe.session.user
    user_roles = set(frappe.get_roles(user))
    if user != "Administrator" and not user_roles.intersection(set(_LEADER_ROLES)):
        raise frappe.PermissionError("Team view requires Leader/PM role")

    start = Date.fromisoformat(week_start)
    end = start + timedelta(days=_DAYS_IN_WEEK - 1)

    # Compat shim: schedule entry doctype may not yet be installed.
    if not frappe.db.table_exists(_SCHEDULE_ENTRY_DOCTYPE):
        return []

    rows = frappe.db.sql(
        """
        SELECT se.owner_user AS user, u.full_name, se.date,
               SUM(se.hours_planned) AS hours,
               COUNT(*) AS task_count
          FROM `tabVT Task Schedule Entry` se
          JOIN `tabUser` u ON u.name = se.owner_user
         WHERE se.date BETWEEN %(s)s AND %(e)s
         GROUP BY se.owner_user, se.date, u.full_name
         ORDER BY u.full_name, se.date
        """,
        {"s": start, "e": end},
        as_dict=True,
    )

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

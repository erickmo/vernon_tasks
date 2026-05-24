"""Portal Worksheet API."""
from __future__ import annotations

from datetime import date as Date, timedelta

import frappe

from vernon_tasks.task.api.security import max_str, require_login
from vernon_tasks.task.services.worksheet_aggregator import build_worksheet

_WEEK_START_MAX_LEN = 10
_DATE_MAX_LEN = 10
_DAYS_IN_WEEK = 7
_SCHEDULE_ENTRY_DOCTYPE = "Task Schedule Entry"
_SCHEDULE_ENTRY_TABLE = "tabTask Schedule Entry"
_TASK_DOCTYPE = "VT Task"
_TASK_TABLE = "tabVT Task"
_USER_TABLE = "tabUser"
_LEADER_ROLES = ("Vernon Leader", "Vernon PM")
_DEFAULT_HOUR_START = 8
_DEFAULT_HOURS_PLANNED = 1.0
_MIN_HOUR = 0
_MAX_HOUR = 23
_MAX_HOURS_PER_SLOT = 24.0
_OPEN_PHASES = ("PLAN", "DO", "CHECK", "BACKLOG")


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
    hours: float = _DEFAULT_HOURS_PLANNED,
) -> dict:
    """Append a Task Schedule Entry to a VT Task for the current user."""
    require_login()
    user = frappe.session.user
    _validate_slot(hour_start, hours)
    parsed_date = Date.fromisoformat(max_str(date, _DATE_MAX_LEN))

    task = frappe.get_doc(_TASK_DOCTYPE, task_id)
    entry = task.append("schedule_entries", {
        "date": parsed_date,
        "allocated_hours": float(hours),
        "hours_planned": float(hours),
        "hour_start": int(hour_start),
        "owner_user": user,
        "is_override": 0,
    })
    task.save(ignore_permissions=False)
    return {"entry_id": entry.name, "task_id": task_id}


@frappe.whitelist()
def update_entry(
    entry_id: str,
    date: str | None = None,
    hour_start: int | None = None,
    hours: float | None = None,
) -> dict:
    """Update an existing Task Schedule Entry row."""
    require_login()
    user = frappe.session.user
    parent_task = _load_entry_parent(entry_id, user)

    task = frappe.get_doc(_TASK_DOCTYPE, parent_task)
    target = next((e for e in task.schedule_entries if e.name == entry_id), None)
    if target is None:
        frappe.throw("Schedule entry not found on task")

    if date is not None:
        target.date = Date.fromisoformat(max_str(date, _DATE_MAX_LEN))
    if hour_start is not None:
        _validate_hour(int(hour_start))
        target.hour_start = int(hour_start)
    if hours is not None:
        _validate_hours(float(hours))
        target.hours_planned = float(hours)
        target.allocated_hours = float(hours)

    task.save(ignore_permissions=False)
    return {"entry_id": entry_id, "task_id": parent_task}


@frappe.whitelist()
def unschedule(entry_id: str) -> dict:
    """Delete a Task Schedule Entry by removing it from its parent task."""
    require_login()
    user = frappe.session.user
    parent_task = _load_entry_parent(entry_id, user)

    task = frappe.get_doc(_TASK_DOCTYPE, parent_task)
    task.schedule_entries = [e for e in task.schedule_entries if e.name != entry_id]
    task.save(ignore_permissions=False)
    return {"entry_id": entry_id, "task_id": parent_task, "deleted": True}


@frappe.whitelist()
def bulk_carry_over(week_start: str) -> dict:
    """Copy previous week's incomplete entries (open tasks) forward by 7 days."""
    require_login()
    user = frappe.session.user
    target_monday = Date.fromisoformat(max_str(week_start, _WEEK_START_MAX_LEN))
    if target_monday.weekday() != 0:
        frappe.throw("week_start must be a Monday")
    prev_start = target_monday - timedelta(days=_DAYS_IN_WEEK)
    prev_end = prev_start + timedelta(days=_DAYS_IN_WEEK - 1)

    try:
        rows = frappe.db.sql(
            f"""
            SELECT se.name, se.parent AS task_id, se.date,
                   COALESCE(se.hours_planned, se.allocated_hours, %(default_hours)s) AS hours,
                   COALESCE(se.hour_start, %(default_hour)s) AS hour_start
              FROM `{_SCHEDULE_ENTRY_TABLE}` se
              JOIN `{_TASK_TABLE}` t ON t.name = se.parent
             WHERE se.parenttype = 'VT Task'
               AND (se.owner_user = %(u)s OR (se.owner_user IS NULL AND t.assigned_to = %(u)s))
               AND se.date BETWEEN %(s)s AND %(e)s
               AND t.pdca_phase IN %(open_phases)s
            """,
            {
                "u": user,
                "s": prev_start,
                "e": prev_end,
                "open_phases": _OPEN_PHASES,
                "default_hours": _DEFAULT_HOURS_PLANNED,
                "default_hour": _DEFAULT_HOUR_START,
            },
            as_dict=True,
        )
    except (frappe.db.OperationalError, frappe.db.ProgrammingError):
        rows = []

    copied = 0
    for r in rows:
        try:
            task = frappe.get_doc(_TASK_DOCTYPE, r.task_id)
            task.append("schedule_entries", {
                "date": r.date + timedelta(days=_DAYS_IN_WEEK),
                "allocated_hours": float(r.hours),
                "hours_planned": float(r.hours),
                "hour_start": int(r.hour_start),
                "owner_user": user,
                "is_override": 0,
            })
            task.save(ignore_permissions=False)
            copied += 1
        except frappe.exceptions.PermissionError:
            continue
    return {"copied": copied, "week_start": str(target_monday)}


def _validate_slot(hour_start: int, hours: float) -> None:
    _validate_hour(int(hour_start))
    _validate_hours(float(hours))


def _validate_hour(hour_start: int) -> None:
    if hour_start < _MIN_HOUR or hour_start > _MAX_HOUR:
        frappe.throw(f"hour_start must be between {_MIN_HOUR} and {_MAX_HOUR}")


def _validate_hours(hours: float) -> None:
    if hours <= 0 or hours > _MAX_HOURS_PER_SLOT:
        frappe.throw(f"hours must be > 0 and <= {_MAX_HOURS_PER_SLOT}")


def _load_entry_parent(entry_id: str, user: str) -> str:
    row = frappe.db.sql(
        f"""
        SELECT se.parent AS task_id, se.owner_user, t.assigned_to
          FROM `{_SCHEDULE_ENTRY_TABLE}` se
          JOIN `{_TASK_TABLE}` t ON t.name = se.parent
         WHERE se.name = %(id)s AND se.parenttype = 'VT Task'
         LIMIT 1
        """,
        {"id": entry_id},
        as_dict=True,
    )
    if not row:
        frappe.throw("Schedule entry not found")
    r = row[0]
    owner = r.get("owner_user") or r.get("assigned_to")
    if user != "Administrator" and owner and owner != user:
        roles = set(frappe.get_roles(user))
        if not roles.intersection(set(_LEADER_ROLES)):
            raise frappe.PermissionError("Cannot modify another user's schedule entry")
    return r["task_id"]


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
            SELECT COALESCE(se.owner_user, t.assigned_to) AS user,
                   u.full_name,
                   se.date,
                   SUM(COALESCE(se.hours_planned, se.allocated_hours)) AS hours,
                   COUNT(*) AS task_count
              FROM `{_SCHEDULE_ENTRY_TABLE}` se
              JOIN `{_TASK_TABLE}` t ON t.name = se.parent
              JOIN `{_USER_TABLE}` u ON u.name = COALESCE(se.owner_user, t.assigned_to)
             WHERE se.parenttype = 'VT Task'
               AND se.date BETWEEN %(s)s AND %(e)s
             GROUP BY COALESCE(se.owner_user, t.assigned_to), se.date, u.full_name
             ORDER BY u.full_name, se.date
            """,
            {"s": start, "e": end},
            as_dict=True,
        )
    except (frappe.db.OperationalError, frappe.db.ProgrammingError):
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

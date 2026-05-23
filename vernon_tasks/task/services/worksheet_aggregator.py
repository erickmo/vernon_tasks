"""Compose user's weekly worksheet payload."""
from __future__ import annotations

from datetime import date, timedelta

import frappe

_DEFAULT_CAPACITY_HOURS = 40
_DAYS_IN_WEEK = 7
_SCHEDULE_ENTRY_DOCTYPE = "VT Task Schedule Entry"
_EMPLOYEE_CAPACITY_DOCTYPE = "VT Employee Capacity"
_TASK_DOCTYPE = "VT Task"
_OPEN_STATUSES = ("PLAN", "DO", "CHECK")


def build_worksheet(user: str, week_start: str) -> dict:
    start = _parse_monday(week_start)
    end = start + timedelta(days=_DAYS_IN_WEEK - 1)

    capacity = _get_capacity(user)
    entries = _load_entries(user, start, end)

    days = []
    for i in range(_DAYS_IN_WEEK):
        d = start + timedelta(days=i)
        day_entries = [_entry(e) for e in entries if e.date == d]
        scheduled = sum(e["hours_planned"] for e in day_entries)
        days.append({
            "date": str(d),
            "entries": sorted(day_entries, key=lambda e: e["hour_start"]),
            "scheduled_hours": round(scheduled, 2),
        })

    scheduled_task_ids = {e.task for e in entries}
    unscheduled = _load_unscheduled(user, scheduled_task_ids)

    return {
        "week_start": str(start),
        "week_end": str(end),
        "capacity_hours": capacity,
        "days": days,
        "unscheduled": unscheduled,
    }


def _parse_monday(s: str) -> date:
    d = date.fromisoformat(s)
    if d.weekday() != 0:
        raise ValueError("week_start must be a Monday")
    return d


def _get_capacity(user: str) -> float:
    # Compat shim: doctype may not yet be installed.
    if not frappe.db.table_exists(_EMPLOYEE_CAPACITY_DOCTYPE):
        return float(_DEFAULT_CAPACITY_HOURS)
    return float(
        frappe.db.get_value(_EMPLOYEE_CAPACITY_DOCTYPE, {"employee": user}, "weekly_hours")
        or _DEFAULT_CAPACITY_HOURS
    )


def _load_entries(user: str, start: date, end: date) -> list:
    # Compat shim: schedule entry doctype may not yet be installed.
    if not frappe.db.table_exists(_SCHEDULE_ENTRY_DOCTYPE):
        return []
    try:
        return frappe.db.sql(
            """
            SELECT se.name, se.task, se.date, se.hour_start, se.hours_planned,
                   t.title, t.pdca_phase, t.points, t.linked_kr, t.project
              FROM `tabVT Task Schedule Entry` se
              JOIN `tabVT Task` t ON t.name = se.task
             WHERE se.owner_user = %(u)s
               AND se.date BETWEEN %(s)s AND %(e)s
            """,
            {"u": user, "s": start, "e": end},
            as_dict=True,
        )
    except Exception:
        # Compat shim: schema mismatch (e.g. VT Task missing planned columns).
        return []


def _load_unscheduled(user: str, scheduled_task_ids: set) -> list:
    if not frappe.db.table_exists(_TASK_DOCTYPE):
        return []
    try:
        rows = frappe.db.sql(
            """
            SELECT name, title, pdca_phase, points, linked_kr, project, due_date
              FROM `tabVT Task`
             WHERE assignee = %(u)s
               AND status IN %(statuses)s
            """,
            {"u": user, "statuses": _OPEN_STATUSES},
            as_dict=True,
        )
    except Exception:
        # Compat shim: VT Task schema may differ from planned schema.
        return []
    return [_unscheduled(r) for r in rows if r.name not in scheduled_task_ids]


def _entry(e: dict) -> dict:
    return {
        "id": e.name,
        "task_id": e.task,
        "title": e.title,
        "pdca": e.pdca_phase,
        "points": int(e.points or 0),
        "linked_kr": e.linked_kr,
        "project": e.project,
        "hour_start": int(e.hour_start or 8),
        "hours_planned": float(e.hours_planned or 1),
    }


def _unscheduled(r: dict) -> dict:
    return {
        "task_id": r.name,
        "title": r.title,
        "pdca": r.pdca_phase,
        "points": int(r.points or 0),
        "linked_kr": r.linked_kr,
        "project": r.project,
        "due_date": str(r.due_date) if r.due_date else None,
    }

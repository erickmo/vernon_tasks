"""Compose user's weekly worksheet payload."""
from __future__ import annotations

from datetime import date, timedelta

import frappe

_DEFAULT_CAPACITY_HOURS = 40
_WORKDAYS_PER_WEEK = 5
_DAYS_IN_WEEK = 7
_DEFAULT_HOUR_START = 8
_SCHEDULE_ENTRY_TABLE = "tabTask Schedule Entry"
_TASK_TABLE = "tabVT Task"
_PROJECT_TABLE = "tabVT Project"
_KEY_RESULT_TABLE = "tabKey Result"
_WORK_PROFILE_DOCTYPE = "Work Profile"
_OPEN_PHASES = ("PLAN", "DO", "CHECK")


def build_worksheet(user: str, week_start: str) -> dict:
    start = _parse_monday(week_start)
    end = start + timedelta(days=_DAYS_IN_WEEK - 1)

    capacity = _get_capacity(user)
    entries = _load_entries(user, start, end)

    days = []
    for i in range(_DAYS_IN_WEEK):
        d = start + timedelta(days=i)
        day_entries = [_entry(e) for e in entries if e.date == d]
        # Entries carry minutes_planned; capacity_hours is weekly hours, so
        # convert the day's scheduled minutes to hours (÷60) to stay comparable.
        MINUTES_PER_HOUR = 60
        scheduled_minutes = sum(e["minutes_planned"] for e in day_entries)
        days.append({
            "date": str(d),
            "entries": sorted(day_entries, key=lambda e: e["hour_start"]),
            "scheduled_hours": round(scheduled_minutes / MINUTES_PER_HOUR, 2),
        })

    scheduled_task_ids = {e.task_id for e in entries}
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
    daily = frappe.db.get_value(_WORK_PROFILE_DOCTYPE, {"user": user}, "daily_target_hours")
    if not daily:
        return float(_DEFAULT_CAPACITY_HOURS)
    return float(daily) * _WORKDAYS_PER_WEEK


def _load_entries(user: str, start: date, end: date) -> list:
    try:
        return frappe.db.sql(
            f"""
            SELECT se.name,
                   se.parent AS task_id,
                   se.date,
                   COALESCE(se.minutes_planned, se.allocated_minutes) AS minutes_planned,
                   COALESCE(se.hour_start, %(default_hour)s) AS hour_start,
                   t.title,
                   t.pdca_phase,
                   COALESCE(t.leader_override_points, t.earned_points, t.base_points, 0) AS points,
                   kr.name AS linked_kr,
                   t.project
              FROM `{_SCHEDULE_ENTRY_TABLE}` se
              JOIN `{_TASK_TABLE}` t ON t.name = se.parent
              LEFT JOIN `{_PROJECT_TABLE}` p ON p.name = t.project
              LEFT JOIN `{_KEY_RESULT_TABLE}` kr ON kr.objective = p.objective
             WHERE se.parenttype = 'VT Task'
               AND (se.owner_user = %(u)s OR (se.owner_user IS NULL AND t.assigned_to = %(u)s))
               AND se.date BETWEEN %(s)s AND %(e)s
            """,
            {"u": user, "s": start, "e": end, "default_hour": _DEFAULT_HOUR_START},
            as_dict=True,
        )
    except (frappe.db.OperationalError, frappe.db.ProgrammingError):
        return []


def _load_unscheduled(user: str, scheduled_task_ids: set) -> list:
    try:
        rows = frappe.db.sql(
            f"""
            SELECT t.name,
                   t.title,
                   t.pdca_phase,
                   COALESCE(t.leader_override_points, t.earned_points, t.base_points, 0) AS points,
                   kr.name AS linked_kr,
                   t.project,
                   t.deadline AS due_date
              FROM `{_TASK_TABLE}` t
              LEFT JOIN `{_PROJECT_TABLE}` p ON p.name = t.project
              LEFT JOIN `{_KEY_RESULT_TABLE}` kr ON kr.objective = p.objective
             WHERE t.assigned_to = %(u)s
               AND t.pdca_phase IN %(phases)s
            """,
            {"u": user, "phases": _OPEN_PHASES},
            as_dict=True,
        )
    except (frappe.db.OperationalError, frappe.db.ProgrammingError):
        return []
    return [_unscheduled(r) for r in rows if r.name not in scheduled_task_ids]


def _entry(e: dict) -> dict:
    return {
        "id": e.name,
        "task_id": e.task_id,
        "title": e.title,
        "pdca": e.pdca_phase,
        "points": int(e.points or 0),
        "linked_kr": e.linked_kr,
        "project": e.project,
        "hour_start": int(e.hour_start if e.hour_start is not None else _DEFAULT_HOUR_START),
        "minutes_planned": float(e.minutes_planned or 60),
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

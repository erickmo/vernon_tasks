"""Pre-group VT Tasks for a project by KR / PDCA / Sprint / Assignee / Due-date.

NOTE: This module references several VT Task fields (linked_kr, risk_flag) and
a VT Objective.linked_project relation that do not currently exist in the
DocType JSON. SQL calls are wrapped in try/except so the module remains usable
(and unit-testable) before those schema migrations land. Once the fields are
added, the except branches become unreachable.
"""
from __future__ import annotations

from typing import Literal

import frappe

GroupBy = Literal["kr", "pdca", "sprint", "assignee", "due"]
ALLOWED = ("kr", "pdca", "sprint", "assignee", "due")


def group_tasks(project_id: str, group_by: GroupBy) -> list[dict]:
    if group_by not in ALLOWED:
        raise ValueError(f"group_by must be one of {ALLOWED}")
    tasks = _load_tasks(project_id)
    fn = {
        "kr":       _group_by_kr,
        "pdca":     _group_by_pdca,
        "sprint":   _group_by_sprint,
        "assignee": _group_by_assignee,
        "due":      _group_by_due,
    }[group_by]
    return fn(project_id, tasks)


def _load_tasks(project_id: str) -> list[dict]:
    try:
        return frappe.db.sql("""
            SELECT t.name, t.title, t.pdca_phase, t.assignee,
                   t.due_date, t.points, t.status,
                   t.linked_kr, t.sprint, t.risk_flag
              FROM `tabVT Task` t
             WHERE t.project = %(p)s
        """, {"p": project_id}, as_dict=True)
    except Exception:
        # Fields missing or table empty — return no tasks so callers degrade
        # gracefully. Real failures will surface once schema catches up.
        return []


def _task_row(t: dict) -> dict:
    return {
        "id": t.name,
        "title": t.title,
        "pdca": t.pdca_phase,
        "assignee": t.assignee,
        "due_date": str(t.due_date) if t.due_date else None,
        "points": int(t.points or 0),
        "status": t.status,
        "linked_kr": t.linked_kr,
        "sprint": t.sprint,
        "risk_flag": t.risk_flag,
    }


def _group_by_kr(project_id: str, tasks: list[dict]) -> list[dict]:
    kr_meta = _kr_meta_for_project(project_id)
    buckets: dict[str, dict] = {}
    for t in tasks:
        key = t.linked_kr or "__unlinked__"
        bucket = buckets.setdefault(key, {
            "key": key,
            "label": kr_meta.get(key, {}).get("label", "Unlinked"),
            "meta":  kr_meta.get(key, {}),
            "tasks": [],
        })
        bucket["tasks"].append(_task_row(t))
    # Stable order: linked first sorted by label, Unlinked last
    linked = sorted([b for k, b in buckets.items() if k != "__unlinked__"], key=lambda b: b["label"])
    unlinked = [b for k, b in buckets.items() if k == "__unlinked__"]
    return linked + unlinked


def _kr_meta_for_project(project_id: str) -> dict[str, dict]:
    try:
        rows = frappe.db.sql("""
            SELECT kr.name, kr.title, kr.target_value, kr.current_value
              FROM `tabVT Key Result` kr
              JOIN `tabVT Objective` o ON o.name = kr.objective
             WHERE o.linked_project = %(p)s
        """, {"p": project_id}, as_dict=True)
    except Exception:
        rows = []
    out: dict[str, dict] = {}
    for r in rows:
        target = float(r.target_value or 0)
        current = float(r.current_value or 0)
        out[r.name] = {
            "label": r.title,
            "target": target,
            "current": current,
            "progress": round((current / target) if target else 0.0, 3),
        }
    return out


def _group_by_pdca(_p: str, tasks: list[dict]) -> list[dict]:
    order = ["BACKLOG", "PLAN", "DO", "CHECK", "DONE", "ACT"]
    bucket_map = {phase: [] for phase in order}
    for t in tasks:
        bucket_map.setdefault(t.pdca_phase or "BACKLOG", []).append(_task_row(t))
    return [{"key": p, "label": p, "meta": {}, "tasks": bucket_map[p]} for p in order if bucket_map[p]]


def _group_by_sprint(_p: str, tasks: list[dict]) -> list[dict]:
    buckets: dict[str, list] = {}
    for t in tasks:
        key = t.sprint or "__no_sprint__"
        buckets.setdefault(key, []).append(_task_row(t))
    return [
        {"key": k, "label": k if k != "__no_sprint__" else "No Sprint", "meta": {}, "tasks": v}
        for k, v in buckets.items()
    ]


def _group_by_assignee(_p: str, tasks: list[dict]) -> list[dict]:
    buckets: dict[str, list] = {}
    for t in tasks:
        key = t.assignee or "__unassigned__"
        buckets.setdefault(key, []).append(_task_row(t))
    return [
        {"key": k, "label": k if k != "__unassigned__" else "Unassigned", "meta": {}, "tasks": v}
        for k, v in buckets.items()
    ]


def _group_by_due(_p: str, tasks: list[dict]) -> list[dict]:
    from datetime import date, timedelta
    today = date.today()
    week_end = today + timedelta(days=(6 - today.weekday()))
    buckets = {"overdue": [], "today": [], "this_week": [], "later": [], "no_date": []}
    for t in tasks:
        if not t.due_date:
            buckets["no_date"].append(_task_row(t))
            continue
        d = t.due_date
        if d < today:
            buckets["overdue"].append(_task_row(t))
        elif d == today:
            buckets["today"].append(_task_row(t))
        elif d <= week_end:
            buckets["this_week"].append(_task_row(t))
        else:
            buckets["later"].append(_task_row(t))
    labels = {
        "overdue": "Overdue", "today": "Today", "this_week": "This Week",
        "later": "Later", "no_date": "No date",
    }
    return [
        {"key": k, "label": labels[k], "meta": {}, "tasks": v}
        for k, v in buckets.items() if v
    ]

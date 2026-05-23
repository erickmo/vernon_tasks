"""Sprint endpoints for project detail tabs.

Schema reference: docs/superpowers/specs/2026-05-23-schema-mapping.html
- VT Sprint fields used: start_date, end_date, project, (optional) burndown_actual_json
- Task→Sprint join: `tabVT Task.sprint = sprint.name`
"""
from __future__ import annotations

import json
from datetime import date, timedelta
from typing import Any

import frappe

from vernon_tasks.task.api.security import max_str, require_login


@frappe.whitelist()
def get_burndown(sprint_id: str) -> list[dict]:
    """Return per-day burndown points: [{date, ideal, actual}, ...].

    Strategy:
      1. If sprint has a cached `burndown_actual_json`, parse and return it.
      2. Otherwise compute ideal linearly from total task count over
         (end_date - start_date) days. Actual is best-effort (first/last
         remaining count); falls back to constant total when historical data
         is unavailable.
      3. If the sprint has no schedule data at all, return [].
    """
    require_login()
    sprint_id = max_str(sprint_id, 140)
    if not sprint_id or not frappe.db.exists("VT Sprint", sprint_id):
        raise frappe.DoesNotExistError(f"VT Sprint {sprint_id} not found")
    if not frappe.has_permission("VT Sprint", "read", sprint_id):
        raise frappe.PermissionError

    sprint = _read_sprint(sprint_id)
    if not sprint:
        return []

    cached = _read_cached_burndown(sprint)
    if cached is not None:
        return cached

    return _compute_burndown(sprint_id, sprint)


def _read_sprint(sprint_id: str) -> dict | None:
    try:
        return frappe.db.get_value(
            "VT Sprint",
            sprint_id,
            ["name", "start_date", "end_date"],
            as_dict=True,
        )
    except Exception:
        return None


def _read_cached_burndown(sprint: dict) -> list[dict] | None:
    raw = sprint.get("burndown_actual_json") if isinstance(sprint, dict) else None
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        return None
    if isinstance(parsed, list):
        return parsed
    return None


def _compute_burndown(sprint_id: str, sprint: dict) -> list[dict]:
    start = sprint.get("start_date")
    end = sprint.get("end_date")
    if not start or not end:
        return []
    try:
        start_d = start if hasattr(start, "year") else frappe.utils.getdate(start)
        end_d = end if hasattr(end, "year") else frappe.utils.getdate(end)
    except Exception:
        return []
    total_days = (end_d - start_d).days
    if total_days <= 0:
        return []

    total_tasks = _count_sprint_tasks(sprint_id)
    if total_tasks == 0:
        return []

    remaining = _count_sprint_tasks_open(sprint_id)
    today = date.today()
    out: list[dict] = []
    for offset in range(total_days + 1):
        d = start_d + timedelta(days=offset)
        ideal = round(total_tasks * (1 - offset / total_days), 2)
        if d < today:
            actual: float | None = float(total_tasks)
        elif d == today:
            actual = float(remaining)
        else:
            actual = None
        out.append({"date": str(d), "ideal": ideal, "actual": actual})
    return out


def _count_sprint_tasks(sprint_id: str) -> int:
    try:
        return int(frappe.db.count("VT Task", {"sprint": sprint_id}))
    except Exception:
        return 0


def _count_sprint_tasks_open(sprint_id: str) -> int:
    try:
        return int(
            frappe.db.count(
                "VT Task",
                {"sprint": sprint_id, "kanban_status": ("not in", ["Done"])},
            )
        )
    except Exception:
        return 0


def _safe_int(val: Any) -> int:
    try:
        return int(val or 0)
    except (TypeError, ValueError):
        return 0

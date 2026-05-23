"""OKR endpoints for project detail tabs.

Schema reference: docs/superpowers/specs/2026-05-23-schema-mapping.html
- Objective doctype (`tabObjective`): title, period_start, period_end, pdca_phase
- Key Result doctype (`tabKey Result`): metric, target_value, current_value, objective FK
- VT Project field linking to Objective is `objective` (not `linked_objective`)
"""
from __future__ import annotations

from datetime import date
from typing import Any

import frappe

from vernon_tasks.task.api.security import max_str, require_login

EMPTY_OKR: dict[str, Any] = {"objective": None, "key_results": []}


@frappe.whitelist()
def get_for_project(project_id: str) -> dict:
    """Return the OKR (objective + KRs + pace) attached to a project.

    Shape:
        {
          "objective": {"id", "title", "phase"} | None,
          "key_results": [{"id", "title", "target", "current", "pace_expected"}, ...]
        }

    Returns the empty shape if the project does not exist or has no linked
    objective — the UI degrades gracefully instead of throwing.
    """
    require_login()
    project_id = max_str(project_id, 140)
    if not project_id or not frappe.db.exists("VT Project", project_id):
        return EMPTY_OKR
    if not frappe.has_permission("VT Project", "read", project_id):
        raise frappe.PermissionError

    objective_id = _read_project_objective(project_id)
    if not objective_id:
        return EMPTY_OKR

    objective_row = _read_objective(objective_id)
    if not objective_row:
        return EMPTY_OKR

    pace = _compute_pace(objective_row.get("period_start"), objective_row.get("period_end"))
    krs = _read_key_results(objective_id, pace)
    return {
        "objective": {
            "id": objective_row.get("name"),
            "title": objective_row.get("title") or objective_row.get("name"),
            "phase": objective_row.get("phase"),
        },
        "key_results": krs,
    }


def _read_project_objective(project_id: str) -> str | None:
    try:
        return frappe.db.get_value("VT Project", project_id, "objective")
    except Exception:
        return None


def _read_objective(objective_id: str) -> dict | None:
    try:
        return frappe.db.get_value(
            "Objective",
            objective_id,
            ["name", "title", "pdca_phase as phase", "period_start", "period_end"],
            as_dict=True,
        )
    except Exception:
        return None


def _read_key_results(objective_id: str, pace_expected: float) -> list[dict]:
    try:
        rows = frappe.get_all(
            "Key Result",
            filters={"objective": objective_id},
            fields=["name", "metric", "target_value", "current_value"],
            limit_page_length=200,
        )
    except Exception:
        rows = []
    return [
        {
            "id": r.get("name"),
            "title": r.get("metric") or r.get("name"),
            "target": float(r.get("target_value") or 0),
            "current": float(r.get("current_value") or 0),
            "pace_expected": pace_expected,
        }
        for r in rows
    ]


def _compute_pace(period_start: Any, period_end: Any) -> float:
    """Linear-elapsed pace, clamped to [0, 1]."""
    if not period_start or not period_end:
        return 0.0
    try:
        start = period_start if hasattr(period_start, "year") else frappe.utils.getdate(period_start)
        end = period_end if hasattr(period_end, "year") else frappe.utils.getdate(period_end)
    except Exception:
        return 0.0
    total = (end - start).days
    if total <= 0:
        return 0.0
    elapsed = (date.today() - start).days
    if elapsed <= 0:
        return 0.0
    if elapsed >= total:
        return 1.0
    return round(elapsed / total, 4)

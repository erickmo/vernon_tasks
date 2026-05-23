"""Portal Projects endpoints — list, detail, bulk task ops, members.

Schema notes
------------
Several VT Task / VT Project / VT Project Member fields referenced below
(linked_kr, risk_flag, pdca_phase, active sprint join, project_lead,
VT Project Member table, VT Employee Capacity) may not yet exist in the
shipping DocType JSONs. SQL paths and doc reads are wrapped defensively so
endpoints return a usable shape (empty list / partial detail) during the
schema-catch-up window instead of 500-ing.
"""
from __future__ import annotations

from typing import Any

import frappe

from vernon_tasks.task.api.security import max_str, require_login
from vernon_tasks.task.services.project_task_grouper import group_tasks

ALLOWED_PHASES = {"BACKLOG", "PLAN", "DO", "CHECK", "DONE", "ACT"}


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------


@frappe.whitelist()
def list_projects(filters: str | dict | None = None) -> list[dict]:
    """Return projects matching the given filter blob.

    The full filter behaviour will be implemented when the supporting fields
    land in the schema; for now we ship a safe, role-aware default that returns
    every readable VT Project.
    """
    require_login()
    parsed = _parse_filters(filters)
    try:
        rows = frappe.get_all(
            "VT Project",
            fields=[
                "name",
                "title",
                "project_lead",
                "health_score",
                "percent_done",
                "end_date",
                "status",
            ],
            limit_page_length=500,
        )
    except Exception:
        rows = []
    out: list[dict] = []
    for r in rows:
        out.append(
            {
                "id": r.get("name"),
                "name": r.get("title") or r.get("name"),
                "health": _health_bucket(r.get("health_score")),
                "percent_done": float(r.get("percent_done") or 0),
                "days_left": _days_left(r.get("end_date")),
                "blocked_count": _safe_blocked_count(r.get("name")),
                "owner": {
                    "id": r.get("project_lead") or "",
                    "name": r.get("project_lead") or "",
                    "avatar": None,
                },
                "current_sprint": _safe_active_sprint(r.get("name")),
            }
        )
    return _apply_client_filters(out, parsed)


def _parse_filters(filters: str | dict | None) -> dict:
    if filters is None:
        return {}
    if isinstance(filters, dict):
        return filters
    try:
        import json

        return json.loads(filters) or {}
    except (TypeError, ValueError):
        return {}


def _apply_client_filters(rows: list[dict], f: dict) -> list[dict]:
    out = rows
    search = (f.get("search") or "").strip().lower()
    if search:
        out = [r for r in out if search in (r.get("name") or "").lower()]
    if f.get("has_blockers"):
        out = [r for r in out if (r.get("blocked_count") or 0) > 0]
    sort = f.get("sort")
    if sort == "blocked_desc":
        out = sorted(out, key=lambda r: -(r.get("blocked_count") or 0))
    elif sort == "days_left_asc":
        out = sorted(out, key=lambda r: (r.get("days_left") is None, r.get("days_left") or 0))
    return out


def _health_bucket(score: Any) -> str:
    try:
        s = float(score or 0)
    except (TypeError, ValueError):
        return "amber"
    if s >= 75:
        return "green"
    if s >= 50:
        return "amber"
    return "red"


def _days_left(end_date: Any) -> int | None:
    if not end_date:
        return None
    try:
        from datetime import date

        if hasattr(end_date, "year"):
            d = end_date
        else:
            d = frappe.utils.getdate(end_date)
        delta = (d - date.today()).days
        return max(0, delta)
    except Exception:
        return None


def _safe_blocked_count(project_id: str | None) -> int:
    if not project_id:
        return 0
    try:
        return int(frappe.db.count("VT Task", {"project": project_id, "status": "BLOCKED"}))
    except Exception:
        return 0


def _safe_active_sprint(project_id: str | None) -> dict | None:
    if not project_id:
        return None
    try:
        row = frappe.db.get_value(
            "VT Sprint",
            {"project": project_id, "status": "Active"},
            ["name", "title", "end_date"],
            as_dict=True,
        )
    except Exception:
        row = None
    if not row:
        return None
    return {
        "id": row.get("name"),
        "name": row.get("title") or row.get("name"),
        "days_left": _days_left(row.get("end_date")) or 0,
    }


# ---------------------------------------------------------------------------
# Detail
# ---------------------------------------------------------------------------


@frappe.whitelist()
def get_project_detail(project_id: str) -> dict:
    require_login()
    project_id = max_str(project_id, 140)
    if not frappe.has_permission("VT Project", "read", project_id):
        raise frappe.PermissionError
    p = frappe.get_doc("VT Project", project_id)
    return {
        "id": p.name,
        "title": getattr(p, "title", p.name),
        "project_lead": getattr(p, "project_lead", None),
        "health_score": float(getattr(p, "health_score", 0) or 0),
        "percent_done": float(getattr(p, "percent_done", 0) or 0),
        "start_date": str(p.start_date) if getattr(p, "start_date", None) else None,
        "end_date": str(p.end_date) if getattr(p, "end_date", None) else None,
        "status": getattr(p, "status", None),
        "active_sprint": _safe_active_sprint(p.name),
        "linked_objective": getattr(p, "linked_objective", None),
        "blocked_count": _safe_blocked_count(p.name),
    }


# ---------------------------------------------------------------------------
# Tasks (grouped)
# ---------------------------------------------------------------------------


@frappe.whitelist()
def get_project_tasks(project_id: str, group_by: str = "kr") -> list[dict]:
    require_login()
    project_id = max_str(project_id, 140)
    if not frappe.has_permission("VT Project", "read", project_id):
        raise frappe.PermissionError
    return group_tasks(project_id=project_id, group_by=group_by)


# ---------------------------------------------------------------------------
# Bulk mutations
# ---------------------------------------------------------------------------


@frappe.whitelist()
def bulk_move_tasks(task_ids: list[str], target_sprint: str) -> dict:
    require_login()
    ids = _coerce_id_list(task_ids)
    target_sprint = max_str(target_sprint, 140)
    for tid in ids:
        doc = frappe.get_doc("VT Task", tid)
        doc.sprint = target_sprint
        doc.save()
    return {"moved": len(ids)}


@frappe.whitelist()
def bulk_reassign(task_ids: list[str], new_owner: str) -> dict:
    require_login()
    ids = _coerce_id_list(task_ids)
    new_owner = max_str(new_owner, 140)
    for tid in ids:
        frappe.db.set_value("VT Task", tid, "assignee", new_owner)
    return {"reassigned": len(ids)}


@frappe.whitelist()
def bulk_phase_shift(task_ids: list[str], new_phase: str) -> dict:
    require_login()
    if new_phase not in ALLOWED_PHASES:
        raise frappe.ValidationError(f"invalid phase {new_phase}")
    ids = _coerce_id_list(task_ids)
    for tid in ids:
        doc = frappe.get_doc("VT Task", tid)
        doc.pdca_phase = new_phase
        doc.save()
    return {"shifted": len(ids)}


@frappe.whitelist()
def relink_task_kr(task_ids: list[str], kr_id: str | None = None) -> dict:
    require_login()
    ids = _coerce_id_list(task_ids)
    if kr_id:
        kr_id = max_str(kr_id, 140)
        if not frappe.db.exists("VT Key Result", kr_id):
            raise frappe.ValidationError("KR not found")
    for tid in ids:
        frappe.db.set_value("VT Task", tid, "linked_kr", kr_id)
    return {"relinked": len(ids), "kr": kr_id}


def _coerce_id_list(task_ids: Any) -> list[str]:
    if task_ids is None:
        return []
    if isinstance(task_ids, str):
        import json

        try:
            parsed = json.loads(task_ids)
        except (TypeError, ValueError):
            parsed = [task_ids]
        task_ids = parsed
    if not isinstance(task_ids, (list, tuple)):
        return []
    return [max_str(t, 140) for t in task_ids if t]


# ---------------------------------------------------------------------------
# Members
# ---------------------------------------------------------------------------


@frappe.whitelist()
def get_project_members(project_id: str) -> list[dict]:
    require_login()
    project_id = max_str(project_id, 140)
    try:
        rows = frappe.db.sql(
            """
            SELECT pm.user, u.full_name, pm.role,
                   (SELECT COALESCE(SUM(hours_planned),0)
                      FROM `tabVT Task Schedule Entry` se
                     WHERE se.owner_user = pm.user
                       AND se.date >= CURDATE() - INTERVAL 7 DAY) AS assigned_hours,
                   COALESCE(ec.weekly_hours, 40) AS capacity_hours,
                   (SELECT COUNT(*) FROM `tabVT Task` t
                     WHERE t.project = pm.parent
                       AND t.assignee = pm.user
                       AND t.status != 'DONE') AS active_task_count
              FROM `tabVT Project Member` pm
              JOIN `tabUser` u ON u.name = pm.user
         LEFT JOIN `tabVT Employee Capacity` ec ON ec.employee = pm.user
             WHERE pm.parent = %(p)s
            """,
            {"p": project_id},
            as_dict=True,
        )
    except Exception:
        rows = []
    return [
        {
            "user": r.user,
            "full_name": r.full_name,
            "role": r.role,
            "assigned_hours": float(r.assigned_hours or 0),
            "capacity_hours": float(r.capacity_hours or 40),
            "active_task_count": int(r.active_task_count or 0),
        }
        for r in rows
    ]

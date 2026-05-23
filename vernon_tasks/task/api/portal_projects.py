"""Portal Projects endpoints — list, detail, bulk task ops, members.

Schema notes (see docs/superpowers/specs/2026-05-23-schema-mapping.md):
- VT Project has NO `health_score` / `percent_done` columns. Surface defaults.
- VT Project Member is the doctype `Project Team Member` (child table on
  VT Project's `team_members` field).
- VT Task `assignee` is `assigned_to`; no `linked_kr` column exists.
- VT Sprint title is `sprint_title`; active state value is "Active".
- Kanban "Blocked" status is Title-cased (not "BLOCKED").
- VT Employee Capacity doctype does not exist; capacity defaults to 40h/week.
"""
from __future__ import annotations

from typing import Any

import frappe

from vernon_tasks.task.api.security import max_str, require_login
from vernon_tasks.task.services.project_task_grouper import group_tasks

ALLOWED_PHASES = {"BACKLOG", "PLAN", "DO", "CHECK", "DONE", "ACT"}
DEFAULT_CAPACITY_HOURS = 40.0
BLOCKED_STATUS = "Blocked"
ACTIVE_SPRINT_STATUS = "Active"


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------


@frappe.whitelist()
def list_projects(filters: str | dict | None = None) -> list[dict]:
    """Return projects matching the given filter blob.

    Role-aware default: returns every readable VT Project. `health_score` and
    `percent_done` are not stored on VT Project — surfaced as defaults (0 /
    amber) until those analytics columns land.
    """
    require_login()
    parsed = _parse_filters(filters)
    rows = frappe.get_all(
        "VT Project",
        fields=[
            "name",
            "title",
            "project_leader AS project_lead",
            "end_date",
            "status",
        ],
        limit_page_length=500,
    )
    out: list[dict] = []
    for r in rows:
        out.append(
            {
                "id": r.get("name"),
                "name": r.get("title") or r.get("name"),
                "health": _health_bucket(None),
                "percent_done": 0.0,
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
        return int(
            frappe.db.count(
                "VT Task",
                {"project": project_id, "kanban_status": BLOCKED_STATUS},
            )
        )
    except Exception:
        return 0


def _safe_active_sprint(project_id: str | None) -> dict | None:
    if not project_id:
        return None
    try:
        row = frappe.db.get_value(
            "VT Sprint",
            {"project": project_id, "status": ACTIVE_SPRINT_STATUS},
            ["name", "sprint_title", "end_date"],
            as_dict=True,
        )
    except Exception:
        row = None
    if not row:
        return None
    return {
        "id": row.get("name"),
        "name": row.get("sprint_title") or row.get("name"),
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
        "project_lead": getattr(p, "project_leader", None),
        "health_score": 0.0,
        "percent_done": 0.0,
        "start_date": str(p.start_date) if getattr(p, "start_date", None) else None,
        "end_date": str(p.end_date) if getattr(p, "end_date", None) else None,
        "status": getattr(p, "status", None),
        "active_sprint": _safe_active_sprint(p.name),
        "linked_objective": getattr(p, "objective", None),
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
        # VT Task uses `assigned_to`, not `assignee`.
        frappe.db.set_value("VT Task", tid, "assigned_to", new_owner)
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
    """Validate a KR and (would) attach it to tasks.

    VT Task currently has no `linked_kr` column (see schema mapping). We keep
    the validation contract (raise on unknown KR) but skip the persistent
    write until the schema lands.
    """
    require_login()
    ids = _coerce_id_list(task_ids)
    if kr_id:
        kr_id = max_str(kr_id, 140)
        if not frappe.db.exists("Key Result", kr_id):
            raise frappe.ValidationError("KR not found")
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
    """Return team members for a project with capacity + load metrics.

    Schema:
    - `tabProject Team Member` (child of VT Project, parentfield=team_members)
      with cols: user, role, is_also_leader.
    - Assigned hours: sum of `Task Schedule Entry.allocated_hours` for the
      last 7 days, joined to parent VT Task by `assigned_to = pm.user` and
      `project = pm.parent`. Schedule Entry is a child table; owner is
      derived from its parent VT Task.
    - Capacity: VT Employee Capacity doesn't exist; default 40h/week.
    - Active tasks: VT Task rows for this project + assignee not in done state.
    """
    require_login()
    project_id = max_str(project_id, 140)
    rows = frappe.db.sql(
        """
        SELECT pm.user,
               u.full_name,
               pm.role,
               (SELECT COALESCE(SUM(se.allocated_hours), 0)
                  FROM `tabTask Schedule Entry` se
                  JOIN `tabVT Task` st
                    ON st.name = se.parent
                   AND se.parenttype = 'VT Task'
                 WHERE st.assigned_to = pm.user
                   AND st.project = pm.parent
                   AND se.date >= CURDATE() - INTERVAL 7 DAY) AS assigned_hours,
               %(default_capacity)s AS capacity_hours,
               (SELECT COUNT(*) FROM `tabVT Task` t
                 WHERE t.project = pm.parent
                   AND t.assigned_to = pm.user
                   AND t.kanban_status != 'Done') AS active_task_count
          FROM `tabProject Team Member` pm
          JOIN `tabUser` u ON u.name = pm.user
         WHERE pm.parent = %(p)s
           AND pm.parenttype = 'VT Project'
        """,
        {"p": project_id, "default_capacity": DEFAULT_CAPACITY_HOURS},
        as_dict=True,
    )
    return [
        {
            "user": r.user,
            "full_name": r.full_name,
            "role": r.role,
            "assigned_hours": float(r.assigned_hours or 0),
            "capacity_hours": float(r.capacity_hours or DEFAULT_CAPACITY_HOURS),
            "active_task_count": int(r.active_task_count or 0),
        }
        for r in rows
    ]

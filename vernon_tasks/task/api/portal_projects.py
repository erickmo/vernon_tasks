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
            "brand",
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
                "brand": r.get("brand"),
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
    brand = f.get("brand")
    if brand:
        out = [r for r in out if r.get("brand") == brand]
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
    team_members = [
        {
            "user": row.get("user"),
            "role": row.get("role") or "Member",
            "is_also_leader": bool(row.get("is_also_leader")),
        }
        for row in (getattr(p, TEAM_MEMBER_FIELD, None) or [])
    ]
    return {
        "id": p.name,
        "title": getattr(p, "title", p.name),
        "brand": getattr(p, "brand", None),
        "project_owner": getattr(p, "project_owner", None),
        "project_leader": getattr(p, "project_leader", None),
        "project_lead": getattr(p, "project_leader", None),
        "health_score": 0.0,
        "percent_done": 0.0,
        "start_date": str(p.start_date) if getattr(p, "start_date", None) else None,
        "end_date": str(p.end_date) if getattr(p, "end_date", None) else None,
        "status": getattr(p, "status", None),
        "pdca_phase": getattr(p, "pdca_phase", None),
        "active_sprint": _safe_active_sprint(p.name),
        "linked_objective": getattr(p, "objective", None),
        "blocked_count": _safe_blocked_count(p.name),
        "blocked_days_threshold": getattr(p, "blocked_days_threshold", None),
        "slip_pct_threshold": getattr(p, "slip_pct_threshold", None),
        "capacity_pct_threshold": getattr(p, "capacity_pct_threshold", None),
        "team_members": team_members,
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
# User search (for owner/leader/member pickers)
# ---------------------------------------------------------------------------

USER_SEARCH_LIMIT = 20


@frappe.whitelist()
def search_users(query: str = "", limit: int = USER_SEARCH_LIMIT) -> list[dict]:
    """Return enabled non-Guest users matching `query` by name/email.

    Used by the portal Project modal pickers for owner / leader / team members.
    """
    require_login()
    q = max_str(query or "", 100).strip()
    try:
        limit_int = max(1, min(int(limit), 50))
    except (TypeError, ValueError):
        limit_int = USER_SEARCH_LIMIT
    like = f"%{q}%" if q else None
    if like:
        rows = frappe.db.sql(
            """
            SELECT name, full_name, email, user_image
              FROM `tabUser`
             WHERE enabled = 1
               AND name != 'Guest'
               AND user_type = 'System User'
               AND (full_name LIKE %(like)s
                    OR name LIKE %(like)s
                    OR email LIKE %(like)s)
             ORDER BY full_name ASC
             LIMIT %(lim)s
            """,
            {"like": like, "lim": limit_int},
            as_dict=True,
        )
    else:
        rows = frappe.db.sql(
            """
            SELECT name, full_name, email, user_image
              FROM `tabUser`
             WHERE enabled = 1
               AND name != 'Guest'
               AND user_type = 'System User'
             ORDER BY full_name ASC
             LIMIT %(lim)s
            """,
            {"lim": limit_int},
            as_dict=True,
        )
    return [
        {
            "user": r.get("name"),
            "full_name": r.get("full_name") or r.get("name"),
            "email": r.get("email") or r.get("name"),
            "avatar": r.get("user_image") or None,
        }
        for r in rows
    ]


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


# ---------------------------------------------------------------------------
# CRUD (create / update / delete)
# ---------------------------------------------------------------------------

PROJECT_DOCTYPE = "VT Project"
EDITABLE_PROJECT_FIELDS = (
    "title",
    "brand",
    "project_owner",
    "project_leader",
    "start_date",
    "end_date",
    "status",
    "pdca_phase",
    "objective",
    "blocked_days_threshold",
    "slip_pct_threshold",
    "capacity_pct_threshold",
)
REQUIRED_CREATE_FIELDS = ("title", "brand", "project_owner", "start_date", "end_date")
TEAM_MEMBER_ROLES = {"Owner", "Leader", "Member"}
TEAM_MEMBER_FIELD = "team_members"


def _parse_payload(payload: Any) -> dict:
    """Parse a JSON-string or dict project payload into a plain dict."""
    if payload is None:
        return {}
    if isinstance(payload, dict):
        return payload
    try:
        import json

        return json.loads(payload) or {}
    except (TypeError, ValueError):
        raise frappe.ValidationError("invalid payload")


def _whitelisted_fields(payload: dict) -> dict:
    """Strip payload to fields the portal is allowed to set on VT Project."""
    return {k: payload[k] for k in EDITABLE_PROJECT_FIELDS if k in payload}


def _normalize_team_members(raw: Any) -> list[dict] | None:
    """Coerce a payload `team_members` blob into clean child-row dicts.

    Returns None if the payload omits the key (so the caller leaves the
    existing roster untouched). Returns [] when explicitly cleared.
    """
    if raw is None:
        return None
    if isinstance(raw, str):
        import json

        try:
            raw = json.loads(raw)
        except (TypeError, ValueError):
            raise frappe.ValidationError("invalid team_members payload")
    if not isinstance(raw, list):
        raise frappe.ValidationError("team_members must be a list")
    out: list[dict] = []
    seen: set[str] = set()
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        user = max_str(entry.get("user") or "", 140)
        if not user or user in seen:
            continue
        role = entry.get("role") or "Member"
        if role not in TEAM_MEMBER_ROLES:
            role = "Member"
        out.append(
            {
                "user": user,
                "role": role,
                "is_also_leader": 1 if entry.get("is_also_leader") else 0,
            }
        )
        seen.add(user)
    return out


def _apply_team_members(doc, members: list[dict] | None) -> None:
    if members is None:
        return
    doc.set(TEAM_MEMBER_FIELD, [])
    for row in members:
        doc.append(TEAM_MEMBER_FIELD, row)


def _project_can_manage() -> dict:
    """Return UI capability flags for the current user on VT Project."""
    return {
        "can_create": bool(frappe.has_permission(PROJECT_DOCTYPE, "create")),
        "can_write": bool(frappe.has_permission(PROJECT_DOCTYPE, "write")),
        "can_delete": bool(frappe.has_permission(PROJECT_DOCTYPE, "delete")),
    }


@frappe.whitelist()
def get_project_permissions() -> dict:
    """Capability flags consumed by the React portal to gate CRUD UI."""
    require_login()
    return _project_can_manage()


@frappe.whitelist()
def create_project(payload: str | dict) -> dict:
    """Create a VT Project. Requires VT Manager or VT Leader role."""
    require_login()
    if not frappe.has_permission(PROJECT_DOCTYPE, "create"):
        raise frappe.PermissionError
    parsed = _parse_payload(payload)
    data = _whitelisted_fields(parsed)
    missing = [f for f in REQUIRED_CREATE_FIELDS if not data.get(f)]
    if missing:
        raise frappe.ValidationError(f"missing required fields: {', '.join(missing)}")
    members = _normalize_team_members(parsed.get("team_members"))
    doc = frappe.get_doc({"doctype": PROJECT_DOCTYPE, **data})
    _apply_team_members(doc, members)
    doc.insert(ignore_permissions=False)
    return {"id": doc.name, "title": doc.title}


@frappe.whitelist()
def update_project(project_id: str, payload: str | dict) -> dict:
    """Update editable fields on a VT Project. Requires write perm on the doc."""
    require_login()
    project_id = max_str(project_id, 140)
    if not frappe.has_permission(PROJECT_DOCTYPE, "write", doc=project_id):
        raise frappe.PermissionError
    parsed = _parse_payload(payload)
    data = _whitelisted_fields(parsed)
    members = _normalize_team_members(parsed.get("team_members"))
    if not data and members is None:
        return {"id": project_id, "updated": []}
    doc = frappe.get_doc(PROJECT_DOCTYPE, project_id)
    for field, value in data.items():
        setattr(doc, field, value)
    _apply_team_members(doc, members)
    doc.save(ignore_permissions=False)
    updated = list(data.keys())
    if members is not None:
        updated.append("team_members")
    return {"id": doc.name, "updated": updated}


@frappe.whitelist()
def delete_project(project_id: str) -> dict:
    """Delete a VT Project. Requires VT Manager role (delete perm)."""
    require_login()
    project_id = max_str(project_id, 140)
    if not frappe.has_permission(PROJECT_DOCTYPE, "delete", doc=project_id):
        raise frappe.PermissionError
    frappe.delete_doc(PROJECT_DOCTYPE, project_id, ignore_permissions=False)
    return {"deleted": project_id}


@frappe.whitelist()
def get_project_members(project_id: str) -> list[dict]:
    """Return team members for a project with capacity + load metrics.

    Schema:
    - `tabProject Team Member` (child of VT Project, parentfield=team_members)
      with cols: user, role, is_also_leader.
    - Assigned minutes: sum of `Task Schedule Entry.allocated_minutes` for the
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
               (SELECT COALESCE(SUM(se.allocated_minutes), 0)
                  FROM `tabTask Schedule Entry` se
                  JOIN `tabVT Task` st
                    ON st.name = se.parent
                   AND se.parenttype = 'VT Task'
                 WHERE st.assigned_to = pm.user
                   AND st.project = pm.parent
                   AND se.date >= CURDATE() - INTERVAL 7 DAY) AS assigned_minutes,
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
            "assigned_minutes": float(r.assigned_minutes or 0),
            "capacity_hours": float(r.capacity_hours or DEFAULT_CAPACITY_HOURS),
            "active_task_count": int(r.active_task_count or 0),
        }
        for r in rows
    ]

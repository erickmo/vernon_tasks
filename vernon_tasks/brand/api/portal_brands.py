"""Portal Brands endpoints — list, search, create, update, delete VT Brand."""
from __future__ import annotations

from typing import Any

import frappe

from vernon_tasks.task.api.security import max_str, require_login

BRAND_DOCTYPE = "VT Brand"
PROJECT_DOCTYPE = "VT Project"
SPRINT_DOCTYPE = "VT Sprint"
TASK_DOCTYPE = "VT Task"
EDITABLE_BRAND_FIELDS = ("brand_name", "logo", "description")
REQUIRED_CREATE_FIELDS = ("brand_name",)
BRAND_SEARCH_LIMIT = 20

# Open/done task vocabulary for the per-brand rollup. Mirrors the AUTHORITATIVE
# project rollup contract in task/api/dashboard.py (DONE_STATUS / CLOSED_STATUSES):
# completion is read from kanban_status — NOT pdca_phase — and Cancelled work is
# excluded from BOTH the remaining tally and the total (so progress is honest).
# Kept as a local copy to avoid importing dashboard internals into the brand API;
# values MUST stay in sync with that module's kanban_status contract.
DONE_KANBAN_STATUS = "Done"
CANCELLED_KANBAN_STATUS = "Cancelled"
ACTIVE_SPRINT_STATUS = "Active"
# VT Task is submittable; a cancelled doc keeps its last pdca_phase/kanban_status,
# so cancelled rows must be dropped at the DB layer too (docstatus 2 = Cancelled).
DOCSTATUS_CANCELLED = 2
PERCENT_FACTOR = 100


def _parse_payload(payload: Any) -> dict:
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
    return {k: payload[k] for k in EDITABLE_BRAND_FIELDS if k in payload}


def _serialize(doc) -> dict:
    return {
        "id": doc.name,
        "brand_name": doc.brand_name,
        "logo": doc.logo,
        "description": doc.description,
    }


@frappe.whitelist()
def get_brand_permissions() -> dict:
    require_login()
    return {
        "can_create": bool(frappe.has_permission(BRAND_DOCTYPE, "create")),
        "can_write": bool(frappe.has_permission(BRAND_DOCTYPE, "write")),
        "can_delete": bool(frappe.has_permission(BRAND_DOCTYPE, "delete")),
    }


def _zero_stats() -> dict:
    """Default per-brand stats for brands with no projects/tasks/sprints."""
    return {
        "active_sprint_count": 0,
        "active_sprint_title": None,
        "remaining_tasks": 0,
        "remaining_minutes": 0,
        "total_minutes": 0,
        "progress_pct": 0,
    }


def _zero_task_agg() -> dict:
    """Empty task-rollup bucket — five counters that _progress_pct understands."""
    return {"total_minutes": 0, "remaining_minutes": 0,
            "remaining_tasks": 0, "total_tasks": 0, "done_tasks": 0}


def _project_brand_map() -> dict[str, str]:
    """Map every brand-linked VT Project name -> its brand (orphans dropped)."""
    rows = frappe.get_all(
        PROJECT_DOCTYPE, fields=["name", "brand"], filters={"brand": ["is", "set"]}
    )
    return {r["name"]: r["brand"] for r in rows if r.get("brand")}


def _task_aggregates(proj_to_brand: dict[str, str]) -> dict[str, dict]:
    """Sum estimated minutes + open-task counts per brand from one bulk query.

    Counts only non-cancelled tasks on brand-linked projects. ``remaining`` =
    tasks whose kanban_status is not Done; ``total`` includes done but excludes
    Cancelled, so progress = (total - remaining) / total stays consistent.
    """
    agg: dict[str, dict] = {}
    project_ids = list(proj_to_brand)
    if not project_ids:
        return agg
    tasks = frappe.get_all(
        TASK_DOCTYPE,
        fields=["project", "kanban_status", "estimated_minutes"],
        filters={"project": ["in", project_ids],
                 "docstatus": ["<", DOCSTATUS_CANCELLED]},
        limit_page_length=0,
    )
    for t in tasks:
        status = t.get("kanban_status")
        brand = proj_to_brand.get(t.get("project"))
        # Skip cancelled (defensive — docstatus filter usually drops these) and
        # tasks whose project has no resolvable brand.
        if not brand or status == CANCELLED_KANBAN_STATUS:
            continue
        minutes = int(t.get("estimated_minutes") or 0)
        bucket = agg.setdefault(brand, _zero_task_agg())
        bucket["total_minutes"] += minutes
        bucket["total_tasks"] += 1
        if status == DONE_KANBAN_STATUS:
            bucket["done_tasks"] += 1
        else:
            bucket["remaining_minutes"] += minutes
            bucket["remaining_tasks"] += 1
    return agg


def _active_sprints(proj_to_brand: dict[str, str]) -> dict[str, dict]:
    """Count active sprints per brand + the newest active sprint title.

    Scoped to the given projects at the DB layer (mirrors _task_aggregates) so a
    single-brand caller does not load every active sprint site-wide.
    """
    out: dict[str, dict] = {}
    if not proj_to_brand:
        return out
    rows = frappe.get_all(
        SPRINT_DOCTYPE,
        fields=["project", "sprint_title"],
        filters={"status": ACTIVE_SPRINT_STATUS, "project": ["in", list(proj_to_brand)]},
        order_by="creation desc",  # deterministic "first" title across reloads
    )
    for s in rows:
        brand = proj_to_brand.get(s.get("project"))
        if not brand:
            continue
        info = out.setdefault(brand, {"count": 0, "title": None})
        info["count"] += 1
        if info["title"] is None:
            info["title"] = s.get("sprint_title")
    return out


def _progress_pct(agg: dict) -> int:
    """Effort-weighted progress (done effort / total effort) per user decision.

    Falls back to a done/total task-count ratio when no estimates exist
    (total_minutes == 0) so a fully-completed un-estimated brand reads 100%,
    not 0%. Both numerator and denominator already exclude Cancelled work.
    """
    total_minutes = agg["total_minutes"]
    if total_minutes > 0:
        done_minutes = total_minutes - agg["remaining_minutes"]
        return round(done_minutes / total_minutes * PERCENT_FACTOR)
    total_tasks = agg["total_tasks"]
    if total_tasks > 0:
        return round(agg["done_tasks"] / total_tasks * PERCENT_FACTOR)
    return 0


def _brand_stats_map() -> dict[str, dict]:
    """Per-brand card stats {brand: {sprint/task/minute/progress fields}}.

    Three bulk queries (projects, tasks, active sprints) — no N+1. The brand
    list merges this by name, defaulting to _zero_stats() for empty brands.
    """
    proj_to_brand = _project_brand_map()
    task_agg = _task_aggregates(proj_to_brand)
    sprint_agg = _active_sprints(proj_to_brand)
    out: dict[str, dict] = {}
    for brand, agg in task_agg.items():
        stats = _zero_stats()
        stats.update(
            remaining_tasks=agg["remaining_tasks"],
            remaining_minutes=agg["remaining_minutes"],
            total_minutes=agg["total_minutes"],
            progress_pct=_progress_pct(agg),
        )
        out[brand] = stats
    for brand, info in sprint_agg.items():
        stats = out.setdefault(brand, _zero_stats())
        stats["active_sprint_count"] = info["count"]
        stats["active_sprint_title"] = info["title"]
    return out


def brand_execution(brand_id: str) -> dict:
    """Single-brand execution rollup: projects + active sprint + remaining work.

    Reuses the SAME primitives as the brand-list cards (_task_aggregates /
    _active_sprints / _progress_pct) so detail-page numbers cannot drift from the
    list. Per-project progress is read from VT Project.percent_done (the project's
    own computed field) — no task re-aggregation. Read-only; safe for the detail
    page's single get_brand_okr call. spec: 2026-06-06-brand-detail-informative.
    """
    projects = frappe.get_all(
        PROJECT_DOCTYPE,
        fields=["name", "title", "percent_done"],
        filters={"brand": brand_id},
        order_by="title asc",
    )
    proj_to_brand = {p["name"]: brand_id for p in projects}
    agg = _task_aggregates(proj_to_brand).get(brand_id) or _zero_task_agg()
    sprint = _active_sprints(proj_to_brand).get(brand_id, {"count": 0, "title": None})
    return {
        "project_count": len(projects),
        "active_sprint_count": sprint["count"],
        "active_sprint_title": sprint["title"],
        "remaining_tasks": agg["remaining_tasks"],
        "remaining_minutes": agg["remaining_minutes"],
        "total_minutes": agg["total_minutes"],
        "progress_pct": _progress_pct(agg),
        "projects": [
            {"id": p["name"], "name": p.get("title") or p["name"],
             "progress": round(p.get("percent_done") or 0)}
            for p in projects
        ],
    }


@frappe.whitelist()
def list_brands(search: str = "") -> list[dict]:
    require_login()
    if not frappe.has_permission(BRAND_DOCTYPE, "read"):
        raise frappe.PermissionError
    filters: dict = {}
    q = max_str(search or "", 100).strip()
    if q:
        filters["brand_name"] = ["like", f"%{q}%"]
    rows = frappe.get_all(
        BRAND_DOCTYPE,
        fields=["name", "brand_name", "logo", "description"],
        filters=filters,
        order_by="brand_name ASC",
        limit_page_length=500,
    )
    stats = _brand_stats_map()
    return [
        {
            "id": r.get("name"),
            "brand_name": r.get("brand_name"),
            "logo": r.get("logo"),
            "description": r.get("description"),
            **stats.get(r.get("name"), _zero_stats()),
        }
        for r in rows
    ]


@frappe.whitelist()
def search_brands(query: str = "", limit: int = BRAND_SEARCH_LIMIT) -> list[dict]:
    """Lightweight picker endpoint returning {id, brand_name, logo}."""
    require_login()
    q = max_str(query or "", 100).strip()
    try:
        lim = max(1, min(int(limit), 50))
    except (TypeError, ValueError):
        lim = BRAND_SEARCH_LIMIT
    filters: dict = {}
    if q:
        filters["brand_name"] = ["like", f"%{q}%"]
    rows = frappe.get_all(
        BRAND_DOCTYPE,
        fields=["name", "brand_name", "logo"],
        filters=filters,
        order_by="brand_name ASC",
        limit_page_length=lim,
    )
    return [
        {"id": r.get("name"), "brand_name": r.get("brand_name"), "logo": r.get("logo")}
        for r in rows
    ]


@frappe.whitelist()
def get_brand(brand_id: str) -> dict:
    require_login()
    brand_id = max_str(brand_id, 140)
    if not frappe.has_permission(BRAND_DOCTYPE, "read", brand_id):
        raise frappe.PermissionError
    doc = frappe.get_doc(BRAND_DOCTYPE, brand_id)
    return _serialize(doc)


@frappe.whitelist()
def create_brand(payload: str | dict) -> dict:
    require_login()
    if not frappe.has_permission(BRAND_DOCTYPE, "create"):
        raise frappe.PermissionError
    parsed = _parse_payload(payload)
    data = _whitelisted_fields(parsed)
    missing = [f for f in REQUIRED_CREATE_FIELDS if not data.get(f)]
    if missing:
        raise frappe.ValidationError(f"missing required fields: {', '.join(missing)}")
    doc = frappe.get_doc({"doctype": BRAND_DOCTYPE, **data})
    doc.insert(ignore_permissions=False)
    return _serialize(doc)


@frappe.whitelist()
def update_brand(brand_id: str, payload: str | dict) -> dict:
    require_login()
    brand_id = max_str(brand_id, 140)
    if not frappe.has_permission(BRAND_DOCTYPE, "write", doc=brand_id):
        raise frappe.PermissionError
    parsed = _parse_payload(payload)
    data = _whitelisted_fields(parsed)
    if not data:
        return _serialize(frappe.get_doc(BRAND_DOCTYPE, brand_id))
    doc = frappe.get_doc(BRAND_DOCTYPE, brand_id)
    other_changes = False
    for field, value in data.items():
        if field == "brand_name":
            if value and value != doc.name:
                frappe.rename_doc(BRAND_DOCTYPE, doc.name, value, force=False)
                doc = frappe.get_doc(BRAND_DOCTYPE, value)
            continue
        setattr(doc, field, value)
        other_changes = True
    if other_changes:
        doc.save(ignore_permissions=False)
    return _serialize(doc)


@frappe.whitelist()
def delete_brand(brand_id: str) -> dict:
    require_login()
    brand_id = max_str(brand_id, 140)
    if not frappe.has_permission(BRAND_DOCTYPE, "delete", doc=brand_id):
        raise frappe.PermissionError
    # Block delete if linked by any VT Project
    in_use = frappe.db.count("VT Project", {"brand": brand_id})
    if in_use:
        raise frappe.ValidationError(
            f"Brand is linked to {in_use} project(s); reassign before deleting"
        )
    frappe.delete_doc(BRAND_DOCTYPE, brand_id, ignore_permissions=False)
    return {"deleted": brand_id}

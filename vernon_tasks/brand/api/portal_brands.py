"""Portal Brands endpoints — list, search, create, update, delete VT Brand.

VT Brand itself is independent of the unified VT Item hierarchy and is read/written
as-is. The per-brand execution rollup, however, walks the VT Item tree: Projects ->
node_type="Project", Sprints -> node_type="Sprint", Tasks -> node_type="Task"
(legacy VT Project / VT Sprint / VT Task are dead to this API). A Project's OKR link
is its tree parent (parent_vt_item); a Sprint/Task's project is its tree ancestor.
Renamed fields: VT Project.status -> health_status, VT Sprint.status -> sprint_state,
VT Sprint.sprint_title -> VT Item.title. All node reads go through vt_item_tree.
"""
from __future__ import annotations

from typing import Any

import frappe

from vernon_tasks.task.api.security import max_str, require_login
from vernon_tasks.task.services import vt_item_tree as tree

BRAND_DOCTYPE = "VT Brand"
# Project / Sprint / Task are typed VT Item nodes in the unified hierarchy.
VT_ITEM_DOCTYPE = "VT Item"
PROJECT_NODE_TYPE = "Project"
SPRINT_NODE_TYPE = "Sprint"
TASK_NODE_TYPE = "Task"
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
# VT Item.sprint_state (renamed from VT Sprint.status): "Active" = running sprint.
ACTIVE_SPRINT_STATE = "Active"
# A cancelled task keeps its last kanban_status, so cancelled rows must be dropped
# at the DB layer too (docstatus 2 = Cancelled).
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
    """Map every brand-linked Project node name -> its brand (orphans dropped)."""
    rows = tree.nodes(
        PROJECT_NODE_TYPE, filters={"brand": ["is", "set"]}, fields=["name", "brand"]
    )
    return {r["name"]: r["brand"] for r in rows if r.get("brand")}


def _task_aggregates(proj_to_brand: dict[str, str]) -> dict[str, dict]:
    """Sum estimated minutes + open-task counts per brand from each Project subtree.

    Counts only non-cancelled Task nodes under brand-linked Project nodes. A
    Project's Tasks are read via the nested-set subtree (spans any Sprint level),
    so a task sitting under a Sprint still rolls up to its Project's brand.
    ``remaining`` = tasks whose kanban_status is not Done; ``total`` includes done
    but excludes Cancelled, so progress = (total - remaining) / total stays
    consistent.
    """
    agg: dict[str, dict] = {}
    if not proj_to_brand:
        return agg
    for project, brand in proj_to_brand.items():
        if not brand:
            continue
        tasks = tree.descendants(
            project, TASK_NODE_TYPE,
            filters={"docstatus": ["<", DOCSTATUS_CANCELLED]},
            fields=["name", "kanban_status", "estimated_minutes"],
        )
        for t in tasks:
            status = t.get("kanban_status")
            # Skip cancelled (defensive — docstatus filter usually drops these).
            if status == CANCELLED_KANBAN_STATUS:
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

    Scoped to the given Project nodes at the DB layer (mirrors _task_aggregates)
    so a single-brand caller does not load every active sprint site-wide. A Sprint
    is a direct child of its Project (parent_vt_item); sprint_state replaces the
    legacy status and the sprint title now lives on VT Item.title.
    """
    out: dict[str, dict] = {}
    if not proj_to_brand:
        return out
    rows = tree.nodes(
        SPRINT_NODE_TYPE,
        filters={"sprint_state": ACTIVE_SPRINT_STATE,
                 "parent_vt_item": ["in", list(proj_to_brand)]},
        fields=["parent_vt_item", "title"],
        order_by="creation desc",  # deterministic "first" title across reloads
    )
    for s in rows:
        brand = proj_to_brand.get(s.get("parent_vt_item"))
        if not brand:
            continue
        info = out.setdefault(brand, {"count": 0, "title": None})
        info["count"] += 1
        if info["title"] is None:
            info["title"] = s.get("title")
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
    list. Per-project progress is read from the Project node's percent_done (its own
    computed field) — no task re-aggregation. Read-only; safe for the detail page's
    single get_brand_okr call. spec: 2026-06-06-brand-detail-informative.
    """
    projects = tree.nodes(
        PROJECT_NODE_TYPE,
        # `parent_vt_item` carries the Project→OKR link (a Project is parented to its
        # objective node), so the detail page can show an objective chip per project;
        # title resolution is done by the caller.
        fields=["name", "title", "percent_done", "parent_vt_item"],
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
             "progress": round(p.get("percent_done") or 0),
             "objective": p.get("parent_vt_item")}
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
    # Block delete if linked by any Project node in the VT Item tree.
    in_use = len(tree.nodes(PROJECT_NODE_TYPE, filters={"brand": brand_id},
                            fields=["name"]))
    if in_use:
        raise frappe.ValidationError(
            f"Brand is linked to {in_use} project(s); reassign before deleting"
        )
    frappe.delete_doc(BRAND_DOCTYPE, brand_id, ignore_permissions=False)
    return {"deleted": brand_id}

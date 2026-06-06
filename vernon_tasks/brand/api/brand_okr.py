"""Brand OKR read endpoint — objectives grouped by period for the brand detail page.

Layer: HTTP entrypoint (Layer 2, Priority 5 per vernon-dev Frappe Hooks-First).
Read-only aggregation; all write paths live in brand_okr_mutations.py and delegate
to the Objective / Key Result controllers.

Source of truth: docs/superpowers/specs/2026-06-04-brand-detail-okr-design.html
"""
from __future__ import annotations

from typing import Any

import frappe
from frappe.utils import getdate, today

from vernon_tasks.brand.api.portal_brands import brand_execution
from vernon_tasks.okr.doctype.objective.objective import aggregate_kr_progress
from vernon_tasks.task.api.security import max_str, require_login

BRAND_DOCTYPE = "VT Brand"
OBJECTIVE_DOCTYPE = "Objective"
KEY_RESULT_DOCTYPE = "Key Result"
NO_PERIOD_LABEL = "Tanpa Period"
OBJECTIVE_FETCH_LIMIT = 500
KEY_RESULT_FETCH_LIMIT = 1000
USER_DOCTYPE = "User"
DEFAULT_STATUS = "Open"
AT_RISK_STATUS = "At Risk"


@frappe.whitelist()
def get_brand_okr(brand_id: str) -> dict:
    """Return the brand header + its objectives grouped by period.

    Shape: see docs/superpowers/specs/2026-06-04-brand-detail-okr-design.html §2.2.
    Periods are ordered newest-first (objectives pre-sorted by period_start desc);
    objectives with a blank period fall into a trailing "Tanpa Period" bucket.
    """
    require_login()
    brand_id = max_str(brand_id, 140)
    if not brand_id or not frappe.db.exists(BRAND_DOCTYPE, brand_id):
        frappe.throw("Brand tidak ditemukan", frappe.DoesNotExistError)
    if not frappe.has_permission(BRAND_DOCTYPE, "read", doc=brand_id):
        raise frappe.PermissionError

    brand = frappe.db.get_value(
        BRAND_DOCTYPE, brand_id,
        ["name", "brand_name", "logo", "description"], as_dict=True,
    )
    objectives = _read_objectives(brand_id)
    krs_by_obj = _read_key_results([o["name"] for o in objectives])
    periods = _group_by_period(objectives, krs_by_obj)
    periods = _attach_owners(periods)
    return {
        "brand": {
            "id": brand["name"],
            "brand_name": brand.get("brand_name"),
            "logo": brand.get("logo"),
            "description": brand.get("description"),
        },
        # Per-doctype edit gating — affordances are hidden unless the user holds
        # the matching permission (Objective and Key Result are separate doctypes).
        "can_create_objective": bool(frappe.has_permission(OBJECTIVE_DOCTYPE, "create")),
        "can_edit_objective": bool(frappe.has_permission(OBJECTIVE_DOCTYPE, "write")),
        "can_create_kr": bool(frappe.has_permission(KEY_RESULT_DOCTYPE, "create")),
        "can_edit_kr": bool(frappe.has_permission(KEY_RESULT_DOCTYPE, "write")),
        "summary": _summary(periods),
        "execution": brand_execution(brand_id),
        "periods": periods,
    }


def _read_objectives(brand_id: str) -> list[dict]:
    """All objectives for a brand, pre-sorted newest-period first."""
    return frappe.get_all(
        OBJECTIVE_DOCTYPE,
        filters={"brand": brand_id},
        fields=["name", "title", "status", "pdca_phase", "objective_owner",
                "period", "period_start", "period_end"],
        order_by="period_start desc, title asc",
        limit_page_length=OBJECTIVE_FETCH_LIMIT,
    )


def _read_key_results(objective_ids: list[str]) -> dict[str, list[dict]]:
    """Batch-load Key Results for all objectives at once — avoids N+1."""
    grouped: dict[str, list[dict]] = {}
    if not objective_ids:
        return grouped
    rows = frappe.get_all(
        KEY_RESULT_DOCTYPE,
        filters={"objective": ["in", objective_ids]},
        fields=["name", "objective", "metric", "target_value", "current_value",
                "unit", "progress_percent", "confidence"],
        limit_page_length=KEY_RESULT_FETCH_LIMIT,
    )
    for r in rows:
        grouped.setdefault(r["objective"], []).append({
            "id": r["name"],
            "metric": r.get("metric"),
            "target": float(r.get("target_value") or 0),
            "current": float(r.get("current_value") or 0),
            "unit": r.get("unit"),
            "progress_percent": float(r.get("progress_percent") or 0),
            "confidence": float(r.get("confidence") or 0),
        })
    return grouped


def _group_by_period(objectives: list[dict], krs_by_obj: dict[str, list[dict]]) -> list[dict]:
    """Group objectives by `period`; blank period → trailing bucket.

    Objectives arrive pre-sorted by period_start desc, so each period's first
    sighting fixes its display order. The blank-period bucket always renders last.
    """
    order: list[str] = []
    buckets: dict[str, dict] = {}
    for obj in objectives:
        key = obj.get("period") or NO_PERIOD_LABEL
        if key not in buckets:
            order.append(key)
            buckets[key] = {
                "period": key,
                "period_start": obj.get("period_start"),
                "period_end": obj.get("period_end"),
                "is_current": _is_current(obj.get("period_start"), obj.get("period_end")),
                "objectives": [],
            }
        krs = krs_by_obj.get(obj["name"], [])
        buckets[key]["objectives"].append({
            "id": obj["name"],
            "title": obj.get("title") or obj["name"],
            "status": obj.get("status"),
            "pdca_phase": obj.get("pdca_phase"),
            "owner": obj.get("objective_owner"),
            "progress": aggregate_kr_progress([(k["current"], k["target"]) for k in krs]),
            "key_results": krs,
        })
    for bucket in buckets.values():
        objs = bucket["objectives"]
        bucket["progress"] = round(sum(o["progress"] for o in objs) / len(objs)) if objs else 0
    keys = [k for k in order if k != NO_PERIOD_LABEL]
    if NO_PERIOD_LABEL in buckets:
        keys.append(NO_PERIOD_LABEL)
    return [buckets[k] for k in keys]


def _is_current(period_start: Any, period_end: Any) -> bool:
    """True when today falls within [period_start, period_end]."""
    if not period_start or not period_end:
        return False
    now = getdate(today())
    return getdate(period_start) <= now <= getdate(period_end)


def _summary(periods: list[dict]) -> dict:
    """At-a-glance brand health, computed from already-loaded periods (no DB hit).

    avg_progress = mean of per-objective aggregate progress; status_counts feeds
    the segment bar; active_period mirrors the is_current period's progress.
    spec: 2026-06-06-brand-detail-informative §3.1.1.
    """
    objectives = [o for p in periods for o in p["objectives"]]
    obj_count = len(objectives)
    kr_count = sum(len(o["key_results"]) for o in objectives)
    status_counts: dict[str, int] = {}
    for o in objectives:
        key = o.get("status") or DEFAULT_STATUS
        status_counts[key] = status_counts.get(key, 0) + 1
    avg_progress = round(sum(o["progress"] for o in objectives) / obj_count) if obj_count else 0
    current = next((p for p in periods if p.get("is_current")), None)
    active_period = {"period": current["period"], "progress": current["progress"]} if current else None
    return {
        "objective_count": obj_count,
        "kr_count": kr_count,
        "avg_progress": avg_progress,
        "status_counts": status_counts,
        "at_risk_count": status_counts.get(AT_RISK_STATUS, 0),
        "active_period": active_period,
    }


def _attach_owners(periods: list[dict]) -> list[dict]:
    """Resolve each objective's owner to display name + avatar in ONE query.

    Mutates the period dicts in place, adding owner_name / owner_image, then
    returns the list. Falls back to the raw owner id (name) and None (image)
    when the User row is missing. Avoids N+1 by batching all distinct owners
    into a single get_all.
    """
    owner_ids = {o["owner"] for p in periods for o in p["objectives"] if o.get("owner")}
    info: dict[str, dict] = {}
    if owner_ids:
        rows = frappe.get_all(
            USER_DOCTYPE,
            filters={"name": ["in", list(owner_ids)]},
            fields=["name", "full_name", "user_image"],
            limit_page_length=len(owner_ids),  # exact — never truncate owners
        )
        info = {r["name"]: {"name": r.get("full_name") or r["name"],
                            "image": r.get("user_image")} for r in rows}
    for p in periods:
        for o in p["objectives"]:
            resolved = info.get(o.get("owner"))
            o["owner_name"] = resolved["name"] if resolved else (o.get("owner") or None)
            o["owner_image"] = resolved["image"] if resolved else None
    return periods

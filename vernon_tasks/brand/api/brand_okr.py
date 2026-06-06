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
PROJECT_DOCTYPE = "VT Project"
KPI_DEFINITION_DOCTYPE = "KPI Definition"
KPI_ENTRY_DOCTYPE = "KPI Entry"
NO_PERIOD_LABEL = "Tanpa Period"
OBJECTIVE_FETCH_LIMIT = 500
KEY_RESULT_FETCH_LIMIT = 1000
PROJECT_FETCH_LIMIT = 500
KPI_FETCH_LIMIT = 500
# KPI Entry history can be large (Daily KPIs × years). We only need the latest
# two per definition, but read in one batched query and slice in Python.
KPI_ENTRY_FETCH_LIMIT = 5000
USER_DOCTYPE = "User"
DEFAULT_STATUS = "Open"
AT_RISK_STATUS = "At Risk"
# Latest + previous: enough to render a value and a trend arrow.
KPI_HISTORY_KEEP = 2


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
    affordances = _affordances()
    objectives = _read_objectives(brand_id)
    obj_ids = [o["name"] for o in objectives]
    # One shared id→title map serves both the KPI block and the execution chips,
    # so neither re-queries Objective (titles are already loaded here).
    obj_title_map = {o["name"]: (o.get("title") or o["name"]) for o in objectives}
    periods = _attach_owners(_group_by_period(
        objectives, _read_key_results(obj_ids), _read_objective_projects(brand_id, obj_ids)))
    kpis = _read_brand_kpis(brand_id, obj_title_map) if affordances["can_read_kpi"] else []
    summary = _summary(periods)
    summary["kpi_count"] = len(kpis)
    execution = brand_execution(brand_id)
    _attach_execution_objectives(execution, obj_title_map)
    return {
        "brand": {
            "id": brand["name"],
            "brand_name": brand.get("brand_name"),
            "logo": brand.get("logo"),
            "description": brand.get("description"),
        },
        **affordances,
        "summary": summary,
        "execution": execution,
        "periods": periods,
        "kpis": kpis,
    }


def _affordances() -> dict:
    """Per-doctype create/edit/read gating for the page's affordances.

    Objective, Key Result and KPI Definition are separate doctypes with
    independent permissions; each affordance is hidden unless the user holds the
    matching grant. Read-only for KPI — KPIs are managed on their native forms.
    """
    return {
        "can_create_objective": bool(frappe.has_permission(OBJECTIVE_DOCTYPE, "create")),
        "can_edit_objective": bool(frappe.has_permission(OBJECTIVE_DOCTYPE, "write")),
        "can_create_kr": bool(frappe.has_permission(KEY_RESULT_DOCTYPE, "create")),
        "can_edit_kr": bool(frappe.has_permission(KEY_RESULT_DOCTYPE, "write")),
        "can_read_kpi": bool(frappe.has_permission(KPI_DEFINITION_DOCTYPE, "read")),
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


def _read_objective_projects(brand_id: str, objective_ids: list[str]) -> dict[str, list[dict]]:
    """Projects linked to each objective — the OKR↔Project bridge (batched).

    Brand-scoped on purpose: VT Project.objective is a loose Link with no
    controller guard that project.brand == objective.brand, so filtering on the
    objective alone could surface another brand's project. The `brand` filter
    keeps STRATEGI consistent with the brand-scoped EKSEKUSI rollup.
    """
    grouped: dict[str, list[dict]] = {}
    if not objective_ids:
        return grouped
    rows = frappe.get_all(
        PROJECT_DOCTYPE,
        filters={"brand": brand_id, "objective": ["in", objective_ids]},
        fields=["name", "title", "status", "percent_done", "objective"],
        order_by="modified desc",
        limit_page_length=PROJECT_FETCH_LIMIT,
    )
    for r in rows:
        grouped.setdefault(r["objective"], []).append({
            "id": r["name"],
            "title": r.get("title") or r["name"],
            "status": r.get("status"),
            "progress": round(r.get("percent_done") or 0),
        })
    return grouped


def _read_brand_kpis(brand_id: str, obj_title_map: dict[str, str]) -> list[dict]:
    """Brand-level KPI block: each KPI Definition + its latest/previous value.

    KPI Definition has no stored "current"; the latest value is the most recent
    KPI Entry. `progress` is attainment vs target (None when no positive target —
    a KPI may simply be tracked). `objective_title` is resolved from the shared
    map (no extra Objective query).
    """
    defs = frappe.get_all(
        KPI_DEFINITION_DOCTYPE,
        filters={"brand": brand_id},
        fields=["name", "kpi_name", "unit", "frequency", "objective", "target_value"],
        order_by="kpi_name asc",
        limit_page_length=KPI_FETCH_LIMIT,
    )
    if not defs:
        return []
    history = _latest_kpi_entries([d["name"] for d in defs])
    out: list[dict] = []
    for d in defs:
        pair = history.get(d["name"], [])
        latest = pair[0] if pair else None
        prev = pair[1] if len(pair) > 1 else None
        latest_val = latest["value"] if latest else None
        prev_val = prev["value"] if prev else None
        target = float(d.get("target_value") or 0)
        out.append({
            "id": d["name"],
            "title": d.get("kpi_name") or d["name"],
            "unit": d.get("unit"),
            "frequency": d.get("frequency"),
            "objective": d.get("objective"),
            "objective_title": obj_title_map.get(d.get("objective")),
            "target": target,
            "value": latest_val,
            "latest_date": latest["date"] if latest else None,
            "prev_value": prev_val,
            "progress": _kpi_progress(latest_val, target),
            "trend": _kpi_trend(latest_val, prev_val),
        })
    return out


def _latest_kpi_entries(def_ids: list[str]) -> dict[str, list[dict]]:
    """Latest + previous KPI Entry per definition in ONE batched query (no N+1).

    Rows arrive globally date-desc; the first KPI_HISTORY_KEEP seen for each
    definition are therefore its most recent observations.
    """
    grouped: dict[str, list[dict]] = {}
    if not def_ids:
        return grouped
    rows = frappe.get_all(
        KPI_ENTRY_DOCTYPE,
        filters={"kpi_definition": ["in", def_ids]},
        fields=["kpi_definition", "date", "value"],
        order_by="date desc",
        limit_page_length=KPI_ENTRY_FETCH_LIMIT,
    )
    for r in rows:
        bucket = grouped.setdefault(r["kpi_definition"], [])
        if len(bucket) < KPI_HISTORY_KEEP:
            bucket.append({"date": r["date"], "value": float(r.get("value") or 0)})
    return grouped


def _kpi_progress(value: float | None, target: float | None) -> float | None:
    """KPI attainment % = value / target * 100, or None when target is not positive.

    Unlike aggregate_kr_progress this does NOT clamp at 100: over-performance is
    meaningful for a single tracked metric. Returns None (value-only render) when
    target ≤ 0 — note a Float field defaults to 0, so `target > 0` is the only
    safe "has a target" discriminator.
    """
    if not target or target <= 0:
        return None
    return round((value or 0) / target * 100, 2)


def _kpi_trend(latest: float | None, prev: float | None) -> str:
    """Direction of the latest observation vs the previous one.

    Returns "none" when a comparison is impossible (missing either value, e.g. a
    KPI with zero or one entry); otherwise up / down / flat.
    """
    if latest is None or prev is None:
        return "none"
    if latest > prev:
        return "up"
    if latest < prev:
        return "down"
    return "flat"


def _attach_execution_objectives(execution: dict, obj_title_map: dict[str, str]) -> None:
    """Resolve each execution project's objective id → title in place (EKSEKUSI chip).

    Uses the shared id→title map; a project with no objective (or one outside
    this brand's objectives) gets None and renders as "tanpa objective".
    """
    for project in execution.get("projects", []):
        project["objective_title"] = obj_title_map.get(project.get("objective"))


def _group_by_period(objectives: list[dict], krs_by_obj: dict[str, list[dict]],
                     projects_by_obj: dict[str, list[dict]] | None = None) -> list[dict]:
    """Group objectives by `period`; blank period → trailing bucket.

    Objectives arrive pre-sorted by period_start desc, so each period's first
    sighting fixes its display order. The blank-period bucket always renders last.
    `projects_by_obj` carries the OKR↔Project bridge (linked projects per
    objective); defaults to empty so pure-function callers stay back-compatible.
    """
    projects_by_obj = projects_by_obj or {}
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
            "projects": projects_by_obj.get(obj["name"], []),
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

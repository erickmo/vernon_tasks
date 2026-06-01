"""vt-okr page API: OKR management for Leaders and Managers.

Provides list_objectives (with Key Results embedded) and
update_key_result (inline current_value + confidence update).
Create/delete Objectives delegates to native Frappe form.
"""
from __future__ import annotations

import frappe

_ALLOWED_ROLES = ("VT Leader", "VT Manager")
_OBJ_DOCTYPE = "Objective"
_KR_DOCTYPE = "Key Result"


def _require_leader() -> None:
    """Raise PermissionError unless caller holds VT Leader or VT Manager."""
    frappe.only_for(_ALLOWED_ROLES)


@frappe.whitelist()
def list_objectives(period: str | None = None, brand: str | None = None) -> list[dict]:
    """Return Objectives with embedded Key Results and computed avg_progress.

    Optionally filters by OKR period (e.g. '2026-Q2') or brand name.
    """
    _require_leader()

    filters: dict = {}
    if period:
        filters["period"] = period
    if brand:
        filters["brand"] = brand

    objectives = frappe.get_all(
        _OBJ_DOCTYPE,
        filters=filters,
        fields=["name", "title", "brand", "period", "period_start", "period_end",
                "objective_owner", "status", "pdca_phase"],
        order_by="period desc, title asc",
    )

    objective_names = [o["name"] for o in objectives]
    all_krs = frappe.get_all(
        _KR_DOCTYPE,
        filters={"objective": ("in", objective_names)} if objective_names else {"objective": ""},
        fields=["name", "objective", "metric", "target_value", "current_value",
                "progress_percent", "confidence", "unit"],
    ) if objective_names else []

    krs_by_objective: dict[str, list] = {}
    for kr in all_krs:
        krs_by_objective.setdefault(kr["objective"], []).append(kr)

    for obj in objectives:
        krs = krs_by_objective.get(obj["name"], [])
        obj["key_results"] = krs
        obj["kr_count"] = len(krs)
        obj["avg_progress"] = (
            sum(k["progress_percent"] or 0 for k in krs) / len(krs) if krs else 0
        )

    return objectives


@frappe.whitelist()
def update_key_result(key_result: str, current_value: float,
                      confidence: float | None = None) -> dict:
    """Update current_value (and optionally confidence) on a Key Result.

    Recalculates progress_percent = min(100, current / target * 100).
    Returns {"progress_percent": ..., "current_value": ...}.
    """
    _require_leader()

    doc = frappe.get_doc(_KR_DOCTYPE, key_result)
    doc.current_value = float(current_value)

    if confidence is not None:
        doc.confidence = float(confidence)

    if doc.target_value:
        doc.progress_percent = min(100.0, (doc.current_value / doc.target_value) * 100)

    doc.save()

    return {
        "progress_percent": doc.progress_percent,
        "current_value": doc.current_value,
    }

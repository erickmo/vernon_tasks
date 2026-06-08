"""vt-okr page API: OKR management for Leaders and Managers.

Provides list_objectives (with Key Results embedded) and
update_key_result (inline current_value + confidence update).
Create/delete Objectives delegates to native Frappe form.

Unified hierarchy (VT Item tree): Objective -> node_type="OKR";
Key Result -> "VT Item Key Result" child rows on the OKR node's
`key_results` table. Reads go through task.services.vt_item_tree; the
renamed VT Item fields (health_status, owner_user) are re-keyed to the
legacy names (status, objective_owner) so the page JSON shape is unchanged.
"""
from __future__ import annotations

import frappe

from vernon_tasks.task.services import vt_item_tree as tree

_ALLOWED_ROLES = ("VT Leader", "VT Manager")
_VT_ITEM_DOCTYPE = "VT Item"
_OKR_NODE_TYPE = "OKR"
_KEY_RESULT_DOCTYPE = "VT Item Key Result"
_KEY_RESULTS_TABLE = "key_results"
_MAX_PROGRESS = 100.0


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

    # Objective -> VT Item node_type="OKR". Read renamed fields and re-key them
    # to the legacy names (status, objective_owner) the page JS consumes.
    nodes = tree.nodes(
        _OKR_NODE_TYPE,
        filters=filters,
        fields=["name", "title", "brand", "period", "period_start", "period_end",
                "owner_user", "health_status", "pdca_phase"],
        order_by="period desc, title asc",
    )

    objectives = [{
        "name": n["name"],
        "title": n.get("title"),
        "brand": n.get("brand"),
        "period": n.get("period"),
        "period_start": n.get("period_start"),
        "period_end": n.get("period_end"),
        "objective_owner": n.get("owner_user"),
        "status": n.get("health_status"),
        "pdca_phase": n.get("pdca_phase"),
    } for n in nodes]

    for obj in objectives:
        # Key Result -> child rows on the OKR node's `key_results` table.
        # Re-key the child-row `name` to the `name` field the page JS expects.
        krs = [{
            "name": r["name"],
            "objective": obj["name"],
            "metric": r.get("metric"),
            "target_value": r.get("target_value"),
            "current_value": r.get("current_value"),
            "progress_percent": r.get("progress_percent"),
            "confidence": r.get("confidence"),
            "unit": r.get("unit"),
        } for r in tree.child_table_rows(obj["name"], _KEY_RESULTS_TABLE)]
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

    # Key Result -> child row of the OKR node; locate its parent OKR, edit the
    # row in place, and save the parent (the VT Item controller owns invariants).
    objective_name = frappe.db.get_value(_KEY_RESULT_DOCTYPE, key_result, "parent")
    if not objective_name:
        frappe.throw("Key Result tidak ditemukan", frappe.DoesNotExistError)

    node = frappe.get_doc(_VT_ITEM_DOCTYPE, objective_name)
    row = next((r for r in node.get(_KEY_RESULTS_TABLE) if r.name == key_result), None)
    if row is None:
        frappe.throw("Key Result tidak ditemukan", frappe.DoesNotExistError)

    row.current_value = float(current_value)

    if confidence is not None:
        row.confidence = float(confidence)

    if row.target_value:
        row.progress_percent = min(_MAX_PROGRESS, (row.current_value / row.target_value) * 100)

    node.save()

    return {
        "progress_percent": row.progress_percent,
        "current_value": row.current_value,
    }

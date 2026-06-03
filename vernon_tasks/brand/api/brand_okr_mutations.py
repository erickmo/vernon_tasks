"""Brand OKR mutations — inline create/edit of Objective + Key Result.

Layer: HTTP entrypoints (Layer 2, Priority 5 per vernon-dev Frappe Hooks-First).
Each whitelist is a thin wrapper that delegates ALL validation to the Objective /
Key Result controllers via doc.insert() / doc.save() — the controllers own period
auto-fill, PDCA legality and progress computation. Field allow-lists guard against
mass-assignment; native DocType permissions are honored (no ignore_permissions).
`brand` is forced from the path param so an objective created on a brand's page
always belongs to that brand. pdca_phase is excluded so PDCA transitions stay on
the native form (the Deming state machine in Objective.validate stays authoritative).

Source of truth: docs/superpowers/specs/2026-06-04-brand-detail-okr-design.html §2.3
"""
from __future__ import annotations

import frappe

from vernon_tasks.task.api.security import max_str, parse_payload, pick_fields, require_login

BRAND_DOCTYPE = "VT Brand"
OBJECTIVE_DOCTYPE = "Objective"
KEY_RESULT_DOCTYPE = "Key Result"

# Mass-assignment allow-lists. EXCLUDES pdca_phase (PDCA state machine stays on the
# native form) and every server-computed field.
OBJECTIVE_EDITABLE_FIELDS = (
    "title", "period", "period_start", "period_end",
    "objective_owner", "status", "description",
)
# EXCLUDES progress_percent (controller-computed) + confidence_last_week (system).
KEY_RESULT_EDITABLE_FIELDS = (
    "metric", "target_value", "current_value", "unit", "confidence",
)


@frappe.whitelist()
def create_objective(brand_id: str, values: str | dict) -> dict:
    """Create an Objective under `brand_id` (brand forced from the path param)."""
    require_login()
    brand_id = max_str(brand_id, 140)
    if not frappe.db.exists(BRAND_DOCTYPE, brand_id):
        frappe.throw("Brand tidak ditemukan", frappe.DoesNotExistError)
    if not frappe.has_permission(OBJECTIVE_DOCTYPE, "create"):
        raise frappe.PermissionError
    data = pick_fields(parse_payload(values), OBJECTIVE_EDITABLE_FIELDS)
    # brand is forced from the path param — never trust a brand in the payload.
    doc = frappe.get_doc({"doctype": OBJECTIVE_DOCTYPE, "brand": brand_id, **data})
    doc.insert(ignore_permissions=False)
    return {"id": doc.name}


@frappe.whitelist()
def update_objective(objective_id: str, values: str | dict) -> dict:
    """Patch allow-listed fields of an Objective (brand cannot be reassigned here)."""
    require_login()
    objective_id = max_str(objective_id, 140)
    if not frappe.has_permission(OBJECTIVE_DOCTYPE, "write", doc=objective_id):
        raise frappe.PermissionError
    doc = frappe.get_doc(OBJECTIVE_DOCTYPE, objective_id)
    for field, value in pick_fields(parse_payload(values), OBJECTIVE_EDITABLE_FIELDS).items():
        setattr(doc, field, value)
    doc.save(ignore_permissions=False)
    return {"id": doc.name}


@frappe.whitelist()
def create_key_result(objective_id: str, values: str | dict) -> dict:
    """Create a Key Result under an existing Objective."""
    require_login()
    objective_id = max_str(objective_id, 140)
    if not frappe.db.exists(OBJECTIVE_DOCTYPE, objective_id):
        frappe.throw("Objective tidak ditemukan", frappe.DoesNotExistError)
    if not frappe.has_permission(KEY_RESULT_DOCTYPE, "create"):
        raise frappe.PermissionError
    data = pick_fields(parse_payload(values), KEY_RESULT_EDITABLE_FIELDS)
    doc = frappe.get_doc({"doctype": KEY_RESULT_DOCTYPE, "objective": objective_id, **data})
    doc.insert(ignore_permissions=False)
    return {"id": doc.name}


@frappe.whitelist()
def update_key_result(kr_id: str, values: str | dict) -> dict:
    """Patch allow-listed fields of a Key Result (progress_percent recomputed)."""
    require_login()
    kr_id = max_str(kr_id, 140)
    if not frappe.has_permission(KEY_RESULT_DOCTYPE, "write", doc=kr_id):
        raise frappe.PermissionError
    doc = frappe.get_doc(KEY_RESULT_DOCTYPE, kr_id)
    for field, value in pick_fields(parse_payload(values), KEY_RESULT_EDITABLE_FIELDS).items():
        setattr(doc, field, value)
    doc.save(ignore_permissions=False)
    return {"id": doc.name}


@frappe.whitelist()
def get_objective(objective_id: str) -> dict:
    """Editable scalar fields to hydrate the objective edit dialog."""
    require_login()
    objective_id = max_str(objective_id, 140)
    if not frappe.has_permission(OBJECTIVE_DOCTYPE, "read", doc=objective_id):
        raise frappe.PermissionError
    row = frappe.db.get_value(
        OBJECTIVE_DOCTYPE, objective_id,
        ["name", *OBJECTIVE_EDITABLE_FIELDS], as_dict=True,
    )
    if not row:
        frappe.throw("Objective tidak ditemukan", frappe.DoesNotExistError)
    return row


@frappe.whitelist()
def get_key_result(kr_id: str) -> dict:
    """Editable scalar fields to hydrate the key result edit dialog."""
    require_login()
    kr_id = max_str(kr_id, 140)
    if not frappe.has_permission(KEY_RESULT_DOCTYPE, "read", doc=kr_id):
        raise frappe.PermissionError
    row = frappe.db.get_value(
        KEY_RESULT_DOCTYPE, kr_id,
        ["name", "objective", *KEY_RESULT_EDITABLE_FIELDS], as_dict=True,
    )
    if not row:
        frappe.throw("Key Result tidak ditemukan", frappe.DoesNotExistError)
    return row

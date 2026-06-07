"""Brand Key Result mutations — inline create/edit of Key Result.

Layer: HTTP entrypoints (Layer 2, Priority 5 per vernon-dev Frappe Hooks-First).
Each whitelist is a thin wrapper that delegates ALL validation to the Key Result
controller via doc.insert() / doc.save() — the controller owns progress
computation. The field allow-list guards against mass-assignment; native DocType
permissions are honored (no ignore_permissions). The parent `objective` is forced
from the path param so a Key Result always belongs to the objective it was created
under.

Objective create/edit no longer has an app endpoint: the brand-detail page uses
Frappe native quick entry (create) and the native full form (edit), which save via
frappe.client.save and run the Objective controller's validations unchanged.
See docs/superpowers/specs/2026-06-07-objective-native-quick-entry-design.html.

Source of truth: docs/superpowers/specs/2026-06-04-brand-detail-okr-design.html §2.3
"""
from __future__ import annotations

import frappe

from vernon_tasks.task.api.security import max_str, parse_payload, pick_fields, require_login

OBJECTIVE_DOCTYPE = "Objective"
KEY_RESULT_DOCTYPE = "Key Result"

# Mass-assignment allow-list. EXCLUDES progress_percent (controller-computed) +
# confidence_last_week (system).
KEY_RESULT_EDITABLE_FIELDS = (
    "metric", "target_value", "current_value", "unit", "confidence",
)


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

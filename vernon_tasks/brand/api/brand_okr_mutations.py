"""Brand Key Result mutations — inline create/edit of Key Result.

Layer: HTTP entrypoints (Layer 2, Priority 5 per vernon-dev Frappe Hooks-First).
Each whitelist is a thin wrapper that delegates ALL validation to the VT Item
controller via node.save() — the controller owns child-row invariants. The field
allow-list guards against mass-assignment; native DocType permissions are honored
(no ignore_permissions). The parent objective is forced from the path param so a
Key Result always belongs to the OKR node it was created under.

VT Item tree model (unified hierarchy):
- Objective  -> VT Item node_type="OKR"
- Key Result -> "VT Item Key Result" child rows in the OKR node's `key_results`
  table (metric, target_value, current_value, unit, confidence). Each row is
  addressable by its own `name`; its parent OKR node is `parent`.

Objective create/edit no longer has an app endpoint: the brand-detail page uses
Frappe native quick entry (create) and the native full form (edit).
See docs/superpowers/specs/2026-06-07-objective-native-quick-entry-design.html.

Source of truth:
docs/superpowers/specs/2026-06-07-vt-item-unified-hierarchy-design.html
"""
from __future__ import annotations

import frappe

from vernon_tasks.task.api.security import max_str, parse_payload, pick_fields, require_login
from vernon_tasks.task.services import vt_item_tree as tree

VT_ITEM_DOCTYPE = "VT Item"
OKR_NODE_TYPE = "OKR"
KEY_RESULT_DOCTYPE = "VT Item Key Result"
KEY_RESULTS_TABLE = "key_results"

# Mass-assignment allow-list. EXCLUDES progress_percent (controller-computed) +
# confidence_last_week (system).
KEY_RESULT_EDITABLE_FIELDS = (
	"metric", "target_value", "current_value", "unit", "confidence",
)


def _okr_exists(objective_id: str) -> bool:
	"""True when `objective_id` names an OKR-type VT Item node."""
	return bool(tree.nodes(OKR_NODE_TYPE, {"name": objective_id}, ["name"], limit=1))


@frappe.whitelist()
def create_key_result(objective_id: str, values: str | dict) -> dict:
	"""Create a Key Result child row under an existing OKR (Objective) node."""
	require_login()
	objective_id = max_str(objective_id, 140)
	if not _okr_exists(objective_id):
		frappe.throw("Objective tidak ditemukan", frappe.DoesNotExistError)
	if not frappe.has_permission(VT_ITEM_DOCTYPE, "write", doc=objective_id):
		raise frappe.PermissionError
	data = pick_fields(parse_payload(values), KEY_RESULT_EDITABLE_FIELDS)
	node = frappe.get_doc(VT_ITEM_DOCTYPE, objective_id)
	row = node.append(KEY_RESULTS_TABLE, data)
	node.save(ignore_permissions=False)
	return {"id": row.name}


@frappe.whitelist()
def update_key_result(kr_id: str, values: str | dict) -> dict:
	"""Patch allow-listed fields of a Key Result child row."""
	require_login()
	kr_id = max_str(kr_id, 140)
	objective_id = frappe.db.get_value(KEY_RESULT_DOCTYPE, kr_id, "parent")
	if not objective_id:
		frappe.throw("Key Result tidak ditemukan", frappe.DoesNotExistError)
	if not frappe.has_permission(VT_ITEM_DOCTYPE, "write", doc=objective_id):
		raise frappe.PermissionError
	node = frappe.get_doc(VT_ITEM_DOCTYPE, objective_id)
	data = pick_fields(parse_payload(values), KEY_RESULT_EDITABLE_FIELDS)
	row = next((r for r in node.get(KEY_RESULTS_TABLE) if r.name == kr_id), None)
	if row is None:
		frappe.throw("Key Result tidak ditemukan", frappe.DoesNotExistError)
	for field, value in data.items():
		setattr(row, field, value)
	node.save(ignore_permissions=False)
	return {"id": kr_id}


@frappe.whitelist()
def get_key_result(kr_id: str) -> dict:
	"""Editable scalar fields to hydrate the key result edit dialog."""
	require_login()
	kr_id = max_str(kr_id, 140)
	objective_id = frappe.db.get_value(KEY_RESULT_DOCTYPE, kr_id, "parent")
	if not objective_id:
		frappe.throw("Key Result tidak ditemukan", frappe.DoesNotExistError)
	if not frappe.has_permission(VT_ITEM_DOCTYPE, "read", doc=objective_id):
		raise frappe.PermissionError
	row = frappe.db.get_value(
		KEY_RESULT_DOCTYPE, kr_id,
		["name", *KEY_RESULT_EDITABLE_FIELDS], as_dict=True,
	)
	if not row:
		frappe.throw("Key Result tidak ditemukan", frappe.DoesNotExistError)
	row["objective"] = objective_id
	return row

"""VT Item tree query helpers — read primitives for the unified hierarchy.

P2 foundation. Services consume these instead of querying legacy doctypes
directly: they translate flat legacy relations (VT Task.project,
VT Sprint.project, Key Result.objective, …) into VT Item tree relations
(nested-set descendants, parent-chain walks, child tables).

Layer: pure read-only query utility (no business logic, no writes); reused by
many services, hence a shared module rather than a controller method.

Source of truth:
docs/superpowers/specs/2026-06-07-vt-item-unified-hierarchy-design.html
"""
import frappe

DOCTYPE = "VT Item"


def nodes(node_type, filters=None, fields=None, order_by=None, limit=None):
	"""All VT Item rows of a given node_type (e.g. every Project node)."""
	merged = dict(filters or {})
	merged["node_type"] = node_type
	return frappe.get_all(DOCTYPE, filters=merged, fields=fields or ["name"],
		order_by=order_by, limit=limit)


def children(parent, node_type=None, filters=None, fields=None,
		order_by=None, limit=None):
	"""Direct children of `parent` (parent_vt_item=parent), optionally typed."""
	merged = dict(filters or {})
	merged["parent_vt_item"] = parent
	if node_type:
		merged["node_type"] = node_type
	return frappe.get_all(DOCTYPE, filters=merged, fields=fields or ["name"],
		order_by=order_by, limit=limit)


def descendants(node, node_type=None, filters=None, fields=None, order_by=None):
	"""All descendants of `node` via nested set (lft/rgt within node's range,
	excluding node itself), optionally typed. Spans skipped levels — e.g. a
	Project's Tasks whether or not they sit under a Sprint."""
	bounds = frappe.db.get_value(DOCTYPE, node, ["lft", "rgt"], as_dict=True)
	if not bounds:
		return []
	merged = dict(filters or {})
	merged["lft"] = [">", bounds.lft]
	merged["rgt"] = ["<", bounds.rgt]
	if node_type:
		merged["node_type"] = node_type
	return frappe.get_all(DOCTYPE, filters=merged, fields=fields or ["name"],
		order_by=order_by)


def ancestor_of_type(node, node_type):
	"""Walk the parent chain from `node` to the nearest ancestor whose
	node_type matches. Returns its name, or None."""
	current = frappe.db.get_value(DOCTYPE, node, "parent_vt_item")
	while current:
		row = frappe.db.get_value(
			DOCTYPE, current, ["node_type", "parent_vt_item"], as_dict=True
		)
		if not row:
			return None
		if row.node_type == node_type:
			return current
		current = row.parent_vt_item
	return None


def project_of(node):
	"""Nearest Project ancestor of a Sprint/Task node (or None)."""
	return ancestor_of_type(node, "Project")


def child_table_rows(node, table_fieldname):
	"""Child-table rows of a node as dicts (e.g. 'key_results' on an OKR,
	'kpi_entries' on a KPI)."""
	doc = frappe.get_doc(DOCTYPE, node)
	return [row.as_dict() for row in (doc.get(table_fieldname) or [])]

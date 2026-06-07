"""VT Item KPI Entry — child table of a KPI-type VT Item node.

Layer: Frappe DocType controller (child table). Holds one time-series KPI
measurement (date + value) under a KPI node in the unified VT Item tree.
Standalone OKR's legacy `KPI Entry` doctype is left untouched (additive P1);
this is the tree's own child table.

Source of truth:
docs/superpowers/specs/2026-06-07-vt-item-unified-hierarchy-design.html
"""
from frappe.model.document import Document


class VTItemKPIEntry(Document):
	"""One KPI measurement row under a KPI VT Item node."""

	pass

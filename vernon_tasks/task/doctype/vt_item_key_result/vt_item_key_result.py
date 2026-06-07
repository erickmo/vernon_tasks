"""VT Item Key Result — child table of an OKR-type VT Item node.

Layer: Frappe DocType controller (child table). Holds a single Key Result
measurement (metric + target/current + confidence) under an OKR node in the
unified VT Item tree. Standalone OKR's legacy `Key Result` doctype is left
untouched (additive P1); this is the tree's own child table.

Source of truth:
docs/superpowers/specs/2026-06-07-vt-item-unified-hierarchy-design.html
"""
from frappe.model.document import Document


class VTItemKeyResult(Document):
	"""One Key Result row under an OKR VT Item node."""

	pass

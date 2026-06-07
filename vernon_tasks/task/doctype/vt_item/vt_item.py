"""VT Item controller — unified OKR→Task hierarchy.

Layer: Frappe DocType controller (Layer 2, Priority 1 per vernon-dev
Frappe Hooks-First rule). One nested-set tree discriminated by
`node_type`; owns naming, parent-type invariants, brand inheritance,
and percent_done rollup.

Source of truth:
docs/superpowers/specs/2026-06-07-vt-item-unified-hierarchy-design.html
"""
import frappe
from frappe import _
from frappe.model.naming import make_autoname
from frappe.utils.nestedset import NestedSet

# Per-type naming series. Single source for the `autoname()` switch.
NODE_NAMING = {
	"OKR": "OKR-.YYYY.-.#####",
	"KPI": "KPI-.YYYY.-.#####",
	"Project": "PROJ-.YYYY.-.#####",
	"Sprint": "SP-.YYYY.-.#####",
	"Task": "TASK-.YYYY.-.#####",
}

# Legal parent node_type per child node_type. `None` = may sit at root.
# Encodes "strict + flexible skips" (spec §4): OKR/Project may be roots,
# KPI may be root or under OKR, Task may skip Sprint (backlog).
ALLOWED_PARENTS = {
	"OKR": {None},
	"KPI": {None, "OKR"},
	"Project": {None, "OKR"},
	"Sprint": {"Project"},
	"Task": {"Project", "Sprint"},
}


class VTItem(NestedSet):
	"""Single node in the OKR→Task tree, typed by `node_type`."""

	# NestedSet maintains lft/rgt against this parent Link field.
	nsm_parent_field = "parent_vt_item"

	def autoname(self) -> None:
		"""Name by type-specific series (spec §3.3)."""
		series = NODE_NAMING.get(self.node_type)
		if not series:
			frappe.throw(_("Unknown node_type: {0}").format(self.node_type))
		self.name = make_autoname(series, doc=self)

	def validate(self) -> None:
		"""Field + tree invariants on every save."""
		self._validate_parent_type()
		self._inherit_brand()

	def _validate_parent_type(self) -> None:
		"""Reject illegal parent node_type per ALLOWED_PARENTS (spec §4)."""
		parent_type = None
		if self.parent_vt_item:
			parent_type = frappe.db.get_value(
				"VT Item", self.parent_vt_item, "node_type"
			)
		allowed = ALLOWED_PARENTS.get(self.node_type, set())
		if parent_type not in allowed:
			frappe.throw(
				_("A {0} cannot be placed under a {1}.").format(
					self.node_type, parent_type or _("root")
				)
			)

	def _inherit_brand(self) -> None:
		"""Brand inheritance — implemented in the next task."""
		return

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
from frappe.utils import today
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

# Task lifecycle (pdca_phase) → board column (kanban_status). Mirrors the
# legacy VT Task state machine; the unified terminal phase is CLOSED (shared
# with OKR/Project) and maps to the "Done" board column.
PDCA_KANBAN_MAP = {
	"BACKLOG": "Backlog",
	"PLAN": "Scheduled",
	"DO": "In Progress",
	"CHECK": "In Review",
	"ACT": "Revision",
	"CLOSED": "Done",
}
# Orthogonal flag: overrides the PDCA-derived column when set directly.
KANBAN_BLOCKED = "Blocked"

# Legal PDCA transitions for Task nodes (Deming cycle). Terminal = CLOSED.
# Ported from the legacy VT Task state machine (DONE → CLOSED). New nodes
# (is_new) may start at any phase; only changes on an existing node are gated.
VALID_PDCA_TRANSITIONS = {
	"BACKLOG": ["PLAN"],
	"PLAN": ["DO"],
	"DO": ["CHECK"],
	"CHECK": ["ACT", "CLOSED", "DO"],
	"ACT": ["DO"],
	"CLOSED": [],
}

# Legacy VT Task field defaults — applied to Task nodes so direct creates and
# test seeds need not specify them.
TASK_DEFAULT_PHASE = "BACKLOG"
TASK_DEFAULT_WEIGHT = 1


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
		self._apply_task_defaults()
		self._validate_parent_type()
		self._inherit_brand()
		self._sync_is_group()
		self._validate_task_fields()
		self._validate_pdca_transition()
		self._sync_kanban_status()
		self._stamp_completion()

	def _apply_task_defaults(self) -> None:
		"""Seed Task lifecycle defaults (legacy VT Task field defaults) so direct
		creates / test seeds need not specify them. Task-scoped — OKR/Project
		nodes keep their own pdca terminal CLOSED and have no weight."""
		if self.node_type != "Task":
			return
		if not self.pdca_phase:
			self.pdca_phase = TASK_DEFAULT_PHASE
		if not self.weight:
			self.weight = TASK_DEFAULT_WEIGHT

	def _validate_task_fields(self) -> None:
		"""Task numeric + governance invariants (ported from VT Task)."""
		if self.node_type != "Task":
			return
		if (self.weight or 0) <= 0:
			frappe.throw(_("Weight harus lebih besar dari 0"))
		for fieldname in ("estimated_minutes", "actual_minutes", "review_estimated_minutes"):
			value = getattr(self, fieldname, None)
			if value is not None and value < 0:
				frappe.throw(_("{0} tidak boleh negatif").format(fieldname))
		if self.leader_override_points and not (self.override_reason or "").strip():
			frappe.throw(_("Override Reason wajib diisi jika Leader Override Points diatur"))
		if self.is_recurring and not self.recurring_rule:
			frappe.throw(_("Recurring Rule wajib diisi saat Is Recurring aktif"))

	def _validate_pdca_transition(self) -> None:
		"""Reject illegal PDCA moves on an existing Task's phase change."""
		if self.node_type != "Task" or self.is_new():
			return
		old_phase = frappe.db.get_value("VT Item", self.name, "pdca_phase")
		if not old_phase or old_phase == self.pdca_phase:
			return
		allowed = VALID_PDCA_TRANSITIONS.get(old_phase, [])
		if self.pdca_phase not in allowed:
			frappe.throw(
				_("Transisi PDCA tidak valid: {0} → {1}. Yang diperbolehkan: {2}").format(
					old_phase, self.pdca_phase, ", ".join(allowed) or _("(tidak ada)")
				)
			)

	def _stamp_completion(self) -> None:
		"""Stamp completion_date when a Task reaches CLOSED. VT Item is not
		submittable, so this replaces the legacy on_submit stamping."""
		if (
			self.node_type == "Task"
			and self.pdca_phase == "CLOSED"
			and not self.completion_date
		):
			self.completion_date = today()

	def _sync_kanban_status(self) -> None:
		"""Derive a Task node's board column from its pdca_phase (legacy VT Task
		behavior). `Blocked` is orthogonal — set directly, never overwritten."""
		if self.node_type != "Task" or self.kanban_status == KANBAN_BLOCKED:
			return
		mapped = PDCA_KANBAN_MAP.get(self.pdca_phase)
		if mapped:
			self.kanban_status = mapped

	def _sync_is_group(self) -> None:
		"""A node with children must be a group (NestedSet rejects a leaf that
		has children). Auto-promote so callers/pages need not manage the flag
		when editing a parent that already has descendants."""
		if not self.is_group and self.name and frappe.db.exists(
			"VT Item", {"parent_vt_item": self.name}
		):
			self.is_group = 1

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
		"""Fill blank `brand` from the nearest ancestor that has one (spec §4)."""
		if self.brand or not self.parent_vt_item:
			return
		ancestor = self.parent_vt_item
		# Walk up the parent chain; first non-empty brand wins.
		while ancestor:
			brand, parent = frappe.db.get_value(
				"VT Item", ancestor, ["brand", "parent_vt_item"]
			) or (None, None)
			if brand:
				self.brand = brand
				return
			ancestor = parent

	def on_update(self) -> None:
		"""Maintain nested set, then roll percent_done up the chain."""
		super().on_update()  # NestedSet keeps lft/rgt consistent
		self._rollup_ancestors()

	def _rollup_ancestors(self) -> None:
		"""Set each ancestor's percent_done to the mean of its direct
		children (spec §5). Uses set_value (no save) to avoid recursion."""
		ancestor = self.parent_vt_item
		while ancestor:
			children = frappe.get_all(
				"VT Item",
				filters={"parent_vt_item": ancestor},
				pluck="percent_done",
			)
			avg = round(sum(children) / len(children), 2) if children else 0
			frappe.db.set_value(
				"VT Item", ancestor, "percent_done", avg, update_modified=False
			)
			ancestor = frappe.db.get_value(
				"VT Item", ancestor, "parent_vt_item"
			)

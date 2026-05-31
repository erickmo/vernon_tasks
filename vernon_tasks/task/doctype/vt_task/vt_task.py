"""VT Task controller — Task domain.

Layer: Frappe DocType controller (Layer 2, Priority 1 per vernon-dev
Frappe Hooks-First rule). Owns the task lifecycle, PDCA↔Kanban sync,
scheduling guards, and on_submit completion logic.

Source of truth: docs/domains/task/README.html.
ADR-022 — REST-first, hooks-for-logic.
"""
import re

import frappe
from frappe.model.document import Document
from frappe.utils import getdate, today

# --- PDCA / Kanban state machine -----------------------------------------
# Mirrors the column layout on the board. `Blocked` is an orthogonal flag
# that overrides PDCA-driven kanban_status (see _sync_kanban_status).
PDCA_KANBAN_MAP = {
	"BACKLOG": "Backlog",
	"PLAN": "Scheduled",
	"DO": "In Progress",
	"CHECK": "In Review",
	"ACT": "Revision",
	"DONE": "Done",
}

# Allowed PDCA transitions. Multiple outbound edges encode the Deming
# cycle's branch points (CHECK → ACT / DONE / DO; ACT → DO). DONE is
# terminal — re-opening requires an explicit reset, not auto-flow.
VALID_PDCA_TRANSITIONS = {
	"BACKLOG": ["PLAN"],
	"PLAN": ["DO"],
	"DO": ["CHECK"],
	"CHECK": ["ACT", "DONE", "DO"],
	"ACT": ["DO"],
	"DONE": [],
}

KANBAN_BLOCKED = "Blocked"

# Reverse of PDCA_KANBAN_MAP — column label → PDCA phase. Derived (never
# hand-edited) so a phase rename propagates to the board automatically.
KANBAN_PDCA_MAP = {v: k for k, v in PDCA_KANBAN_MAP.items()}

# Ordered board columns: the six PDCA-derived columns plus the orthogonal
# Blocked column. Single source of truth for the project board layout.
BOARD_COLUMNS = tuple(PDCA_KANBAN_MAP.values()) + (KANBAN_BLOCKED,)

# --- Validation caps ------------------------------------------------------
TASK_TITLE_MAX_LEN = 200
_WHITESPACE_RUN = re.compile(r"\s+")


def _normalize_title(raw: str | None) -> str:
	"""Trim + collapse whitespace runs to a single space."""
	if not raw:
		return ""
	return _WHITESPACE_RUN.sub(" ", raw).strip()


class VTTask(Document):
	"""Single unit of work, scoped by Project (and optionally Sprint)."""

	def validate(self) -> None:
		"""Run all field-level + cross-field invariants on every save.

		Child-table rows (schedule_entries, dependencies) are validated via
		`_validate_children` — Frappe does not auto-call `validate()` on
		child controllers, so we explicitly invoke them here.
		"""
		self._validate_title()
		self._validate_dates()
		self._validate_numbers()
		self._validate_override()
		self._validate_pdca_transition()
		self._sync_kanban_status()
		self._validate_recurring()
		self._validate_dependencies()
		self._validate_children()

	def _validate_children(self) -> None:
		"""Invoke validate() on each child row so their controller hooks fire."""
		for row in (self.schedule_entries or []):
			row.run_method("validate")
		for row in (self.dependencies or []):
			row.run_method("validate")

	def _validate_title(self) -> None:
		"""Normalize title + enforce length cap."""
		self.title = _normalize_title(self.title)
		if not self.title:
			frappe.throw("Judul task wajib diisi", frappe.MandatoryError)
		if len(self.title) > TASK_TITLE_MAX_LEN:
			frappe.throw(
				f"Judul task maksimal {TASK_TITLE_MAX_LEN} karakter",
				frappe.ValidationError,
			)

	def _validate_dates(self) -> None:
		"""Deadline must be strictly after start_date when both set.

		Strict `>` (not `>=`) because a same-day task is more naturally
		modelled with start_date == deadline being a missing deadline.
		"""
		if self.start_date and self.deadline:
			if getdate(self.deadline) <= getdate(self.start_date):
				frappe.throw(
					"Deadline harus setelah Start Date",
					frappe.ValidationError,
				)

	def _validate_numbers(self) -> None:
		"""weight > 0; estimated/actual minutes >= 0; review_estimated_minutes >= 0."""
		if (self.weight or 0) <= 0:
			frappe.throw(
				"Weight harus lebih besar dari 0",
				frappe.ValidationError,
			)
		for fieldname, label in (
			("estimated_minutes", "Estimated Minutes"),
			("actual_minutes", "Actual Minutes"),
			("review_estimated_minutes", "Review Estimate"),
		):
			value = getattr(self, fieldname, None)
			if value is not None and value < 0:
				frappe.throw(
					f"{label} tidak boleh negatif",
					frappe.ValidationError,
				)

	def _validate_override(self) -> None:
		"""When leader_override_points is set, override_reason is required.

		Audit-trail requirement — a points override without a reason is a
		governance smell.
		"""
		if self.leader_override_points and not (self.override_reason or "").strip():
			frappe.throw(
				"Override Reason wajib diisi jika Leader Override Points diatur",
				frappe.ValidationError,
			)

	def _validate_pdca_transition(self) -> None:
		"""Reject illegal PDCA moves (Deming cycle)."""
		if self.is_new():
			return
		old_phase = frappe.db.get_value("VT Task", self.name, "pdca_phase")
		if old_phase == self.pdca_phase:
			return
		allowed = VALID_PDCA_TRANSITIONS.get(old_phase, [])
		if self.pdca_phase not in allowed:
			frappe.throw(
				f"Transisi PDCA tidak valid: {old_phase} → {self.pdca_phase}. "
				f"Yang diperbolehkan: {', '.join(allowed) or '(tidak ada)'}",
				frappe.ValidationError,
			)

	def _sync_kanban_status(self) -> None:
		"""Mirror pdca_phase to kanban_status unless manually flagged Blocked.

		`Blocked` is an orthogonal escalation flag (a task can be Blocked
		while logically in DO). We never auto-clear it; the user has to
		un-block explicitly.
		"""
		if self.kanban_status == KANBAN_BLOCKED:
			return
		self.kanban_status = PDCA_KANBAN_MAP.get(self.pdca_phase, self.kanban_status)

	def _validate_recurring(self) -> None:
		"""When is_recurring is on, recurring_rule must be linked."""
		if self.is_recurring and not self.recurring_rule:
			frappe.throw(
				"Recurring Rule wajib diisi saat Is Recurring aktif",
				frappe.ValidationError,
			)

	def _validate_dependencies(self) -> None:
		"""Reject self-blocking dependencies (would deadlock).

		Full cycle detection across the dependency graph happens in the
		`Task Dependency` controller — too expensive to run on every task
		save here.
		"""
		for dep in (self.dependencies or []):
			if dep.blocked_by == self.name:
				frappe.throw(
					"Task tidak boleh memblokir dirinya sendiri",
					frappe.ValidationError,
				)

	def on_submit(self) -> None:
		"""When submitted in DONE phase, stamp completion_date.

		`db_set` avoids re-triggering validate() while writing the same
		field back to the row.
		"""
		if self.pdca_phase == "DONE":
			self.completion_date = today()
			self.db_set("completion_date", self.completion_date)


def validate_permissions(doc, method):
	"""Hook stub — wired in hooks.py for future per-doctype permission rules."""
	return None


def get_blocked_tasks_for_user(user: str) -> list:
	"""Return open tasks assigned to `user` that are still blocked by another task.

	Used by the dashboard "Blocked by you" widget. Excludes DONE tasks on
	both sides so completed blockers don't keep dragging tasks into the list.
	"""
	return frappe.db.sql("""
		SELECT DISTINCT t.name, t.title, t.project, t.deadline, td.blocked_by
		FROM `tabVT Task` t
		INNER JOIN `tabTask Dependency` td ON td.parent = t.name
		WHERE t.assigned_to = %(user)s
		  AND t.pdca_phase NOT IN ('DONE')
		  AND EXISTS (
			SELECT 1 FROM `tabVT Task` bt
			WHERE bt.name = td.blocked_by AND bt.pdca_phase != 'DONE'
		  )
	""", {"user": user}, as_dict=True)


def get_tasks_for_user_today(user: str) -> list:
	"""Return today's scheduled tasks for `user`, sorted by priority + deadline.

	Joins `tabTask Schedule Entry` to surface only tasks the user actually
	committed time to today (not just everything assigned).
	"""
	return frappe.db.sql("""
		SELECT t.name, t.title, t.project, t.priority, t.deadline,
			   t.pdca_phase, t.kanban_status, se.allocated_minutes
		FROM `tabVT Task` t
		INNER JOIN `tabTask Schedule Entry` se ON se.parent = t.name
		WHERE t.assigned_to = %(user)s
		  AND se.date = %(date)s
		  AND t.pdca_phase NOT IN ('DONE')
		ORDER BY t.priority DESC, t.deadline ASC
	""", {"user": user, "date": today()}, as_dict=True)

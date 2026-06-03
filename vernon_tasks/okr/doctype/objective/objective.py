"""Objective controller — OKR domain.

Layer: Frappe DocType controller (Layer 2, Priority 1 per vernon-dev
Frappe Hooks-First rule). Owns Objective lifecycle + the
`get_objective_progress` aggregate helper used by Health Score.

Cross-domain rules:
  - `brand` is required and must exist in VT Brand.
  - When a VT Project references an Objective, project.brand must equal
    objective.brand (enforced on the project side in vt_project.validate).
  - Deleting an Objective is blocked while Key Results or KPI Definitions
    still link to it.

Source of truth: docs/domains/okr/README.html (Hierarchy + ADR-007).
ADR-022 — REST-first, hooks-for-logic: business rules in controller so
standard REST endpoints enforce them automatically.
"""
import calendar
import datetime
import re

import frappe
from frappe.model.document import Document
from frappe.utils import getdate

# --- Validation caps ------------------------------------------------------
OBJECTIVE_TITLE_MAX_LEN = 140
_WHITESPACE_RUN = re.compile(r"\s+")

# --- Period parsing -------------------------------------------------------
# Accepted period grammars:
#   YYYY              → full calendar year       (Jan 1 .. Dec 31)
#   YYYY-Hn  n∈{1,2}  → half year                (H1: Jan-Jun, H2: Jul-Dec)
#   YYYY-Qn  n∈{1..4} → quarter                  (Q1: Jan-Mar, …, Q4: Oct-Dec)
#   YYYY-MM  MM∈01-12 → calendar month
_PERIOD_YEAR = re.compile(r"^(\d{4})$")
_PERIOD_HALF = re.compile(r"^(\d{4})-H([12])$")
_PERIOD_QUARTER = re.compile(r"^(\d{4})-Q([1-4])$")
_PERIOD_MONTH = re.compile(r"^(\d{4})-(0[1-9]|1[0-2])$")

# --- PDCA state machine ---------------------------------------------------
# Allowed transitions (Deming cycle, with `ACT` loop-back). `CLOSED` is the
# terminal state — once reached, no outbound transitions are allowed.
VALID_PDCA_TRANSITIONS = {
	"PLAN": ["DO"],
	"DO": ["CHECK"],
	"CHECK": ["ACT", "CLOSED"],
	"ACT": ["PLAN", "DO"],
	"CLOSED": [],
}
PDCA_TERMINAL = "CLOSED"
STATUS_CLOSED = "Closed"

# --- Linked doctypes (for on_trash cascade guard) -------------------------
LINKED_DOCTYPES = (
	("Key Result", "objective"),
	("KPI Definition", "objective"),
)


def _normalize_title(raw: str | None) -> str:
	"""Trim + collapse whitespace runs to a single space."""
	if not raw:
		return ""
	return _WHITESPACE_RUN.sub(" ", raw).strip()


def _derive_period_range(period: str) -> tuple[datetime.date, datetime.date] | None:
	"""Parse a period string into (start_date, end_date), or None if unknown.

	Returns the inclusive [start, end] calendar range that the period covers.
	"""
	if m := _PERIOD_YEAR.match(period):
		year = int(m.group(1))
		return datetime.date(year, 1, 1), datetime.date(year, 12, 31)

	if m := _PERIOD_HALF.match(period):
		year, half = int(m.group(1)), int(m.group(2))
		if half == 1:
			return datetime.date(year, 1, 1), datetime.date(year, 6, 30)
		return datetime.date(year, 7, 1), datetime.date(year, 12, 31)

	if m := _PERIOD_QUARTER.match(period):
		year, q = int(m.group(1)), int(m.group(2))
		start_month = (q - 1) * 3 + 1
		end_month = start_month + 2
		last_day = calendar.monthrange(year, end_month)[1]
		return datetime.date(year, start_month, 1), datetime.date(year, end_month, last_day)

	if m := _PERIOD_MONTH.match(period):
		year, month = int(m.group(1)), int(m.group(2))
		last_day = calendar.monthrange(year, month)[1]
		return datetime.date(year, month, 1), datetime.date(year, month, last_day)

	return None


class Objective(Document):
	"""OKR Objective — top-level container scoped by Brand + Period."""

	def validate(self) -> None:
		"""Enforce title + period + PDCA invariants on every save."""
		self._validate_title()
		self._validate_period_and_auto_fill()
		self._validate_period_range()
		self._validate_period_within_derived()
		self._validate_owner_enabled()
		self._validate_pdca_transition()
		self._sync_status_with_pdca()

	def _validate_title(self) -> None:
		"""Normalize title + enforce length cap. Rejects empty (reqd back-stop)."""
		self.title = _normalize_title(self.title)
		if not self.title:
			frappe.throw("Judul objective wajib diisi", frappe.MandatoryError)
		if len(self.title) > OBJECTIVE_TITLE_MAX_LEN:
			frappe.throw(
				f"Judul objective maksimal {OBJECTIVE_TITLE_MAX_LEN} karakter",
				frappe.ValidationError,
			)

	def _validate_period_and_auto_fill(self) -> None:
		"""Validate period grammar; auto-fill period_start/end when blank.

		Caller-provided dates are respected (overrides). We only fill blanks
		so a planner can intentionally pick a partial range inside a quarter.
		"""
		if not self.period:
			frappe.throw("Periode wajib diisi", frappe.MandatoryError)
		derived = _derive_period_range(self.period)
		if derived is None:
			frappe.throw(
				f"Format periode tidak valid: '{self.period}'. "
				"Gunakan YYYY, YYYY-Hn, YYYY-Qn, atau YYYY-MM",
				frappe.ValidationError,
			)
		auto_start, auto_end = derived
		# Only fill when the user left the field blank — never overwrite
		# explicit input (the planner may want a custom sub-range).
		if not self.period_start:
			self.period_start = auto_start
		if not self.period_end:
			self.period_end = auto_end

	def _validate_period_range(self) -> None:
		"""period_end must be ≥ period_start."""
		if self.period_start and self.period_end and self.period_end < self.period_start:
			frappe.throw(
				"Tanggal akhir periode tidak boleh sebelum tanggal mulai",
				frappe.ValidationError,
			)

	def _validate_period_within_derived(self) -> None:
		"""Caller-overridden period_start/period_end must stay inside the
		range derived from the `period` string.

		Why: the planner UI allows overriding the auto-filled dates to model
		a partial sub-range (e.g. Q2 objective that runs Apr 15 – May 10).
		Without this guard, the override can silently exit the declared
		period (e.g. period=2026-Q2, period_start=2026-01-01), corrupting
		any downstream rollup that joins by `period`.
		"""
		derived = _derive_period_range(self.period) if self.period else None
		if derived is None:
			return
		derived_start, derived_end = derived
		if self.period_start and getdate(self.period_start) < derived_start:
			frappe.throw(
				f"period_start ({self.period_start}) lebih awal dari awal "
				f"periode terderivasi '{self.period}' ({derived_start})",
				frappe.ValidationError,
			)
		if self.period_end and getdate(self.period_end) > derived_end:
			frappe.throw(
				f"period_end ({self.period_end}) melewati akhir periode "
				f"terderivasi '{self.period}' ({derived_end})",
				frappe.ValidationError,
			)

	def _validate_owner_enabled(self) -> None:
		"""Reject objective_owner who is a disabled User.

		Why: a disabled owner cannot receive notifications or approve
		PDCA transitions. Frappe's Link field only enforces existence,
		not active status.
		"""
		if not self.objective_owner:
			return
		enabled = frappe.db.get_value("User", self.objective_owner, "enabled")
		if not enabled:
			frappe.throw(
				f"Objective owner '{self.objective_owner}' adalah user "
				"non-aktif. Pilih user yang enabled.",
				frappe.ValidationError,
			)

	def _validate_pdca_transition(self) -> None:
		"""Reject illegal PDCA moves (Deming cycle); allow no-op."""
		if self.is_new():
			return
		old_phase = frappe.db.get_value("Objective", self.name, "pdca_phase")
		if old_phase == self.pdca_phase:
			# No transition → nothing to validate.
			return
		allowed = VALID_PDCA_TRANSITIONS.get(old_phase, [])
		if self.pdca_phase not in allowed:
			frappe.throw(
				f"Transisi PDCA tidak valid: {old_phase} → {self.pdca_phase}. "
				f"Yang diperbolehkan: {', '.join(allowed) or '(tidak ada)'}",
				frappe.ValidationError,
			)

	def _sync_status_with_pdca(self) -> None:
		"""When PDCA reaches CLOSED, force status to Closed for dashboard consistency.

		Reverse is NOT auto-synced: re-opening an objective should be an
		explicit PDCA action (ACT → PLAN), not a status edit.
		"""
		if self.pdca_phase == PDCA_TERMINAL:
			self.status = STATUS_CLOSED

	def on_trash(self) -> None:
		"""Block delete when Key Results or KPI Definitions still link here.

		Source of truth: docs/domains/okr/README.html (Hierarchy). Removing
		an Objective with dangling children would orphan rollup data on
		Health Score and the dashboards.
		"""
		blockers: list[str] = []
		for doctype, fk in LINKED_DOCTYPES:
			count = frappe.db.count(doctype, {fk: self.name})
			if count:
				blockers.append(f"{count} {doctype}")
		if blockers:
			frappe.throw(
				"Objective masih dipakai oleh: " + ", ".join(blockers)
				+ ". Hapus / pindahkan dulu sebelum menghapus objective.",
				frappe.ValidationError,
			)


def aggregate_kr_progress(pairs: list[tuple[float, float]]) -> float:
	"""Mean of `min(current/target, 1.0) * 100` over pairs with target > 0, 2dp.

	Canonical OKR progress scalar. Callers pass pre-loaded (current, target)
	pairs so read paths can batch their Key Result query (avoids N+1):
	  - get_objective_progress() — single-objective rollup (Health Score)
	  - vernon_tasks.brand.api.brand_okr — brand-detail page (batched)

	Clamping the ratio at 1.0 means over-performance does not pull the mean
	above 100%. Rounds once at the end (no double-rounding).

	Returns:
		Float in [0.0, 100.0]. 0.0 when no pair has a positive target.
	"""
	# Only well-formed rows (positive target) count toward the mean denominator.
	valid = [(c, t) for (c, t) in pairs if t and t > 0]
	if not valid:
		return 0.0
	total = sum(min((c or 0) / t, 1.0) for (c, t) in valid)
	return round((total / len(valid)) * 100, 2)


def get_objective_progress(objective_name: str) -> float:
	"""Aggregate progress for an Objective across its Key Results.

	Delegates to aggregate_kr_progress (the canonical formula).

	Args:
		objective_name: Frappe `name` of the parent Objective.

	Returns:
		Float in [0.0, 100.0]. Returns 0.0 when the Objective has no Key
		Results (so dashboards do not divide by zero).
	"""
	key_results = frappe.get_all(
		"Key Result",
		filters={"objective": objective_name},
		fields=["target_value", "current_value"],
	)
	return aggregate_kr_progress([(kr.current_value, kr.target_value) for kr in key_results])

"""Task Point Log controller — append-only audit ledger for VT Task points.

Each row records one point transaction (earned, bonus, penalty, deduction,
or override). Validations enforce:

  - Sign of `amount` matches the transaction_type semantics
    (penalties/deductions are negative; earned/bonus are positive;
     overrides can be either, but must include note + overridden_by).
  - `log_timestamp` is never in the future.
  - Rows are immutable once inserted (any UPDATE rejected).

Source of truth: docs/domains/task/README.html (Scoring section).
"""
from datetime import datetime

import frappe
from frappe.model.document import Document
from frappe.utils import get_datetime

# --- Transaction taxonomy ------------------------------------------------
POSITIVE_TYPES = ("earned", "early_bonus")
NEGATIVE_TYPES = ("late_penalty", "revision_deduction")
EITHER_TYPES = ("leader_override",)
ALLOWED_TYPES = POSITIVE_TYPES + NEGATIVE_TYPES + EITHER_TYPES


class TaskPointLog(Document):
	"""One ledger row — point change for a (task, user) pair."""

	def validate(self) -> None:
		self._validate_type()
		self._validate_amount_sign()
		self._validate_timestamp_not_future()
		self._validate_override_audit()
		self._validate_immutable()

	def _validate_type(self) -> None:
		"""transaction_type must be one of the known kinds."""
		if self.transaction_type not in ALLOWED_TYPES:
			frappe.throw(
				f"Transaction Type tidak valid: '{self.transaction_type}'",
				frappe.ValidationError,
			)

	def _validate_amount_sign(self) -> None:
		"""Sign rule: earned/bonus > 0, penalty/deduction < 0, override either.

		`amount == 0` is rejected for everything except override — a zero-point
		log row is noise.
		"""
		amount = self.amount or 0
		if self.transaction_type in POSITIVE_TYPES and amount <= 0:
			frappe.throw(
				f"Amount untuk '{self.transaction_type}' harus positif",
				frappe.ValidationError,
			)
		if self.transaction_type in NEGATIVE_TYPES and amount >= 0:
			frappe.throw(
				f"Amount untuk '{self.transaction_type}' harus negatif",
				frappe.ValidationError,
			)
		# leader_override allows either sign but not zero.
		if self.transaction_type in EITHER_TYPES and amount == 0:
			frappe.throw(
				"Amount untuk 'leader_override' tidak boleh nol",
				frappe.ValidationError,
			)

	def _validate_timestamp_not_future(self) -> None:
		"""log_timestamp must be at or before "now" — entries are historical."""
		if not self.log_timestamp:
			return
		ts = get_datetime(self.log_timestamp)
		if ts > datetime.now():
			frappe.throw(
				"Log Timestamp tidak boleh di masa depan",
				frappe.ValidationError,
			)

	def _validate_override_audit(self) -> None:
		"""leader_override rows require an audit trail: overridden_by + note."""
		if self.transaction_type != "leader_override":
			return
		if not self.overridden_by:
			frappe.throw(
				"Overridden By wajib diisi untuk 'leader_override'",
				frappe.ValidationError,
			)
		if not (self.note or "").strip():
			frappe.throw(
				"Note wajib diisi untuk 'leader_override'",
				frappe.ValidationError,
			)

	def _validate_immutable(self) -> None:
		"""Reject updates to existing rows — this is an append-only ledger.

		Compares the in-memory document against the persisted row. If any
		business field changed, refuse.
		"""
		if self.is_new():
			return
		old = frappe.db.get_value(
			"Task Point Log",
			self.name,
			["task", "user", "transaction_type", "amount", "log_timestamp"],
			as_dict=True,
		)
		if not old:
			# Should not happen — Frappe wouldn't dispatch validate without a row.
			return
		changed = (
			old.task != self.task
			or old.user != self.user
			or old.transaction_type != self.transaction_type
			or float(old.amount or 0) != float(self.amount or 0)
			or get_datetime(old.log_timestamp) != get_datetime(self.log_timestamp)
		)
		if changed:
			frappe.throw(
				"Task Point Log bersifat append-only; baris tidak dapat diubah",
				frappe.ValidationError,
			)

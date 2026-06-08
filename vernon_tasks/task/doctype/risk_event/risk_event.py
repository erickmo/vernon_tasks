"""Risk Event controller — surfaces project / task risks for the dashboard.

A Risk Event is produced by the risk_evaluator job (or manually) when a
project / task crosses a threshold (overdue, no check-in, health drop).
Validations here keep the table queryable and the timeline coherent.

Source of truth: docs/domains/task/README.html (Risk + Health Score).
"""
import re

import frappe
from frappe.model.document import Document
from frappe.utils import get_datetime

ALLOWED_SEVERITY = ("high", "med", "low")
REASON_MAX_LEN = 140
_WHITESPACE_RUN = re.compile(r"\s+")


def _normalize_reason(raw: str | None) -> str:
	"""Trim + collapse whitespace runs (keeps grouped queries clean)."""
	if not raw:
		return ""
	return _WHITESPACE_RUN.sub(" ", raw).strip()


class RiskEvent(Document):
	"""One detected risk for a project (optionally tied to a task)."""

	def validate(self) -> None:
		self._validate_reason()
		self._validate_severity()
		self._validate_timeline()
		self._validate_task_belongs_to_project()

	def _validate_reason(self) -> None:
		"""Normalize + cap reason — used as a group-by key in dashboards."""
		self.reason = _normalize_reason(self.reason)
		if not self.reason:
			frappe.throw("Reason wajib diisi", frappe.MandatoryError)
		if len(self.reason) > REASON_MAX_LEN:
			frappe.throw(
				f"Reason maksimal {REASON_MAX_LEN} karakter",
				frappe.ValidationError,
			)

	def _validate_severity(self) -> None:
		"""severity must be one of high / med / low."""
		if self.severity not in ALLOWED_SEVERITY:
			frappe.throw(
				f"Severity tidak valid: '{self.severity}'. "
				f"Pilih salah satu: {', '.join(ALLOWED_SEVERITY)}",
				frappe.ValidationError,
			)

	def _validate_timeline(self) -> None:
		"""resolved_at must be ≥ detected_at when both are set.

		A risk can't be marked resolved before it was detected — that's a
		clock skew or a data-entry error.
		"""
		if self.detected_at and self.resolved_at:
			if get_datetime(self.resolved_at) < get_datetime(self.detected_at):
				frappe.throw(
					"Resolved At tidak boleh sebelum Detected At",
					frappe.ValidationError,
				)

	def _validate_task_belongs_to_project(self) -> None:
		"""If `task` is set, it must belong to `project` (prevent cross-project leak)."""
		if not (self.task and self.project):
			return
		# A task's project is its nearest Project ancestor in the VT Item tree.
		from vernon_tasks.task.services import vt_item_tree as tree
		task_project = tree.project_of(self.task)
		if task_project and task_project != self.project:
			frappe.throw(
				f"Task '{self.task}' bukan milik project '{self.project}'",
				frappe.ValidationError,
			)

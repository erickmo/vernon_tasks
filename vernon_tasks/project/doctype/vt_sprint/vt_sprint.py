"""VT Sprint controller — Project domain.

Layer: Frappe DocType controller (Layer 2, Priority 1).

A Sprint is a time-boxed slice of a Project. Validations keep its date
range inside the parent project's range and enforce a forward-only
status flow.

Source of truth: docs/domains/project/README.html.
"""
import re

import frappe
from frappe.model.document import Document
from frappe.utils import getdate

# --- Validation caps ------------------------------------------------------
SPRINT_TITLE_MAX_LEN = 140
_WHITESPACE_RUN = re.compile(r"\s+")

# --- Status state machine (forward-only) ---------------------------------
# Sprint lifecycle: Planning → Active → Review → Closed. Reverse moves are
# rejected — a sprint that's been reviewed shouldn't go "back to planning".
VALID_STATUS_TRANSITIONS = {
	"Planning": ["Active"],
	"Active": ["Review"],
	"Review": ["Closed"],
	"Closed": [],
}


def _normalize_title(raw: str | None) -> str:
	"""Trim + collapse whitespace runs."""
	if not raw:
		return ""
	return _WHITESPACE_RUN.sub(" ", raw).strip()


class VTSprint(Document):
	"""Time-boxed slice of a VT Project."""

	def validate(self) -> None:
		self._validate_title()
		self._validate_dates()
		self._validate_status_transition()
		self._validate_tasks_belong_to_project()

	def _validate_title(self) -> None:
		"""Normalize + cap sprint_title."""
		self.sprint_title = _normalize_title(self.sprint_title)
		if not self.sprint_title:
			frappe.throw("Judul sprint wajib diisi", frappe.MandatoryError)
		if len(self.sprint_title) > SPRINT_TITLE_MAX_LEN:
			frappe.throw(
				f"Judul sprint maksimal {SPRINT_TITLE_MAX_LEN} karakter",
				frappe.ValidationError,
			)

	def _validate_dates(self) -> None:
		"""end_date > start_date, and the range fits inside the project's range."""
		start = getdate(self.start_date)
		end = getdate(self.end_date)
		if end <= start:
			frappe.throw(
				"Sprint End Date harus setelah Start Date",
				frappe.ValidationError,
			)
		proj_dates = frappe.db.get_value(
			"VT Project", self.project, ["start_date", "end_date"]
		)
		if not proj_dates:
			# project FK is reqd at JSON level; this is a safety guard.
			return
		proj_start = getdate(proj_dates[0])
		proj_end = getdate(proj_dates[1])
		if start < proj_start or end > proj_end:
			frappe.throw(
				f"Tanggal sprint harus dalam rentang project ({proj_start} sd {proj_end})",
				frappe.ValidationError,
			)

	def _validate_status_transition(self) -> None:
		"""Status flow is forward-only (Planning → Active → Review → Closed)."""
		if self.is_new():
			return
		old_status = frappe.db.get_value("VT Sprint", self.name, "status")
		if old_status == self.status:
			return
		allowed = VALID_STATUS_TRANSITIONS.get(old_status, [])
		if self.status not in allowed:
			frappe.throw(
				f"Transisi status tidak valid: {old_status} → {self.status}. "
				f"Yang diperbolehkan: {', '.join(allowed) or '(tidak ada)'}",
				frappe.ValidationError,
			)

	def _validate_tasks_belong_to_project(self) -> None:
		"""Every task in the `tasks` child table must belong to this sprint's project.

		Cross-project tasks would break velocity rollups and burndown charts.
		"""
		if not self.tasks:
			return
		seen: set[str] = set()
		for row in self.tasks:
			# Trigger child-row validation (task_must_exist, dedupe-self).
			row.run_method("validate")
			if not row.task:
				continue
			if row.task in seen:
				frappe.throw(
					f"Task duplikat dalam sprint: {row.task}",
					frappe.ValidationError,
				)
			seen.add(row.task)
			task_project = frappe.db.get_value("VT Task", row.task, "project")
			if task_project and task_project != self.project:
				frappe.throw(
					f"Task '{row.task}' bukan milik project '{self.project}'",
					frappe.ValidationError,
				)

	def get_total_weight(self) -> float:
		"""Sum `weight` across all VT Tasks linked via the `tasks` child table.

		Returns 0.0 when the sprint has no tasks yet (avoids None propagation
		into velocity calculations).
		"""
		if not self.tasks:
			return 0.0
		task_names = [row.task for row in self.tasks if row.task]
		if not task_names:
			return 0.0
		total = frappe.db.sql(
			"SELECT SUM(weight) FROM `tabVT Task` WHERE name IN %(names)s",
			{"names": task_names},
		)
		return float(total[0][0] or 0)

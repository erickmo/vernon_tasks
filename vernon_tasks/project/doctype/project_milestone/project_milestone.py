"""Project Milestone — child table on VT Project.

Tracks a named checkpoint inside a project (e.g., "MVP launch",
"Beta freeze"). Validations enforce:

  - milestone_title normalized + length-capped
  - status ∈ {Open, Completed}
  - due_date (when set) falls within the parent project's range
"""
import re

import frappe
from frappe.model.document import Document
from frappe.utils import getdate

MILESTONE_TITLE_MAX_LEN = 200
ALLOWED_STATUS = ("Open", "Completed")
_WHITESPACE_RUN = re.compile(r"\s+")


def _normalize(raw: str | None) -> str:
	if not raw:
		return ""
	return _WHITESPACE_RUN.sub(" ", raw).strip()


class ProjectMilestone(Document):
	"""One milestone row on the parent VT Project."""

	def validate(self) -> None:
		self._validate_title()
		self._validate_status()
		self._validate_due_date()

	def _validate_title(self) -> None:
		self.milestone_title = _normalize(self.milestone_title)
		if not self.milestone_title:
			frappe.throw("Milestone title wajib diisi", frappe.MandatoryError)
		if len(self.milestone_title) > MILESTONE_TITLE_MAX_LEN:
			frappe.throw(
				f"Milestone title maksimal {MILESTONE_TITLE_MAX_LEN} karakter",
				frappe.ValidationError,
			)

	def _validate_status(self) -> None:
		status = self.status or "Open"
		if status not in ALLOWED_STATUS:
			frappe.throw(
				f"Status milestone tidak valid: '{status}'. "
				f"Pilih: {', '.join(ALLOWED_STATUS)}",
				frappe.ValidationError,
			)

	def _validate_due_date(self) -> None:
		"""When due_date is set, it must be inside the parent project's range.

		The parent doc is available via `self.parent` (the project's name).
		"""
		if not self.due_date:
			return
		if not self.parent:
			return
		proj_dates = frappe.db.get_value(
			"VT Item", self.parent, ["start_date", "end_date"]
		)
		if not proj_dates:
			return
		proj_start = getdate(proj_dates[0])
		proj_end = getdate(proj_dates[1])
		due = getdate(self.due_date)
		if due < proj_start or due > proj_end:
			frappe.throw(
				f"Due Date milestone harus dalam rentang project "
				f"({proj_start} sd {proj_end})",
				frappe.ValidationError,
			)

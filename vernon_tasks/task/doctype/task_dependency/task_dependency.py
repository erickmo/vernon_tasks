"""Task Dependency controller — child table on VT Task.

Each row encodes "this VT Task is blocked by another VT Task". The parent
VT Task is responsible for self-block detection (it knows its own name).
This controller validates row-local rules:

  - `blocked_by` is required (JSON reqd=1 enforces, controller is back-stop)
  - `dependency_type` is one of the allowed enum values
  - The linked blocker actually exists in `tabVT Task`

Cycle detection across the dependency graph is NOT run here — it would
require a full traversal on every row save. Run a periodic job instead.

Source of truth: docs/domains/task/README.html.
"""
import frappe
from frappe.model.document import Document

ALLOWED_DEPENDENCY_TYPES = ("Finish-to-Start", "Start-to-Start")


class TaskDependency(Document):
	"""Row: parent VT Task is blocked by `blocked_by` (another VT Task)."""

	def validate(self) -> None:
		self._validate_blocked_by()
		self._validate_type()

	def _validate_blocked_by(self) -> None:
		"""blocked_by must reference an existing VT Task."""
		if not self.blocked_by:
			frappe.throw("Blocked By wajib diisi", frappe.MandatoryError)
		if not frappe.db.exists("VT Task", self.blocked_by):
			frappe.throw(
				f"VT Task '{self.blocked_by}' tidak ditemukan",
				frappe.ValidationError,
			)

	def _validate_type(self) -> None:
		"""dependency_type must be one of the supported scheduling relations."""
		dep_type = self.dependency_type or "Finish-to-Start"
		if dep_type not in ALLOWED_DEPENDENCY_TYPES:
			frappe.throw(
				f"Dependency Type tidak valid: '{dep_type}'. "
				f"Pilih salah satu: {', '.join(ALLOWED_DEPENDENCY_TYPES)}",
				frappe.ValidationError,
			)

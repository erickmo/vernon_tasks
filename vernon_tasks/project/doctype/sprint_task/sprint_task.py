"""Sprint Task — child table on VT Sprint.

Row-local validation: confirm the linked VT Task exists. The parent
VT Sprint controller enforces (a) the task belongs to the same project
and (b) no duplicate task rows across the sprint.
"""
import frappe
from frappe.model.document import Document


class SprintTask(Document):
	"""One row = one VT Task included in the parent sprint."""

	def validate(self) -> None:
		"""Confirm the task link points at an existing VT Task."""
		if not self.task:
			frappe.throw("Task wajib diisi", frappe.MandatoryError)
		if not frappe.db.exists("VT Task", self.task):
			frappe.throw(
				f"VT Task '{self.task}' tidak ditemukan",
				frappe.ValidationError,
			)

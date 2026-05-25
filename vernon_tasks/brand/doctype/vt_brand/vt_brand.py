"""VT Brand controller.

ADR-022 — REST-first, hooks-for-logic. FK integrity guard lives here so the
standard `/api/resource/VT Brand` REST endpoints enforce it automatically
without needing a custom whitelisted wrapper.
"""
import frappe
from frappe.model.document import Document

LINKED_PROJECT_DOCTYPE = "VT Project"
LINKED_PROJECT_FK = "brand"


class VTBrand(Document):
	def on_trash(self) -> None:
		"""Block delete when any VT Project still references this brand.

		Source of truth: docs/domains/brand/README.html (Brand cannot be
		orphaned while projects link to it).
		"""
		in_use = frappe.db.count(
			LINKED_PROJECT_DOCTYPE, {LINKED_PROJECT_FK: self.name}
		)
		if in_use:
			frappe.throw(
				f"Brand is linked to {in_use} project(s); reassign before deleting",
				frappe.ValidationError,
			)

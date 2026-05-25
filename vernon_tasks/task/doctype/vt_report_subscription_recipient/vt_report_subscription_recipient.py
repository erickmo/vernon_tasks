"""VT Report Subscription Recipient — child table on VT Report Subscription.

Row-local validation is minimal: the parent's `_validate_recipients` handles
required + uniqueness because the dedupe check needs the full set.
"""
import frappe
from frappe.model.document import Document


class VTReportSubscriptionRecipient(Document):
	"""One subscriber to a scheduled report — just a User link."""

	def validate(self) -> None:
		"""Confirm the linked user exists. Parent handles uniqueness."""
		if not self.user:
			frappe.throw("User wajib diisi", frappe.MandatoryError)
		if not frappe.db.exists("User", self.user):
			frappe.throw(
				f"User '{self.user}' tidak ditemukan",
				frappe.ValidationError,
			)

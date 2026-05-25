"""Vernon Push Preference controller — per-user notification toggles.

`user` is the permanent PK (`autoname: field:user`). Each user has at most
one preference row that flips four event categories on / off.
"""
import frappe
from frappe.model.document import Document


class VernonPushPreference(Document):
	"""Per-user preference for which push events fire."""

	def validate(self) -> None:
		"""user link FK back-stop; toggles are booleans (column type enforces)."""
		if not self.user:
			frappe.throw("User wajib diisi", frappe.MandatoryError)
		if not frappe.db.exists("User", self.user):
			frappe.throw(
				f"User '{self.user}' tidak ditemukan",
				frappe.ValidationError,
			)

	def before_rename(self, old: str, new: str, merge: bool = False) -> None:
		"""Block rename — user is the permanent PK.

		Renaming would silently re-assign preferences to a different user.
		"""
		frappe.throw(
			"Vernon Push Preference tidak dapat di-rename; hapus dan buat baru",
			frappe.ValidationError,
		)

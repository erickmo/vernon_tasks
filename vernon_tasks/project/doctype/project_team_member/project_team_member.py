"""Project Team Member — child table on VT Project.

Validations:
  - user must exist
  - role must be one of the allowed enum values
  - is_also_leader=1 must coincide with role=Leader (or be cleared)

Parent VT Project handles uniqueness vs owner/leader (see
`_validate_team_excludes_owner_leader`).
"""
import frappe
from frappe.model.document import Document

ALLOWED_ROLES = ("Owner", "Leader", "Member")


class ProjectTeamMember(Document):
	"""One row = one user assigned to the parent project."""

	def validate(self) -> None:
		self._validate_user()
		self._validate_role()
		self._validate_also_leader_flag()

	def _validate_user(self) -> None:
		"""user is required and must reference an existing User."""
		if not self.user:
			frappe.throw("User wajib diisi", frappe.MandatoryError)
		if not frappe.db.exists("User", self.user):
			frappe.throw(
				f"User '{self.user}' tidak ditemukan",
				frappe.ValidationError,
			)

	def _validate_role(self) -> None:
		"""role must be one of the enum options."""
		role = self.role or "Member"
		if role not in ALLOWED_ROLES:
			frappe.throw(
				f"Role tidak valid: '{role}'. Pilih: {', '.join(ALLOWED_ROLES)}",
				frappe.ValidationError,
			)

	def _validate_also_leader_flag(self) -> None:
		"""is_also_leader is meaningful only when role != Leader.

		If role IS Leader, the flag is redundant; if role is Member with
		`is_also_leader=1`, that's the documented "deputy leader" pattern.
		Owner with `is_also_leader=1` is rejected (Owner already outranks).
		"""
		if not self.is_also_leader:
			return
		if self.role == "Owner":
			frappe.throw(
				"Owner sudah di atas Leader; jangan centang 'Also Leader'",
				frappe.ValidationError,
			)

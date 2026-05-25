"""VT Contact Request controller — landing-page contact form submissions.

Each row = one inbound contact form submission. Validations sanitize input
and reject malformed data before it lands in the manager's queue.

Source of truth: docs/domains/vt_settings/README.html.
"""
import re

import frappe
from frappe.model.document import Document
from frappe.utils import validate_email_address

# --- Validation caps -----------------------------------------------------
FULL_NAME_MAX_LEN = 200
COMPANY_MAX_LEN = 200
MESSAGE_MAX_LEN = 5_000
ALLOWED_STATUS = ("New", "Contacted", "Closed")
_WHITESPACE_RUN = re.compile(r"\s+")


def _normalize(raw: str | None) -> str:
	"""Trim + collapse whitespace runs."""
	if not raw:
		return ""
	return _WHITESPACE_RUN.sub(" ", raw).strip()


class VTContactRequest(Document):
	"""Contact form submission from the marketing landing page."""

	def validate(self) -> None:
		"""Sanitize inputs, validate email, enforce length caps + status enum."""
		self.full_name = _normalize(self.full_name)
		self.company = _normalize(self.company)
		# Email is lower-cased for canonical comparison (case-insensitive).
		self.email = (self.email or "").strip().lower()
		self.message = (self.message or "").strip()

		self._validate_required()
		self._validate_email()
		self._validate_lengths()
		self._validate_status()

	def _validate_required(self) -> None:
		"""full_name + email + message are required (JSON `reqd` is back-stop)."""
		if not self.full_name:
			frappe.throw("Nama Lengkap wajib diisi", frappe.MandatoryError)
		if not self.email:
			frappe.throw("Email wajib diisi", frappe.MandatoryError)
		if not self.message:
			frappe.throw("Pesan wajib diisi", frappe.MandatoryError)

	def _validate_email(self) -> None:
		"""Server-side email format check.

		`validate_email_address` returns the normalized address on success,
		raises `frappe.ValidationError` on bad input.
		"""
		if not validate_email_address(self.email):
			frappe.throw(
				f"Email tidak valid: {self.email}",
				frappe.ValidationError,
			)

	def _validate_lengths(self) -> None:
		"""Cap free-text fields so a malicious form post can't OOM the DB row."""
		if len(self.full_name) > FULL_NAME_MAX_LEN:
			frappe.throw(
				f"Nama Lengkap maksimal {FULL_NAME_MAX_LEN} karakter",
				frappe.ValidationError,
			)
		if self.company and len(self.company) > COMPANY_MAX_LEN:
			frappe.throw(
				f"Nama Perusahaan maksimal {COMPANY_MAX_LEN} karakter",
				frappe.ValidationError,
			)
		if len(self.message) > MESSAGE_MAX_LEN:
			frappe.throw(
				f"Pesan maksimal {MESSAGE_MAX_LEN} karakter",
				frappe.ValidationError,
			)

	def _validate_status(self) -> None:
		"""status must be one of the workflow enum values."""
		status = self.status or "New"
		if status not in ALLOWED_STATUS:
			frappe.throw(
				f"Status tidak valid: '{status}'. "
				f"Pilih: {', '.join(ALLOWED_STATUS)}",
				frappe.ValidationError,
			)

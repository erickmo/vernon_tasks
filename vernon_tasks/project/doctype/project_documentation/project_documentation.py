"""Project Documentation — child table on VT Project.

Stores free-form documentation snippets attached to a project (links,
notes, embedded markdown). Validations cap title + content size so
list-view rendering stays fast.
"""
import re

import frappe
from frappe.model.document import Document

DOC_TITLE_MAX_LEN = 200
# Long Text is TEXT (no hard DB cap); keep payloads sane for the portal.
DOC_CONTENT_MAX_LEN = 50_000
_WHITESPACE_RUN = re.compile(r"\s+")


def _normalize(raw: str | None) -> str:
	if not raw:
		return ""
	return _WHITESPACE_RUN.sub(" ", raw).strip()


class ProjectDocumentation(Document):
	"""One documentation row on the parent VT Project."""

	def validate(self) -> None:
		self.doc_title = _normalize(self.doc_title)
		if not self.doc_title:
			frappe.throw("Doc title wajib diisi", frappe.MandatoryError)
		if len(self.doc_title) > DOC_TITLE_MAX_LEN:
			frappe.throw(
				f"Doc title maksimal {DOC_TITLE_MAX_LEN} karakter",
				frappe.ValidationError,
			)
		if self.content and len(self.content) > DOC_CONTENT_MAX_LEN:
			frappe.throw(
				f"Content maksimal {DOC_CONTENT_MAX_LEN} karakter",
				frappe.ValidationError,
			)

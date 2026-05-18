import frappe
from frappe.model.document import Document
from frappe.utils import validate_email_address


class VTContactRequest(Document):
    """Controller for VT Contact Request — contact form submissions from landing page."""

    def validate(self):
        """Sanitize inputs and validate email format server-side."""
        self.full_name = (self.full_name or "").strip()
        self.email = (self.email or "").strip().lower()
        self.message = (self.message or "").strip()
        if self.email and not validate_email_address(self.email):
            frappe.throw(f"Email tidak valid: {self.email}", title="Validasi Gagal")

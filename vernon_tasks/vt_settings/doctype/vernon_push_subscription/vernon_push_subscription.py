"""Vernon Push Subscription controller — Web Push endpoint per user device.

One row = one browser/device a user has granted push permission on. Stores
the W3C Web Push subscription tuple (endpoint, p256dh, auth).

Source of truth: docs/domains/vt_settings/README.html.
"""
import frappe
from frappe.model.document import Document


class VernonPushSubscription(Document):
	"""Per-device Web Push subscription."""

	def before_insert(self) -> None:
		"""Stamp last_seen at creation so empty rows are not interpreted as stale."""
		if not self.last_seen:
			self.last_seen = frappe.utils.now_datetime()

	def validate(self) -> None:
		self._validate_user()
		self._validate_endpoint()
		self._validate_keys()
		self._validate_immutable_endpoint()

	def _validate_user(self) -> None:
		"""user link FK back-stop."""
		if not self.user:
			frappe.throw("User wajib diisi", frappe.MandatoryError)
		if not frappe.db.exists("User", self.user):
			frappe.throw(
				f"User '{self.user}' tidak ditemukan",
				frappe.ValidationError,
			)

	def _validate_endpoint(self) -> None:
		"""endpoint must look like an https URL (W3C Push spec)."""
		ep = (self.endpoint or "").strip()
		if not ep:
			frappe.throw("Endpoint wajib diisi", frappe.MandatoryError)
		# Push services (FCM, Mozilla, Apple) all use https:// URLs.
		if not ep.startswith("https://"):
			frappe.throw(
				"Endpoint Push harus berupa URL https://",
				frappe.ValidationError,
			)

	def _validate_keys(self) -> None:
		"""p256dh and auth are required; sizes enforced at JSON `length`."""
		if not (self.p256dh or "").strip():
			frappe.throw("p256dh wajib diisi", frappe.MandatoryError)
		if not (self.auth or "").strip():
			frappe.throw("auth wajib diisi", frappe.MandatoryError)

	def _validate_immutable_endpoint(self) -> None:
		"""endpoint cannot be changed after insert — a new endpoint = new device.

		If a device re-subscribes, delete the old row and insert a fresh one.
		"""
		if self.is_new():
			return
		old = frappe.db.get_value(
			"Vernon Push Subscription", self.name, "endpoint"
		)
		if old and old != self.endpoint:
			frappe.throw(
				"Endpoint tidak dapat diubah; hapus dan buat baru",
				frappe.ValidationError,
			)

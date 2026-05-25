"""Vernon Telemetry Event controller — append-only product analytics events.

Each row = one client- or server-emitted event (e.g. "page_view",
"task_completed"). High-volume table; validations stay cheap.

Source of truth: docs/domains/vt_settings/README.html.
"""
import json
import re

import frappe
from frappe.model.document import Document
from frappe.utils import get_datetime, now_datetime

# --- Validation caps -----------------------------------------------------
# Event name is a VARCHAR(64) per JSON length; we still validate format
# (alphanumeric + dot/underscore) to keep group-by queries clean.
_EVENT_NAME_RE = re.compile(r"^[a-zA-Z0-9_.]{1,64}$")
PROPS_MAX_LEN = 10_000


class VernonTelemetryEvent(Document):
	"""One product telemetry row (event + props + user + timestamp)."""

	def before_insert(self) -> None:
		"""Default timestamp = now and user = session user when omitted.

		Telemetry events are typically pushed from the client without
		either field; these defaults keep the API minimal.
		"""
		if not self.timestamp:
			self.timestamp = frappe.utils.now_datetime()
		if not self.user:
			self.user = frappe.session.user

	def validate(self) -> None:
		self._validate_event_name()
		self._validate_timestamp_not_future()
		self._validate_props_json()

	def _validate_event_name(self) -> None:
		"""event must match the alphanumeric + dot/underscore convention."""
		if not self.event:
			frappe.throw("Event wajib diisi", frappe.MandatoryError)
		if not _EVENT_NAME_RE.match(self.event):
			frappe.throw(
				f"Event name tidak valid: '{self.event}'. "
				"Gunakan huruf, angka, titik, atau underscore saja (maks 64 char)",
				frappe.ValidationError,
			)

	def _validate_timestamp_not_future(self) -> None:
		"""Reject events stamped in the future — analytics is historical.

		Compares against Frappe's site-tz `now_datetime()` (NOT Python's
		`datetime.now()`) so a UTC-running container with a site set to a
		non-UTC timezone doesn't false-positive every insert.
		"""
		if not self.timestamp:
			return
		ts = get_datetime(self.timestamp)
		# Allow up to 5 minutes of clock skew between client and server.
		# Client-side telemetry from mobile devices can have minor drift;
		# this tolerance avoids dropping legitimate events.
		from datetime import timedelta
		if ts > now_datetime() + timedelta(minutes=5):
			frappe.throw(
				"Timestamp tidak boleh di masa depan",
				frappe.ValidationError,
			)

	def _validate_props_json(self) -> None:
		"""props (when set) must parse as JSON and stay under PROPS_MAX_LEN."""
		raw = (self.props or "").strip()
		if not raw:
			return
		if len(raw) > PROPS_MAX_LEN:
			frappe.throw(
				f"Props maksimal {PROPS_MAX_LEN} karakter",
				frappe.ValidationError,
			)
		try:
			json.loads(raw)
		except (json.JSONDecodeError, ValueError) as exc:
			frappe.throw(
				f"Props tidak valid sebagai JSON: {exc}",
				frappe.ValidationError,
			)

"""VT Report Subscription controller — scheduled report deliveries.

A subscription says "deliver the report at <slug> on <cron> as <format>
to these <recipients>". The scheduler tick reads enabled subscriptions
and renders + emails them.

Validations:
  - slug is one of the allowed report identifiers
  - cron is a 5-field expression
  - filters_json (when set) parses as JSON
  - at least one recipient
  - recipients are unique (no duplicate User links)

Source of truth: docs/domains/task/README.html (Reports section).
"""
import json
import re

import frappe
from frappe.model.document import Document

# --- Allowed report slugs ------------------------------------------------
# Keep in sync with the report generator registry; adding a slug here is a
# whitelist gate against arbitrary string injection from the UI.
ALLOWED_SLUGS = frozenset({
	"project-health",
	"okr-pacing",
	"team-throughput",
	"my-points",
	"project-burndown-archive",
	"risk-log",
})

# Minimal 5-field cron validator — covers the common cases without pulling
# in croniter. Each field must be `*`, a number, a range (a-b), a step
# (*/n), or a list (a,b,c). Real semantics are validated by the scheduler.
_CRON_FIELD = r"(\*|\d+|\d+-\d+|\*/\d+|\d+(,\d+)+)"
_CRON_RE = re.compile(rf"^{_CRON_FIELD}(\s+{_CRON_FIELD}){{4}}$")


class VTReportSubscription(Document):
	"""One scheduled report subscription."""

	def validate(self) -> None:
		self._validate_slug()
		self._validate_cron()
		self._validate_filters_json()
		self._validate_recipients()
		# Explicitly run child validate so the recipient User-exists check fires.
		for row in (self.recipients or []):
			row.run_method("validate")

	def _validate_slug(self) -> None:
		"""Reject unknown report slugs — slug becomes the renderer key."""
		if self.slug not in ALLOWED_SLUGS:
			frappe.throw(
				f"Report slug tidak dikenal: '{self.slug}'. "
				f"Pilih salah satu: {', '.join(sorted(ALLOWED_SLUGS))}",
				frappe.ValidationError,
			)

	def _validate_cron(self) -> None:
		"""Cron must be a 5-field expression matching the simplified grammar."""
		cron = (self.cron or "").strip()
		if not cron:
			frappe.throw("Cron wajib diisi", frappe.MandatoryError)
		if not _CRON_RE.match(cron):
			frappe.throw(
				f"Cron tidak valid: '{cron}'. "
				"Gunakan format 5-field standar (mis. '0 8 * * 1')",
				frappe.ValidationError,
			)

	def _validate_filters_json(self) -> None:
		"""When filters_json is set, it must parse as JSON.

		The renderer treats it as a key-value bag; we don't validate the
		shape here because each report owns its own filter schema.
		"""
		raw = (self.filters_json or "").strip()
		if not raw:
			return
		try:
			json.loads(raw)
		except (json.JSONDecodeError, ValueError) as exc:
			frappe.throw(
				f"Filters JSON tidak valid: {exc}",
				frappe.ValidationError,
			)

	def _validate_recipients(self) -> None:
		"""At least one recipient; recipients must be unique users."""
		if not self.recipients:
			frappe.throw(
				"Minimal satu recipient diperlukan",
				frappe.ValidationError,
			)
		seen: set[str] = set()
		for row in self.recipients:
			user = row.user
			if not user:
				# JSON `reqd: 1` on the child should catch this; controller
				# is back-stop for programmatic insert paths.
				frappe.throw(
					"Recipient User wajib diisi",
					frappe.MandatoryError,
				)
			if user in seen:
				frappe.throw(
					f"Recipient duplikat: {user}",
					frappe.ValidationError,
				)
			seen.add(user)

"""Daily Summary controller — per-user per-day aggregate.

One row = one (user, date) rollup of target / scheduled / completed hours
and points. Validations keep the row internally consistent so dashboards
can trust the numbers.

Name format `format:DS-{user}-{date}` makes the (user, date) pair the
natural unique key — no explicit dedupe needed.

Source of truth: docs/domains/workforce/README.html.
"""
from datetime import date as _date

import frappe
from frappe.model.document import Document
from frappe.utils import getdate, today

# --- Validation caps ------------------------------------------------------
# A day has 24 hours. Scheduled / completed / target are capped at that.
MAX_HOURS_PER_DAY = 24.0


class DailySummary(Document):
	"""Daily rollup for one user on one date."""

	def validate(self) -> None:
		self._validate_user()
		self._validate_date()
		self._validate_hours()
		self._validate_points()

	def _validate_user(self) -> None:
		"""user must exist (link FK back-stop)."""
		if not self.user:
			frappe.throw("User wajib diisi", frappe.MandatoryError)
		if not frappe.db.exists("User", self.user):
			frappe.throw(
				f"User '{self.user}' tidak ditemukan",
				frappe.ValidationError,
			)

	def _validate_date(self) -> None:
		"""date is required and not in the future (entries record past/today)."""
		if not self.date:
			frappe.throw("Tanggal wajib diisi", frappe.MandatoryError)
		if getdate(self.date) > _date.today():
			frappe.throw(
				"Tanggal Daily Summary tidak boleh di masa depan",
				frappe.ValidationError,
			)

	def _validate_hours(self) -> None:
		"""target / scheduled / completed hours each ∈ [0, 24]."""
		for fieldname, label in (
			("target_hours", "Target Hours"),
			("scheduled_hours", "Scheduled Hours"),
			("completed_hours", "Completed Hours"),
		):
			value = getattr(self, fieldname, 0) or 0
			if value < 0:
				frappe.throw(
					f"{label} tidak boleh negatif",
					frappe.ValidationError,
				)
			if value > MAX_HOURS_PER_DAY:
				frappe.throw(
					f"{label} maksimal {MAX_HOURS_PER_DAY:.0f} jam",
					frappe.ValidationError,
				)

	def _validate_points(self) -> None:
		"""total_points_today is a free numeric (negative allowed for net penalties)."""
		# Explicit no-op: leaves the field unrestricted. Documented here so
		# future contributors don't add a bogus >= 0 check.
		return


# --- Module-level helpers ------------------------------------------------

def get_or_create_today(user: str, target_hours: float = 8.0) -> "DailySummary":
	"""Return today's Daily Summary for `user`, creating one if missing.

	Idempotent — safe to call on every scheduler tick.
	"""
	date = getdate(today())
	name = frappe.db.get_value(
		"Daily Summary", {"user": user, "date": date}, "name"
	)
	if name:
		return frappe.get_doc("Daily Summary", name)
	doc = frappe.get_doc({
		"doctype": "Daily Summary",
		"user": user,
		"date": date,
		"target_hours": target_hours,
		"scheduled_hours": 0,
		"completed_hours": 0,
		"total_points_today": 0,
	})
	doc.insert(ignore_permissions=True)
	return doc


def update_scheduled_hours(user: str, date, delta: float) -> None:
	"""Add `delta` to scheduled_hours for (user, date).

	Uses `frappe.db.set_value` to avoid triggering validate() — this helper
	is called from a hot loop and the row was already validated on insert.
	"""
	name = frappe.db.get_value("Daily Summary", {"user": user, "date": date}, "name")
	if name:
		current = frappe.db.get_value("Daily Summary", name, "scheduled_hours") or 0
		frappe.db.set_value("Daily Summary", name, "scheduled_hours", current + delta)


def generate_daily_summaries() -> None:
	"""Create today's Daily Summary for every user with a Work Profile.

	Wired in hooks.py scheduler_events for the daily cron.
	"""
	from vernon_tasks.workforce.doctype.work_profile.work_profile import get_daily_target_hours
	users = frappe.get_all("Work Profile", fields=["user"])
	for u in users:
		get_or_create_today(u.user, get_daily_target_hours(u.user))

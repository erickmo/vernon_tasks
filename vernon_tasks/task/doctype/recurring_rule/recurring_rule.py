"""Recurring Rule controller — schedule generator for recurring VT Tasks.

A Recurring Rule encodes "every N days/weeks/months" (or a custom day-of-
week pattern) plus optional end conditions (end_date / max_occurrences).
The controller validates field combinations; the module-level helpers
(`get_next_occurrence`, `is_rule_expired`) are used by the scheduler.

Source of truth: docs/domains/task/README.html (Recurring section).
"""
from datetime import date, timedelta

from dateutil.relativedelta import relativedelta

import frappe
from frappe.model.document import Document
from frappe.utils import getdate

# --- Rule taxonomy -------------------------------------------------------
ALLOWED_RULE_TYPES = ("Daily", "Weekly", "Monthly", "Custom")

# Practical cap — a 366-day interval would just be "yearly", which the
# UI already exposes as a Monthly+12 combo. 365 lets the planner pick
# either path without surprises.
MAX_INTERVAL = 365
MIN_INTERVAL = 1
MIN_DAY_OF_MONTH = 1
MAX_DAY_OF_MONTH = 31

# Accepted weekday tokens (case-sensitive; we trim and validate).
_WEEKDAY_TOKENS = {"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"}
_WEEKDAY_INDEX = {"Mon": 0, "Tue": 1, "Wed": 2, "Thu": 3, "Fri": 4, "Sat": 5, "Sun": 6}


class RecurringRule(Document):
	"""Encodes how often a recurring task should be regenerated."""

	def validate(self) -> None:
		self._validate_rule_type()
		self._validate_interval()
		self._validate_day_of_month()
		self._validate_days_of_week()
		self._validate_end_conditions()

	def _validate_rule_type(self) -> None:
		if self.rule_type not in ALLOWED_RULE_TYPES:
			frappe.throw(
				f"Rule Type tidak valid: '{self.rule_type}'",
				frappe.ValidationError,
			)

	def _validate_interval(self) -> None:
		"""interval ∈ [1, MAX_INTERVAL]. 0 / negative would loop forever.

		We check the raw value (not `self.interval or 1`) so an explicit 0
		is caught instead of silently coerced to the default.
		"""
		if self.interval is None:
			# JSON default is 1; only fires for callers that explicitly set None.
			return
		if self.interval < MIN_INTERVAL:
			frappe.throw(
				f"Interval harus minimal {MIN_INTERVAL}",
				frappe.ValidationError,
			)
		if self.interval > MAX_INTERVAL:
			frappe.throw(
				f"Interval maksimal {MAX_INTERVAL}",
				frappe.ValidationError,
			)

	def _validate_day_of_month(self) -> None:
		"""day_of_month ∈ [1, 31] when supplied (only meaningful for Monthly)."""
		dom = self.day_of_month
		if dom is None or dom == 0:
			return
		if not (MIN_DAY_OF_MONTH <= dom <= MAX_DAY_OF_MONTH):
			frappe.throw(
				f"Day of Month harus antara {MIN_DAY_OF_MONTH} dan {MAX_DAY_OF_MONTH}",
				frappe.ValidationError,
			)

	def _validate_days_of_week(self) -> None:
		"""Tokens must be a comma-separated subset of {Mon..Sun}.

		Only relevant when rule_type == 'Custom', but if a planner sets it
		on other types we still validate so the field stays clean.
		"""
		raw = (self.days_of_week or "").strip()
		if not raw:
			return
		tokens = [t.strip() for t in raw.split(",") if t.strip()]
		invalid = [t for t in tokens if t not in _WEEKDAY_TOKENS]
		if invalid:
			frappe.throw(
				f"Days of Week tidak valid: {', '.join(invalid)}. "
				f"Gunakan kombinasi: {', '.join(sorted(_WEEKDAY_TOKENS))}",
				frappe.ValidationError,
			)

	def _validate_end_conditions(self) -> None:
		"""max_occurrences ≥ 1; end_date in the future at insert time.

		On update we don't re-check end_date in the past — a rule that's
		ended is still a valid history record.
		"""
		if self.max_occurrences is not None and self.max_occurrences <= 0:
			frappe.throw(
				"Max Occurrences harus lebih besar dari 0",
				frappe.ValidationError,
			)
		if self.is_new() and self.end_date:
			if getdate(self.end_date) < date.today():
				frappe.throw(
					"End Date tidak boleh sebelum hari ini saat rule dibuat",
					frappe.ValidationError,
				)


def get_next_occurrence(rule_name: str, from_date: date) -> date:
	"""Compute the next scheduled date after `from_date` for `rule_name`.

	Daily/Weekly/Monthly add the interval directly. For Custom, walk forward
	one day at a time until we find a weekday in the allowed set (capped at
	14 lookahead days to avoid infinite loops on misconfigured rules).
	"""
	rule = frappe.get_doc("Recurring Rule", rule_name)
	interval = rule.interval or 1

	if rule.rule_type == "Daily":
		return from_date + timedelta(days=interval)
	if rule.rule_type == "Weekly":
		return from_date + timedelta(weeks=interval)
	if rule.rule_type == "Monthly":
		return from_date + relativedelta(months=interval)
	if rule.rule_type == "Custom":
		# Walk forward up to 14 days. If none match, fall through to a
		# plain `+interval` jump so the scheduler doesn't stall.
		if rule.days_of_week:
			allowed = [
				_WEEKDAY_INDEX[d.strip()]
				for d in rule.days_of_week.split(",")
				if d.strip() in _WEEKDAY_INDEX
			]
			candidate = from_date + timedelta(days=1)
			for _ in range(14):
				if candidate.weekday() in allowed:
					return candidate
				candidate += timedelta(days=1)
		return from_date + timedelta(days=interval)

	# Defensive default — unknown rule_type shouldn't pass validate(), but
	# return tomorrow so the scheduler doesn't crash on bad data.
	return from_date + timedelta(days=1)


def is_rule_expired(rule_name: str, occurrence_count: int, as_of: date) -> bool:
	"""Return True if the rule has hit its end_date or max_occurrences.

	Args:
		rule_name: Recurring Rule docname.
		occurrence_count: how many times the rule has already fired.
		as_of: date to test against.
	"""
	rule = frappe.get_doc("Recurring Rule", rule_name)
	if rule.end_date and as_of > getdate(rule.end_date):
		return True
	if rule.max_occurrences and occurrence_count >= rule.max_occurrences:
		return True
	return False

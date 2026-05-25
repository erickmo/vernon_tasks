"""Key Result controller — OKR domain.

Layer: Frappe DocType controller (Layer 2, Priority 1 per vernon-dev
Frappe Hooks-First rule). Owns numeric validation for KR metrics and
auto-computes `progress_percent` so the dashboard never has to recalculate.

Cross-domain rules:
  - `objective` is required; FK is enforced by Frappe's Link field.
  - When the parent Objective is deleted, the on_trash guard there
    (`objective.on_trash`) blocks while this KR still exists — no
    cascade-delete to avoid silent data loss.

Source of truth: docs/domains/okr/README.html.
"""
import re

import frappe
from frappe.model.document import Document

# --- Validation caps ------------------------------------------------------
# Metric is a Data field (VARCHAR(140)); enforce in controller for a clear
# error message instead of a raw DB truncation.
KR_METRIC_MAX_LEN = 140
_WHITESPACE_RUN = re.compile(r"\s+")

# Confidence is stored as Percent (Frappe Float, no implicit range).
# Constrain to [0, 100] — the planner UI shows a 0-100 slider.
CONFIDENCE_MIN = 0.0
CONFIDENCE_MAX = 100.0


def _normalize_metric(raw: str | None) -> str:
	"""Trim and collapse whitespace runs (prevents look-alike duplicates)."""
	if not raw:
		return ""
	return _WHITESPACE_RUN.sub(" ", raw).strip()


class KeyResult(Document):
	"""Measurable outcome attached to an Objective."""

	def validate(self) -> None:
		"""Enforce numeric ranges + metric normalization, auto-compute progress."""
		self._validate_metric()
		self._validate_numbers()
		self._compute_progress()

	def _validate_metric(self) -> None:
		"""Normalize + length-cap the metric label."""
		self.metric = _normalize_metric(self.metric)
		if not self.metric:
			frappe.throw("Metric wajib diisi", frappe.MandatoryError)
		if len(self.metric) > KR_METRIC_MAX_LEN:
			frappe.throw(
				f"Metric maksimal {KR_METRIC_MAX_LEN} karakter",
				frappe.ValidationError,
			)

	def _validate_numbers(self) -> None:
		"""target>0, current>=0, confidence∈[0,100]."""
		# target_value > 0 is critical — used as the divisor for progress.
		if (self.target_value or 0) <= 0:
			frappe.throw(
				"Target Value harus lebih besar dari 0",
				frappe.ValidationError,
			)
		if (self.current_value or 0) < 0:
			frappe.throw(
				"Current Value tidak boleh negatif",
				frappe.ValidationError,
			)
		# Confidence is optional; only validate when supplied.
		conf = self.confidence
		if conf is not None and not (CONFIDENCE_MIN <= conf <= CONFIDENCE_MAX):
			frappe.throw(
				f"Confidence harus antara {CONFIDENCE_MIN:.0f} dan {CONFIDENCE_MAX:.0f}",
				frappe.ValidationError,
			)
		conf_lw = self.confidence_last_week
		if conf_lw is not None and not (CONFIDENCE_MIN <= conf_lw <= CONFIDENCE_MAX):
			frappe.throw(
				f"Confidence (Last Week) harus antara {CONFIDENCE_MIN:.0f} dan {CONFIDENCE_MAX:.0f}",
				frappe.ValidationError,
			)

	def _compute_progress(self) -> None:
		"""progress_percent = clamp(current/target, 0..1) * 100, rounded 2dp.

		Clamping at 1.0 ensures over-performance does not skew the parent
		Objective's mean above 100% (see `get_objective_progress`).
		"""
		ratio = self.current_value / self.target_value
		self.progress_percent = round(min(max(ratio, 0.0), 1.0) * 100, 2)

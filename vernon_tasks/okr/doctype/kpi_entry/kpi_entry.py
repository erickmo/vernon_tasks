"""KPI Entry controller — OKR domain.

Layer: Frappe DocType controller (Layer 2, Priority 1).

A KPI Entry is one observed measurement for a KPI Definition on a specific
date. Entries are append-only history; validations here protect against:

  - Future-dated observations (a measurement is by definition past tense).
  - Duplicate (kpi_definition, date) rows that would double-count in rollups.
  - Cross-brand project links that would smear analytics across brands.

Source of truth: docs/domains/okr/README.html.
"""
from datetime import date as _date

import frappe
from frappe.model.document import Document
from frappe.utils import getdate


class KPIEntry(Document):
	"""One observed value for a KPI on a given date."""

	def validate(self) -> None:
		self._validate_date_not_future()
		self._validate_unique_per_date()
		self._validate_project_brand_matches_kpi()

	def _validate_date_not_future(self) -> None:
		"""Reject dates after today — entries are observed history.

		`frappe.utils.getdate` normalizes strings + datetime → date so the
		comparison is timezone-stable.
		"""
		if not self.date:
			return
		entry_date = getdate(self.date)
		if entry_date > _date.today():
			frappe.throw(
				"Tanggal entry tidak boleh di masa depan",
				frappe.ValidationError,
			)

	def _validate_unique_per_date(self) -> None:
		"""One observation per (kpi_definition, date) — dedupe.

		Skips self when updating (exclude this doc's own name). Without this
		guard, a planner who re-submits the day's KPI would silently double
		the rollup.
		"""
		if not (self.kpi_definition and self.date):
			return
		filters = {"kpi_definition": self.kpi_definition, "date": self.date}
		if not self.is_new():
			# Exclude self so re-saves of an existing row don't trip the check.
			filters["name"] = ("!=", self.name)
		duplicate = frappe.db.exists("KPI Entry", filters)
		if duplicate:
			frappe.throw(
				f"Sudah ada entry untuk KPI '{self.kpi_definition}' "
				f"pada tanggal {self.date}",
				frappe.ValidationError,
			)

	def _validate_project_brand_matches_kpi(self) -> None:
		"""If `project` is set, its brand must equal the KPI's brand.

		Prevents cross-brand analytics drift — a brand-A entry attributed
		to a brand-B project would let one brand's metric inflate another's
		rollup.
		"""
		if not self.project:
			return
		kpi_brand = frappe.db.get_value("KPI Definition", self.kpi_definition, "brand")
		project_brand = frappe.db.get_value("VT Project", self.project, "brand")
		if kpi_brand and project_brand and kpi_brand != project_brand:
			frappe.throw(
				f"Brand project ({project_brand}) tidak sama dengan brand KPI "
				f"({kpi_brand}). Pilih project di brand yang sama.",
				frappe.ValidationError,
			)

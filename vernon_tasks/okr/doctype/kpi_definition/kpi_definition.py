"""KPI Definition controller — OKR domain.

Layer: Frappe DocType controller (Layer 2, Priority 1).

`kpi_name` is the permanent PK (`autoname: field:kpi_name`). The brand is
fetched from the parent Objective when blank (via JSON `fetch_from`); when
both are set, this controller asserts they match — drift would split
analytics across two brands silently.

Cross-domain rules:
  - `brand` required, must match `objective.brand` if `objective` is set.
  - `on_trash` blocks delete while KPI Entries still reference this def.

Source of truth: docs/domains/okr/README.html.
"""
import re

import frappe
from frappe.model.document import Document

# --- Validation caps ------------------------------------------------------
KPI_NAME_MAX_LEN = 140
# Formula is Long Text (TEXT column). 5_000 covers realistic narrative
# descriptions while keeping list / API payloads compact.
KPI_FORMULA_MAX_LEN = 5_000
_WHITESPACE_RUN = re.compile(r"\s+")

# Linked downstream doctype — deleting a KPI Def with entries would orphan
# historical measurements that the dashboards / reports depend on.
LINKED_ENTRY_DOCTYPE = "KPI Entry"
LINKED_ENTRY_FK = "kpi_definition"


def _normalize_name(raw: str | None) -> str:
	"""Trim + collapse whitespace runs."""
	if not raw:
		return ""
	return _WHITESPACE_RUN.sub(" ", raw).strip()


class KPIDefinition(Document):
	"""Reusable KPI specification scoped by Brand (optionally tied to Objective)."""

	def autoname(self) -> None:
		"""Normalize kpi_name BEFORE Frappe derives `name` from it.

		Without this, "KPI   Foo" and "KPI Foo" would both pass the unique
		constraint as distinct PKs.
		"""
		self.kpi_name = _normalize_name(self.kpi_name)

	def validate(self) -> None:
		"""Normalize + length-cap + brand-coherence guard."""
		self.kpi_name = _normalize_name(self.kpi_name)
		if not self.kpi_name:
			frappe.throw("Nama KPI wajib diisi", frappe.MandatoryError)
		if len(self.kpi_name) > KPI_NAME_MAX_LEN:
			frappe.throw(
				f"Nama KPI maksimal {KPI_NAME_MAX_LEN} karakter",
				frappe.ValidationError,
			)
		if self.formula and len(self.formula) > KPI_FORMULA_MAX_LEN:
			frappe.throw(
				f"Formula maksimal {KPI_FORMULA_MAX_LEN} karakter",
				frappe.ValidationError,
			)
		self._validate_target_sign()
		self._validate_brand_matches_objective()

	def _validate_target_sign(self) -> None:
		"""Reject a negative `target_value` unless `allow_negative=1`.

		Mirrors the KPI Entry value-sign rule (kpi_entry.py): count/level KPIs
		(revenue, headcount) cannot target a value below zero; delta-style KPIs
		opt in via `allow_negative`. A blank/zero target means "tracked without
		a target" and is always allowed.
		"""
		if self.target_value is None or self.target_value >= 0:
			return
		if not self.allow_negative:
			frappe.throw(
				"Target KPI tidak boleh negatif kecuali 'Allow Negative Values' "
				"aktif (KPI delta).",
				frappe.ValidationError,
			)

	def _validate_brand_matches_objective(self) -> None:
		"""When `objective` is linked, brand must equal `objective.brand`.

		The JSON `fetch_from: objective.brand` auto-populates brand when
		blank; this check catches the case where a caller deliberately set
		a different brand and would otherwise create silent cross-brand
		analytics drift.
		"""
		if not self.objective:
			return
		obj_brand = frappe.db.get_value("Objective", self.objective, "brand")
		if obj_brand and self.brand and obj_brand != self.brand:
			frappe.throw(
				f"Brand KPI ({self.brand}) harus sama dengan brand Objective "
				f"({obj_brand}). Ubah Objective atau kosongkan.",
				frappe.ValidationError,
			)

	def before_rename(self, old: str, new: str, merge: bool = False) -> None:
		"""Block rename — kpi_name is the permanent PK.

		Historical KPI Entries reference this name; renaming would either
		orphan them or require a costly cascade we explicitly avoid.
		"""
		frappe.throw(
			"KPI Definition tidak dapat di-rename; hapus dan buat ulang",
			frappe.ValidationError,
		)

	def on_trash(self) -> None:
		"""Block delete when KPI Entries still reference this definition."""
		count = frappe.db.count(LINKED_ENTRY_DOCTYPE, {LINKED_ENTRY_FK: self.name})
		if count:
			frappe.throw(
				f"KPI Definition masih punya {count} entry; hapus entry dulu "
				"sebelum menghapus definisi.",
				frappe.ValidationError,
			)

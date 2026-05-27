"""Tests for KPI Entry controller.

Covers:
  - Full CRUD lifecycle
  - Validations (date <= today, value finite, dedupe per (kpi, date))
  - Project↔KPI brand coherence (entry.project.brand == kpi.brand)
"""
import datetime

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import today

TEST_BRAND = "Test KPI Entry Brand"
TEST_BRAND_ALT = "Test KPI Entry Brand Alt"
KPI_NAME = "Sales Revenue KE Test"
KPI_NAME_ALT = "Sales Revenue KE Test Alt"


def _ensure_brand(name: str):
	if not frappe.db.exists("VT Brand", name):
		frappe.get_doc({"doctype": "VT Brand", "brand_name": name}).insert(ignore_permissions=True)


def _ensure_kpi(name: str, brand: str):
	if not frappe.db.exists("KPI Definition", name):
		frappe.get_doc({
			"doctype": "KPI Definition",
			"kpi_name": name,
			"brand": brand,
			"frequency": "Daily",
			"unit": "IDR",
		}).insert(ignore_permissions=True)


def _purge_entries(kpi_name: str):
	for e in frappe.get_all("KPI Entry", filters={"kpi_definition": kpi_name}, pluck="name"):
		frappe.delete_doc("KPI Entry", e, force=True, ignore_permissions=True)


class TestKPIEntryCRUD(FrappeTestCase):
	def setUp(self):
		_ensure_brand(TEST_BRAND)
		_ensure_kpi(KPI_NAME, TEST_BRAND)
		_purge_entries(KPI_NAME)

	def tearDown(self):
		_purge_entries(KPI_NAME)

	def test_create_kpi_entry(self):
		doc = frappe.get_doc({
			"doctype": "KPI Entry",
			"kpi_definition": KPI_NAME,
			"date": today(),
			"value": 5_000_000.0,
		}).insert(ignore_permissions=True)
		self.assertEqual(doc.value, 5_000_000.0)

	def test_read_kpi_entry(self):
		doc = frappe.get_doc({
			"doctype": "KPI Entry",
			"kpi_definition": KPI_NAME,
			"date": today(),
			"value": 1_000.0,
		}).insert(ignore_permissions=True)
		fetched = frappe.get_doc("KPI Entry", doc.name)
		self.assertEqual(fetched.value, 1_000.0)

	def test_update_value(self):
		doc = frappe.get_doc({
			"doctype": "KPI Entry",
			"kpi_definition": KPI_NAME,
			"date": today(),
			"value": 1.0,
		}).insert(ignore_permissions=True)
		doc.value = 2.0
		doc.save()
		self.assertEqual(frappe.db.get_value("KPI Entry", doc.name, "value"), 2.0)

	def test_delete_kpi_entry(self):
		doc = frappe.get_doc({
			"doctype": "KPI Entry",
			"kpi_definition": KPI_NAME,
			"date": today(),
			"value": 1.0,
		}).insert(ignore_permissions=True)
		name = doc.name
		doc.delete()
		self.assertFalse(frappe.db.exists("KPI Entry", name))


class TestKPIEntryValidations(FrappeTestCase):
	def setUp(self):
		_ensure_brand(TEST_BRAND)
		_ensure_kpi(KPI_NAME, TEST_BRAND)
		_purge_entries(KPI_NAME)

	def tearDown(self):
		_purge_entries(KPI_NAME)

	def test_value_required(self):
		"""Frappe `reqd: 1` rejects missing value (raw ValidationError path)."""
		with self.assertRaises((frappe.MandatoryError, frappe.ValidationError)):
			frappe.get_doc({
				"doctype": "KPI Entry",
				"kpi_definition": KPI_NAME,
				"date": today(),
			}).insert(ignore_permissions=True)

	def test_future_date_rejected(self):
		"""KPI entries are observed history — future dates are nonsensical."""
		tomorrow = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()
		with self.assertRaises(frappe.ValidationError):
			frappe.get_doc({
				"doctype": "KPI Entry",
				"kpi_definition": KPI_NAME,
				"date": tomorrow,
				"value": 1.0,
			}).insert(ignore_permissions=True)

	# Gap-5 — per-KPI policy untuk nilai negatif.
	# Default KPI = count/level (tolak negatif). Opt-in via
	# `allow_negative=1` di KPI Definition untuk KPI delta.
	def test_negative_value_rejected_when_flag_off(self):
		"""KPI default (allow_negative=0) → negatif ditolak."""
		with self.assertRaises(frappe.ValidationError):
			frappe.get_doc({
				"doctype": "KPI Entry",
				"kpi_definition": KPI_NAME,
				"date": today(),
				"value": -10.0,
			}).insert(ignore_permissions=True)

	def test_negative_value_allowed_when_flag_on(self):
		"""KPI dengan allow_negative=1 → negatif diterima (delta-style)."""
		frappe.db.set_value("KPI Definition", KPI_NAME, "allow_negative", 1)
		try:
			doc = frappe.get_doc({
				"doctype": "KPI Entry",
				"kpi_definition": KPI_NAME,
				"date": today(),
				"value": -25.0,
			}).insert(ignore_permissions=True)
			self.assertEqual(doc.value, -25.0)
		finally:
			frappe.db.set_value("KPI Definition", KPI_NAME, "allow_negative", 0)

	def test_positive_value_always_allowed(self):
		"""Nilai positif diterima terlepas dari flag."""
		doc = frappe.get_doc({
			"doctype": "KPI Entry",
			"kpi_definition": KPI_NAME,
			"date": today(),
			"value": 99.0,
		}).insert(ignore_permissions=True)
		self.assertEqual(doc.value, 99.0)

	def test_dedupe_per_kpi_and_date(self):
		"""Two entries with the same (kpi_definition, date) are rejected."""
		frappe.get_doc({
			"doctype": "KPI Entry",
			"kpi_definition": KPI_NAME,
			"date": today(),
			"value": 1.0,
		}).insert(ignore_permissions=True)
		with self.assertRaises(frappe.ValidationError):
			frappe.get_doc({
				"doctype": "KPI Entry",
				"kpi_definition": KPI_NAME,
				"date": today(),
				"value": 2.0,
			}).insert(ignore_permissions=True)


class TestKPIEntryBrandCoherence(FrappeTestCase):
	"""When entry.project is set, project.brand must equal kpi.brand."""

	def setUp(self):
		_ensure_brand(TEST_BRAND)
		_ensure_brand(TEST_BRAND_ALT)
		_ensure_kpi(KPI_NAME, TEST_BRAND)
		_ensure_kpi(KPI_NAME_ALT, TEST_BRAND_ALT)
		_purge_entries(KPI_NAME)
		_purge_entries(KPI_NAME_ALT)
		# Project belonging to TEST_BRAND.
		self.proj_match = self._make_project("KE Coherent Project", TEST_BRAND)
		# Project belonging to a different brand than KPI_NAME.
		self.proj_mismatch = self._make_project("KE Mismatch Project", TEST_BRAND_ALT)

	def tearDown(self):
		_purge_entries(KPI_NAME)
		_purge_entries(KPI_NAME_ALT)
		for name in (self.proj_match, self.proj_mismatch):
			if frappe.db.exists("VT Project", name):
				frappe.delete_doc("VT Project", name, force=True, ignore_permissions=True)

	def _make_project(self, title: str, brand: str) -> str:
		"""Insert a minimal VT Project; returns the new name."""
		# Reuse if already there (test re-run scenario).
		existing = frappe.db.get_value("VT Project", {"title": title}, "name")
		if existing:
			return existing
		return frappe.get_doc({
			"doctype": "VT Project",
			"title": title,
			"brand": brand,
			"project_owner": "Administrator",
			"start_date": "2026-01-01",
			"end_date": "2026-12-31",
		}).insert(ignore_permissions=True).name

	def test_matching_brand_allowed(self):
		doc = frappe.get_doc({
			"doctype": "KPI Entry",
			"kpi_definition": KPI_NAME,
			"date": today(),
			"value": 100.0,
			"project": self.proj_match,
		}).insert(ignore_permissions=True)
		self.assertEqual(doc.project, self.proj_match)

	def test_mismatched_brand_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			frappe.get_doc({
				"doctype": "KPI Entry",
				"kpi_definition": KPI_NAME,
				"date": today(),
				"value": 100.0,
				"project": self.proj_mismatch,
			}).insert(ignore_permissions=True)

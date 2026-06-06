"""Tests for KPI Definition controller.

Covers:
  - Full CRUD lifecycle
  - Validations (kpi_name normalize, formula cap, brand-matches-objective)
  - Rename guard (PK is permanent)
  - on_trash blocks delete while KPI Entries reference this definition
"""
import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import today

from vernon_tasks.okr.doctype.kpi_definition.kpi_definition import (
	KPI_FORMULA_MAX_LEN,
	KPI_NAME_MAX_LEN,
)

TEST_USER = "test_okr@example.com"
TEST_BRAND = "Test KPI Brand"
TEST_BRAND_ALT = "Test KPI Brand Alt"


def _ensure_user():
	if not frappe.db.exists("User", TEST_USER):
		frappe.get_doc({
			"doctype": "User", "email": TEST_USER,
			"first_name": "OKR", "last_name": "Test",
			"enabled": 1, "roles": [{"role": "VT Manager"}]
		}).insert(ignore_permissions=True)


def _ensure_brand(name: str):
	if not frappe.db.exists("VT Brand", name):
		frappe.get_doc({"doctype": "VT Brand", "brand_name": name}).insert(ignore_permissions=True)


def _cleanup_kpi(name: str):
	"""Detach entries (no FK guard at child level) then delete the KPI def."""
	for e in frappe.get_all("KPI Entry", filters={"kpi_definition": name}, pluck="name"):
		frappe.delete_doc("KPI Entry", e, force=True, ignore_permissions=True)
	if frappe.db.exists("KPI Definition", name):
		frappe.delete_doc("KPI Definition", name, force=True, ignore_permissions=True)


class TestKPIDefinitionCRUD(FrappeTestCase):
	def setUp(self):
		_ensure_brand(TEST_BRAND)
		_cleanup_kpi("Test KPI CRUD")

	def tearDown(self):
		_cleanup_kpi("Test KPI CRUD")

	def test_create_kpi_definition(self):
		"""kpi_name is the PK (autoname:field) — name equals it."""
		doc = frappe.get_doc({
			"doctype": "KPI Definition",
			"kpi_name": "Test KPI CRUD",
			"brand": TEST_BRAND,
			"frequency": "Daily",
			"unit": "%",
		}).insert(ignore_permissions=True)
		self.assertEqual(doc.name, "Test KPI CRUD")

	def test_update_unit(self):
		doc = frappe.get_doc({
			"doctype": "KPI Definition",
			"kpi_name": "Test KPI CRUD",
			"brand": TEST_BRAND,
			"frequency": "Daily",
		}).insert(ignore_permissions=True)
		doc.unit = "IDR"
		doc.save()
		self.assertEqual(frappe.db.get_value("KPI Definition", "Test KPI CRUD", "unit"), "IDR")

	def test_delete_kpi_definition(self):
		frappe.get_doc({
			"doctype": "KPI Definition",
			"kpi_name": "Test KPI CRUD",
			"brand": TEST_BRAND,
			"frequency": "Daily",
		}).insert(ignore_permissions=True)
		frappe.delete_doc("KPI Definition", "Test KPI CRUD")
		self.assertFalse(frappe.db.exists("KPI Definition", "Test KPI CRUD"))


class TestKPIDefinitionValidations(FrappeTestCase):
	def setUp(self):
		_ensure_brand(TEST_BRAND)
		_cleanup_kpi("KPI Normalized")
		_cleanup_kpi("KPI Formula")
		_cleanup_kpi("KPI Freq Bad")

	def tearDown(self):
		for n in ("KPI Normalized", "KPI Formula", "KPI Freq Bad"):
			_cleanup_kpi(n)

	def test_kpi_name_normalized(self):
		"""Whitespace runs collapse → predictable PK + no look-alike dupes."""
		doc = frappe.get_doc({
			"doctype": "KPI Definition",
			"kpi_name": "  KPI   Normalized  ",
			"brand": TEST_BRAND,
			"frequency": "Daily",
		}).insert(ignore_permissions=True)
		self.assertEqual(doc.name, "KPI Normalized")

	def test_kpi_name_max_length(self):
		with self.assertRaises(frappe.ValidationError):
			frappe.get_doc({
				"doctype": "KPI Definition",
				"kpi_name": "X" * (KPI_NAME_MAX_LEN + 1),
				"brand": TEST_BRAND,
				"frequency": "Daily",
			}).insert(ignore_permissions=True)

	def test_formula_max_length(self):
		with self.assertRaises(frappe.ValidationError):
			frappe.get_doc({
				"doctype": "KPI Definition",
				"kpi_name": "KPI Formula",
				"brand": TEST_BRAND,
				"frequency": "Daily",
				"formula": "Y" * (KPI_FORMULA_MAX_LEN + 1),
			}).insert(ignore_permissions=True)


class TestKPIDefinitionBrandMatch(FrappeTestCase):
	"""brand must equal objective.brand when both are set."""

	def setUp(self):
		_ensure_user()
		_ensure_brand(TEST_BRAND)
		_ensure_brand(TEST_BRAND_ALT)
		self.obj = frappe.get_doc({
			"doctype": "Objective",
			"title": "KPI Brand Match Objective",
			"brand": TEST_BRAND,
			"period": "2026-Q2",
			"objective_owner": TEST_USER,
			"pdca_phase": "PLAN",
		}).insert(ignore_permissions=True)
		_cleanup_kpi("KPI Brand Mismatch")
		_cleanup_kpi("KPI Brand Match")

	def tearDown(self):
		for n in ("KPI Brand Mismatch", "KPI Brand Match"):
			_cleanup_kpi(n)
		# Objective.on_trash blocks if KRs/KPIs remain — children gone above.
		frappe.delete_doc("Objective", self.obj.name, force=True, ignore_permissions=True)

	def test_mismatched_brand_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			frappe.get_doc({
				"doctype": "KPI Definition",
				"kpi_name": "KPI Brand Mismatch",
				"brand": TEST_BRAND_ALT,
				"frequency": "Daily",
				"objective": self.obj.name,
			}).insert(ignore_permissions=True)

	def test_matching_brand_allowed(self):
		doc = frappe.get_doc({
			"doctype": "KPI Definition",
			"kpi_name": "KPI Brand Match",
			"brand": TEST_BRAND,
			"frequency": "Daily",
			"objective": self.obj.name,
		}).insert(ignore_permissions=True)
		self.assertEqual(doc.brand, TEST_BRAND)


class TestKPIDefinitionRenameGuard(FrappeTestCase):
	def setUp(self):
		_ensure_brand(TEST_BRAND)
		_cleanup_kpi("KPI Rename Old")
		_cleanup_kpi("KPI Rename New")
		frappe.get_doc({
			"doctype": "KPI Definition",
			"kpi_name": "KPI Rename Old",
			"brand": TEST_BRAND,
			"frequency": "Daily",
		}).insert(ignore_permissions=True)

	def tearDown(self):
		_cleanup_kpi("KPI Rename Old")
		_cleanup_kpi("KPI Rename New")

	def test_rename_rejected(self):
		"""kpi_name is the permanent PK; programmatic rename must fail."""
		with self.assertRaises(frappe.ValidationError):
			frappe.rename_doc("KPI Definition", "KPI Rename Old", "KPI Rename New")


class TestKPIDefinitionOnTrash(FrappeTestCase):
	"""on_trash blocks delete while KPI Entries still reference this def."""

	def setUp(self):
		_ensure_brand(TEST_BRAND)
		_cleanup_kpi("KPI With Entries")
		frappe.get_doc({
			"doctype": "KPI Definition",
			"kpi_name": "KPI With Entries",
			"brand": TEST_BRAND,
			"frequency": "Daily",
		}).insert(ignore_permissions=True)

	def tearDown(self):
		_cleanup_kpi("KPI With Entries")

	def test_blocks_when_entries_exist(self):
		frappe.get_doc({
			"doctype": "KPI Entry",
			"kpi_definition": "KPI With Entries",
			"date": today(),
			"value": 1.0,
		}).insert(ignore_permissions=True)
		with self.assertRaises(frappe.ValidationError):
			frappe.delete_doc("KPI Definition", "KPI With Entries")


class TestKPIDefinitionTarget(FrappeTestCase):
	"""target_value sign guard mirrors the KPI Entry value-sign rule.

	spec: 2026-06-07-brand-detail-flow-zones
	"""

	def setUp(self):
		_ensure_brand(TEST_BRAND)
		for n in ("KPI Target Pos", "KPI Target Neg", "KPI Target NegOK"):
			_cleanup_kpi(n)

	def tearDown(self):
		for n in ("KPI Target Pos", "KPI Target Neg", "KPI Target NegOK"):
			_cleanup_kpi(n)

	def test_positive_target_accepted(self):
		doc = frappe.get_doc({
			"doctype": "KPI Definition", "kpi_name": "KPI Target Pos",
			"brand": TEST_BRAND, "frequency": "Daily", "target_value": 90,
		}).insert(ignore_permissions=True)
		self.assertEqual(doc.target_value, 90)

	def test_negative_target_rejected_without_allow_negative(self):
		with self.assertRaises(frappe.ValidationError):
			frappe.get_doc({
				"doctype": "KPI Definition", "kpi_name": "KPI Target Neg",
				"brand": TEST_BRAND, "frequency": "Daily",
				"target_value": -5, "allow_negative": 0,
			}).insert(ignore_permissions=True)

	def test_negative_target_allowed_with_allow_negative(self):
		doc = frappe.get_doc({
			"doctype": "KPI Definition", "kpi_name": "KPI Target NegOK",
			"brand": TEST_BRAND, "frequency": "Daily",
			"target_value": -5, "allow_negative": 1,
		}).insert(ignore_permissions=True)
		self.assertEqual(doc.target_value, -5)

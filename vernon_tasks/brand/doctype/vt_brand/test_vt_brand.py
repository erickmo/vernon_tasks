"""Tests for VT Brand controller.

Covers:
  - Full CRUD lifecycle (create, read, update, delete)
  - Field validations (brand_name normalization, length caps, control chars)
  - Rename guard (PK is permanent per ADR-022)
  - Avatar auto-generation (before_save + after_insert)
  - FK integrity guard (on_trash)

ADR-022: FK integrity moved from API wrapper to doctype controller so standard
REST `DELETE /api/resource/VT Brand/{name}` enforces the same rule.
ADR — Naming: `autoname: field:brand_name` + `allow_rename: 0` makes
`brand_name` the permanent primary key.
"""
import unittest

import frappe

from vernon_tasks.brand.doctype.vt_brand.vt_brand import (
	AVATAR_FILE_PREFIX,
	BRAND_NAME_MAX_LEN,
	DESCRIPTION_MAX_LEN,
)


def _cleanup(brand_name: str) -> None:
	"""Best-effort teardown — delete brand if it exists (ignore FK guard)."""
	# Detach any test project nodes (VT Item, node_type='Project') so on_trash
	# does not block the brand teardown. These test nodes are leaf Projects
	# (no Sprint/Task children), so a flat delete is safe — no nested-set
	# NestedSetChildExistsError to worry about here.
	for proj in frappe.get_all(
		"VT Item", filters={"node_type": "Project", "brand": brand_name}, pluck="name"
	):
		frappe.delete_doc("VT Item", proj, force=True, ignore_permissions=True)
	if frappe.db.exists("VT Brand", brand_name):
		frappe.delete_doc("VT Brand", brand_name, force=True, ignore_permissions=True)


class TestVTBrandCRUD(unittest.TestCase):
	"""Happy-path CRUD: create, read, update, delete."""

	def setUp(self):
		self.brand_name = "TEST-BRAND-CRUD"
		_cleanup(self.brand_name)

	def tearDown(self):
		_cleanup(self.brand_name)

	def test_create_brand(self):
		"""Insert produces a doc whose name equals brand_name (autoname:field)."""
		doc = frappe.get_doc({"doctype": "VT Brand", "brand_name": self.brand_name}).insert()
		self.assertEqual(doc.name, self.brand_name)

	def test_read_brand(self):
		frappe.get_doc({"doctype": "VT Brand", "brand_name": self.brand_name}).insert()
		fetched = frappe.get_doc("VT Brand", self.brand_name)
		self.assertEqual(fetched.brand_name, self.brand_name)

	def test_update_description(self):
		"""Updating non-PK fields is allowed; brand_name (PK) is not."""
		doc = frappe.get_doc({"doctype": "VT Brand", "brand_name": self.brand_name}).insert()
		doc.description = "Updated description"
		doc.save()
		self.assertEqual(
			frappe.db.get_value("VT Brand", self.brand_name, "description"),
			"Updated description",
		)

	def test_delete_brand(self):
		frappe.get_doc({"doctype": "VT Brand", "brand_name": self.brand_name}).insert()
		frappe.delete_doc("VT Brand", self.brand_name)
		self.assertFalse(frappe.db.exists("VT Brand", self.brand_name))


class TestVTBrandValidations(unittest.TestCase):
	"""Validation rules — input normalization + field constraints."""

	def setUp(self):
		self.brand_name = "TEST-BRAND-VALID"
		_cleanup(self.brand_name)
		_cleanup("TEST-BRAND-NORMALIZE")
		_cleanup("BRAND ABC")

	def tearDown(self):
		for n in (self.brand_name, "TEST-BRAND-NORMALIZE", "BRAND ABC"):
			_cleanup(n)

	def test_brand_name_required(self):
		"""Empty brand_name must be rejected.

		Frappe's autoname:field stage raises ValidationError("... is required")
		before our validate() runs, so we accept either MandatoryError
		(post-validate path) or plain ValidationError (autoname path).
		"""
		with self.assertRaises((frappe.MandatoryError, frappe.ValidationError)):
			frappe.get_doc({"doctype": "VT Brand", "brand_name": ""}).insert()

	def test_brand_name_unique(self):
		"""Duplicate brand_name (PK + unique) must be rejected."""
		frappe.get_doc({"doctype": "VT Brand", "brand_name": self.brand_name}).insert()
		with self.assertRaises((frappe.DuplicateEntryError, frappe.UniqueValidationError)):
			frappe.get_doc({"doctype": "VT Brand", "brand_name": self.brand_name}).insert()

	def test_brand_name_normalized_whitespace(self):
		"""Leading/trailing whitespace trimmed; internal runs collapsed to single space."""
		doc = frappe.get_doc(
			{"doctype": "VT Brand", "brand_name": "  BRAND   ABC  "}
		).insert()
		self.assertEqual(doc.brand_name, "BRAND ABC")

	def test_brand_name_max_length(self):
		"""Reject brand_name longer than BRAND_NAME_MAX_LEN — Data column cap."""
		too_long = "X" * (BRAND_NAME_MAX_LEN + 1)
		with self.assertRaises(frappe.ValidationError):
			frappe.get_doc({"doctype": "VT Brand", "brand_name": too_long}).insert()

	def test_brand_name_rejects_control_chars(self):
		"""Control chars (newline/tab) in brand_name are disallowed."""
		with self.assertRaises(frappe.ValidationError):
			frappe.get_doc(
				{"doctype": "VT Brand", "brand_name": "BAD\nNAME"}
			).insert()

	def test_description_max_length(self):
		"""Description longer than DESCRIPTION_MAX_LEN rejected."""
		doc = frappe.get_doc(
			{
				"doctype": "VT Brand",
				"brand_name": self.brand_name,
				"description": "Y" * (DESCRIPTION_MAX_LEN + 1),
			}
		)
		with self.assertRaises(frappe.ValidationError):
			doc.insert()


class TestVTBrandRenameGuard(unittest.TestCase):
	"""ADR-022 — brand_name is permanent. Rename must be rejected."""

	def setUp(self):
		self.brand_name = "TEST-BRAND-RENAME"
		_cleanup(self.brand_name)
		_cleanup("TEST-BRAND-RENAMED")

	def tearDown(self):
		_cleanup(self.brand_name)
		_cleanup("TEST-BRAND-RENAMED")

	def test_rename_rejected(self):
		"""frappe.rename_doc must raise; brand_name is the permanent PK."""
		frappe.get_doc({"doctype": "VT Brand", "brand_name": self.brand_name}).insert()
		with self.assertRaises(frappe.ValidationError):
			frappe.rename_doc("VT Brand", self.brand_name, "TEST-BRAND-RENAMED")


class TestVTBrandAvatar(unittest.TestCase):
	"""Avatar auto-generation lifecycle."""

	def setUp(self):
		self.brand_name = "TEST-BRAND-AVATAR"
		_cleanup(self.brand_name)

	def tearDown(self):
		_cleanup(self.brand_name)

	def test_after_insert_generates_avatar(self):
		"""New brand with no logo gets an auto-generated avatar File URL."""
		doc = frappe.get_doc({"doctype": "VT Brand", "brand_name": self.brand_name}).insert()
		# Reload — after_insert uses db_set so in-memory may be stale.
		doc.reload()
		self.assertTrue(doc.logo, "logo should be auto-populated after insert")
		self.assertIn(AVATAR_FILE_PREFIX, doc.logo)

	def test_before_save_regenerates_when_logo_cleared(self):
		"""Clearing the logo on update triggers before_save to regenerate."""
		doc = frappe.get_doc({"doctype": "VT Brand", "brand_name": self.brand_name}).insert()
		doc.reload()
		doc.logo = ""
		doc.save()
		self.assertTrue(doc.logo)
		self.assertIn(AVATAR_FILE_PREFIX, doc.logo)

	def test_custom_logo_preserved(self):
		"""User-uploaded logo (not avatar prefix) must NOT be overwritten."""
		doc = frappe.get_doc(
			{
				"doctype": "VT Brand",
				"brand_name": self.brand_name,
				"logo": "/files/custom-user-logo.png",
			}
		).insert()
		doc.reload()
		# after_insert short-circuits because logo is non-empty.
		self.assertEqual(doc.logo, "/files/custom-user-logo.png")


class TestVTBrandFKGuard(unittest.TestCase):
	"""ADR-022 — on_trash blocks delete when projects still link to brand."""

	def setUp(self):
		self.brand_name = "TEST-BRAND-FK-GUARD"
		self.project_title = "TEST-PROJ-FK-GUARD"
		_cleanup(self.brand_name)
		_cleanup("TEST-BRAND-DELETABLE")

	def tearDown(self):
		_cleanup(self.brand_name)
		_cleanup("TEST-BRAND-DELETABLE")

	def test_on_trash_blocks_when_linked_by_project(self):
		"""Delete must raise when ≥1 project node still references the brand.

		A project is now a VT Item node (node_type='Project') carrying the
		`brand` Link. Field renames on seed: project_owner -> owner_user.
		"""
		frappe.get_doc({"doctype": "VT Brand", "brand_name": self.brand_name}).insert()
		frappe.get_doc(
			{
				"doctype": "VT Item",
				"node_type": "Project",
				"parent_vt_item": None,
				"title": self.project_title,
				"brand": self.brand_name,
				"owner_user": "Administrator",
				"start_date": "2026-01-01",
				"end_date": "2026-12-31",
			}
		).insert(ignore_permissions=True)
		with self.assertRaises(frappe.ValidationError):
			frappe.delete_doc("VT Brand", self.brand_name)

	def test_on_trash_allows_when_no_links(self):
		"""Delete must succeed when no projects link to the brand."""
		frappe.get_doc({"doctype": "VT Brand", "brand_name": "TEST-BRAND-DELETABLE"}).insert()
		frappe.delete_doc("VT Brand", "TEST-BRAND-DELETABLE")
		self.assertFalse(frappe.db.exists("VT Brand", "TEST-BRAND-DELETABLE"))

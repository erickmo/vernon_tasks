"""Tests for VT Brand controller — covers on_trash FK guard.

ADR-022: FK integrity moved from API wrapper to doctype controller so standard
REST `DELETE /api/resource/VT Brand/{name}` enforces the same rule.
"""
import frappe
import unittest


class TestVTBrand(unittest.TestCase):
	def test_create_brand(self):
		name = "TEST-BRAND-X"
		if not frappe.db.exists("VT Brand", name):
			doc = frappe.get_doc({"doctype": "VT Brand", "brand_name": name}).insert()
			self.assertEqual(doc.name, name)

	def test_on_trash_blocks_when_linked_by_project(self):
		"""ADR-022 — deleting brand linked by VT Project must raise ValidationError."""
		brand_name = "TEST-BRAND-FK-GUARD"
		project_title = "TEST-PROJ-FK-GUARD"
		# arrange — brand + project referencing brand
		if not frappe.db.exists("VT Brand", brand_name):
			frappe.get_doc({"doctype": "VT Brand", "brand_name": brand_name}).insert()
		if not frappe.db.exists("VT Project", {"title": project_title}):
			frappe.get_doc(
				{
					"doctype": "VT Project",
					"title": project_title,
					"brand": brand_name,
					"project_owner": "Administrator",
					"start_date": "2026-01-01",
					"end_date": "2026-12-31",
				}
			).insert(ignore_permissions=True)
		# act + assert
		with self.assertRaises(frappe.ValidationError):
			frappe.delete_doc("VT Brand", brand_name)

	def test_on_trash_allows_when_no_links(self):
		brand_name = "TEST-BRAND-DELETABLE"
		if not frappe.db.exists("VT Brand", brand_name):
			frappe.get_doc({"doctype": "VT Brand", "brand_name": brand_name}).insert()
		frappe.delete_doc("VT Brand", brand_name)
		self.assertFalse(frappe.db.exists("VT Brand", brand_name))

import frappe
import unittest


class TestVTBrand(unittest.TestCase):
	def test_create_brand(self):
		name = "TEST-BRAND-X"
		if not frappe.db.exists("VT Brand", name):
			doc = frappe.get_doc({"doctype": "VT Brand", "brand_name": name}).insert()
			self.assertEqual(doc.name, name)

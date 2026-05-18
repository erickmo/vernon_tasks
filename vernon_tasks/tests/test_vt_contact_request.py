import frappe
import unittest


class TestVtContactRequest(unittest.TestCase):
    def tearDown(self):
        frappe.db.rollback()

    def test_doctype_exists(self):
        meta = frappe.get_meta("VT Contact Request")
        self.assertEqual(meta.name, "VT Contact Request")

    def test_required_fields_present(self):
        meta = frappe.get_meta("VT Contact Request")
        fieldnames = [f.fieldname for f in meta.fields]
        for required in ("full_name", "email", "message", "status"):
            self.assertIn(required, fieldnames, f"Missing field: {required}")

    def test_can_insert_record(self):
        doc = frappe.get_doc({
            "doctype": "VT Contact Request",
            "full_name": "Test User",
            "email": "test@example.com",
            "message": "Hello world",
        })
        doc.insert(ignore_permissions=True)
        self.assertTrue(frappe.db.exists("VT Contact Request", doc.name))

    def test_default_status_is_new(self):
        doc = frappe.get_doc({
            "doctype": "VT Contact Request",
            "full_name": "Status Test",
            "email": "status@example.com",
            "message": "Check default",
        })
        doc.insert(ignore_permissions=True)
        saved = frappe.get_doc("VT Contact Request", doc.name)
        self.assertEqual(saved.status, "New")

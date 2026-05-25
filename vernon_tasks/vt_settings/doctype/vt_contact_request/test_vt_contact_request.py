"""Tests for VT Contact Request controller."""
import frappe
from frappe.tests.utils import FrappeTestCase

from vernon_tasks.vt_settings.doctype.vt_contact_request.vt_contact_request import (
	FULL_NAME_MAX_LEN,
	MESSAGE_MAX_LEN,
)


class _ContactBase(FrappeTestCase):
	def setUp(self):
		self._created: list[str] = []

	def tearDown(self):
		for name in self._created:
			if frappe.db.exists("VT Contact Request", name):
				frappe.delete_doc("VT Contact Request", name, force=True, ignore_permissions=True)

	def _make(self, **overrides):
		base = {
			"doctype": "VT Contact Request",
			"full_name": "Jane Doe",
			"email": "jane@example.com",
			"company": "Acme",
			"team_size": "11-50",
			"message": "Hello, interested in the product.",
			"status": "New",
		}
		base.update(overrides)
		doc = frappe.get_doc(base).insert(ignore_permissions=True)
		self._created.append(doc.name)
		return doc


class TestContactRequestCRUD(_ContactBase):
	def test_create(self):
		doc = self._make()
		self.assertTrue(doc.name.startswith("VT-CONTACT-"))

	def test_email_normalized_to_lower(self):
		doc = self._make(email="  JANE@EXAMPLE.COM  ")
		self.assertEqual(doc.email, "jane@example.com")

	def test_name_normalized(self):
		doc = self._make(full_name="  Jane   Doe  ")
		self.assertEqual(doc.full_name, "Jane Doe")


class TestContactRequestValidations(_ContactBase):
	def test_invalid_email_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(email="not-an-email")

	def test_full_name_max_length(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(full_name="X" * (FULL_NAME_MAX_LEN + 1))

	def test_message_max_length(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(message="Y" * (MESSAGE_MAX_LEN + 1))

	def test_invalid_status_rejected(self):
		"""Frappe Select field rejects unknown options."""
		with self.assertRaises(frappe.ValidationError):
			self._make(status="Pending")

	def test_workflow_status_transition(self):
		doc = self._make(status="New")
		doc.status = "Contacted"
		doc.save()
		self.assertEqual(doc.status, "Contacted")

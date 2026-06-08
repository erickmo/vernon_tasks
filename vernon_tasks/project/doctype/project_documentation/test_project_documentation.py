"""Tests for Project Documentation child table (on a Project-type VT Item node).

Seeds the parent in the unified VT Item tree (node_type="Project") rather than
the legacy VT Project doctype. The documentation child table lives on the VT
Item node (legacy VT Project.project_owner -> VT Item.owner_user); the child
controller's own validations are unchanged and fire on the parent's save.
"""
import frappe
from frappe.tests.utils import FrappeTestCase

from vernon_tasks.project.doctype.project_documentation.project_documentation import (
	DOC_CONTENT_MAX_LEN,
	DOC_TITLE_MAX_LEN,
)

OWNER_EMAIL = "test_doc@example.com"
TEST_BRAND = "Test Doc Brand"


def _ensure_brand():
	if not frappe.db.exists("VT Brand", TEST_BRAND):
		frappe.get_doc({"doctype": "VT Brand", "brand_name": TEST_BRAND}).insert(ignore_permissions=True)


def _ensure_user():
	if not frappe.db.exists("User", OWNER_EMAIL):
		frappe.get_doc({
			"doctype": "User", "email": OWNER_EMAIL,
			"first_name": "D", "last_name": "T",
			"enabled": 1, "roles": [{"role": "VT Manager"}],
		}).insert(ignore_permissions=True)


class _DocBase(FrappeTestCase):
	def setUp(self):
		_ensure_brand()
		_ensure_user()
		self.project = frappe.get_doc({
			"doctype": "VT Item",
			"node_type": "Project",
			"title": "Doc Test Project",
			"brand": TEST_BRAND,
			"owner_user": OWNER_EMAIL,
			"start_date": "2026-05-01",
			"end_date": "2026-05-31",
		}).insert(ignore_permissions=True)

	def tearDown(self):
		frappe.delete_doc("VT Item", self.project.name, force=True, ignore_permissions=True)

	def _append(self, **fields):
		row = {"doc_title": "Architecture", "content": "Notes…"}
		row.update(fields)
		self.project.append("documentation", row)
		return self.project


class TestDoc(_DocBase):
	def test_create(self):
		self._append().save()
		self.assertEqual(self.project.documentation[0].content, "Notes…")

	def test_title_max_length(self):
		self._append(doc_title="X" * (DOC_TITLE_MAX_LEN + 1))
		with self.assertRaises(frappe.ValidationError):
			self.project.save()

	def test_content_max_length(self):
		self._append(content="Y" * (DOC_CONTENT_MAX_LEN + 1))
		with self.assertRaises(frappe.ValidationError):
			self.project.save()

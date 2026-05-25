"""Tests for Project Milestone child table."""
import frappe
from frappe.tests.utils import FrappeTestCase

from vernon_tasks.project.doctype.project_milestone.project_milestone import MILESTONE_TITLE_MAX_LEN

OWNER_EMAIL = "test_milestone@example.com"
TEST_BRAND = "Test Milestone Brand"


def _ensure_brand():
	if not frappe.db.exists("VT Brand", TEST_BRAND):
		frappe.get_doc({"doctype": "VT Brand", "brand_name": TEST_BRAND}).insert(ignore_permissions=True)


def _ensure_user():
	if not frappe.db.exists("User", OWNER_EMAIL):
		frappe.get_doc({
			"doctype": "User", "email": OWNER_EMAIL,
			"first_name": "M", "last_name": "T",
			"enabled": 1, "roles": [{"role": "VT Manager"}],
		}).insert(ignore_permissions=True)


class _MSBase(FrappeTestCase):
	def setUp(self):
		_ensure_brand()
		_ensure_user()
		self.project = frappe.get_doc({
			"doctype": "VT Project",
			"title": "Milestone Test Project",
			"brand": TEST_BRAND,
			"project_owner": OWNER_EMAIL,
			"start_date": "2026-05-01",
			"end_date": "2026-05-31",
		}).insert(ignore_permissions=True)

	def tearDown(self):
		frappe.delete_doc("VT Project", self.project.name, force=True, ignore_permissions=True)

	def _append(self, **fields):
		row = {"milestone_title": "MVP Launch", "status": "Open"}
		row.update(fields)
		self.project.append("milestones", row)
		return self.project


class TestMilestone(_MSBase):
	def test_create(self):
		self._append().save()
		self.assertEqual(len(self.project.milestones), 1)

	def test_title_normalized(self):
		self._append(milestone_title="  MVP   Launch  ").save()
		self.assertEqual(self.project.milestones[0].milestone_title, "MVP Launch")

	def test_title_max_length(self):
		self._append(milestone_title="X" * (MILESTONE_TITLE_MAX_LEN + 1))
		with self.assertRaises(frappe.ValidationError):
			self.project.save()

	def test_due_date_inside_project_range(self):
		self._append(due_date="2026-05-15").save()
		self.assertEqual(str(self.project.milestones[0].due_date), "2026-05-15")

	def test_due_date_outside_project_range_rejected(self):
		self._append(due_date="2026-06-15")
		with self.assertRaises(frappe.ValidationError):
			self.project.save()

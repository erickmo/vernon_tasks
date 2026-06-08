"""Tests for Project Team Member (child table on a Project-type VT Item node).

Seeds the parent in the unified VT Item tree (node_type="Project") rather than
the legacy VT Project doctype. The team_members child table lives on the VT
Item node (legacy VT Project.project_owner -> VT Item.owner_user); the child
controller's own validations are unchanged and fire on the parent's save.
"""
import frappe
from frappe.tests.utils import FrappeTestCase

OWNER_EMAIL = "test_ptm_owner@example.com"
MEMBER_EMAIL = "test_ptm_member@example.com"
DEPUTY_EMAIL = "test_ptm_deputy@example.com"
TEST_BRAND = "Test PTM Brand"


def _ensure_brand():
	if not frappe.db.exists("VT Brand", TEST_BRAND):
		frappe.get_doc({"doctype": "VT Brand", "brand_name": TEST_BRAND}).insert(ignore_permissions=True)


def _ensure_user(email: str):
	if not frappe.db.exists("User", email):
		frappe.get_doc({
			"doctype": "User", "email": email,
			"first_name": email.split("@")[0], "last_name": "T",
			"enabled": 1, "roles": [{"role": "VT Member"}],
		}).insert(ignore_permissions=True)


class _PTMBase(FrappeTestCase):
	def setUp(self):
		_ensure_brand()
		_ensure_user(OWNER_EMAIL)
		_ensure_user(MEMBER_EMAIL)
		_ensure_user(DEPUTY_EMAIL)
		self.project = frappe.get_doc({
			"doctype": "VT Item",
			"node_type": "Project",
			"title": "PTM Test Project",
			"brand": TEST_BRAND,
			"owner_user": OWNER_EMAIL,
			"start_date": "2026-05-01",
			"end_date": "2026-05-31",
		}).insert(ignore_permissions=True)

	def tearDown(self):
		frappe.delete_doc("VT Item", self.project.name, force=True, ignore_permissions=True)

	def _append(self, **fields):
		row = {"user": MEMBER_EMAIL, "role": "Member"}
		row.update(fields)
		self.project.append("team_members", row)
		return self.project


class TestPTMCRUD(_PTMBase):
	def test_create_member(self):
		self._append().save()
		self.assertEqual(len(self.project.team_members), 1)

	def test_create_deputy_leader(self):
		self._append(user=DEPUTY_EMAIL, role="Member", is_also_leader=1).save()
		self.assertEqual(self.project.team_members[0].is_also_leader, 1)


class TestPTMValidations(_PTMBase):
	def test_nonexistent_user_rejected(self):
		self._append(user="ghost@example.com")
		with self.assertRaises(frappe.ValidationError):
			self.project.save()

	def test_owner_with_also_leader_rejected(self):
		"""Owner is above Leader — 'Also Leader' is meaningless and rejected."""
		self._append(user=DEPUTY_EMAIL, role="Owner", is_also_leader=1)
		with self.assertRaises(frappe.ValidationError):
			self.project.save()

	def test_leader_role_allowed(self):
		self._append(user=DEPUTY_EMAIL, role="Leader").save()
		self.assertEqual(self.project.team_members[0].role, "Leader")

"""Tests for VT Project controller."""
import frappe
from frappe.tests.utils import FrappeTestCase

from vernon_tasks.project.doctype.vt_project.vt_project import (
	PROJECT_TITLE_MAX_LEN,
	STATUS_CLOSED,
	is_user_in_project,
	is_user_leader,
	is_user_owner,
)

OWNER_EMAIL = "test_proj_owner@example.com"
LEADER_EMAIL = "test_proj_leader@example.com"
MEMBER_EMAIL = "test_proj_member@example.com"
ALT_EMAIL = "test_proj_alt@example.com"
DEFAULT_BRAND = "Default"
ALT_BRAND = "Default Alt"


def _ensure_brand(name: str = DEFAULT_BRAND):
	if not frappe.db.exists("VT Brand", name):
		frappe.get_doc({"doctype": "VT Brand", "brand_name": name}).insert(ignore_permissions=True)


def _ensure_user(email: str, role: str = "VT Member"):
	if not frappe.db.exists("User", email):
		frappe.get_doc({
			"doctype": "User", "email": email,
			"first_name": email.split("@")[0], "last_name": "Test",
			"enabled": 1, "roles": [{"role": role}],
		}).insert(ignore_permissions=True)


class _ProjBase(FrappeTestCase):
	def setUp(self):
		_ensure_brand(DEFAULT_BRAND)
		_ensure_brand(ALT_BRAND)
		_ensure_user(OWNER_EMAIL, "VT Manager")
		_ensure_user(LEADER_EMAIL, "VT Leader")
		_ensure_user(MEMBER_EMAIL, "VT Member")
		_ensure_user(ALT_EMAIL, "VT Member")
		self._created: list[str] = []

	def tearDown(self):
		for name in self._created:
			# Detach any tasks/sprints so on_trash doesn't block.
			for t in frappe.get_all("VT Task", filters={"project": name}, pluck="name"):
				frappe.delete_doc("VT Task", t, force=True, ignore_permissions=True)
			for s in frappe.get_all("VT Sprint", filters={"project": name}, pluck="name"):
				frappe.delete_doc("VT Sprint", s, force=True, ignore_permissions=True)
			if frappe.db.exists("VT Project", name):
				frappe.delete_doc("VT Project", name, force=True, ignore_permissions=True)

	def _make(self, **overrides):
		base = {
			"doctype": "VT Project",
			"title": "Test Project",
			"brand": DEFAULT_BRAND,
			"project_owner": OWNER_EMAIL,
			"project_leader": LEADER_EMAIL,
			"start_date": "2026-05-01",
			"end_date": "2026-05-31",
			"pdca_phase": "PLAN",
			"status": "Open",
		}
		base.update(overrides)
		doc = frappe.get_doc(base).insert(ignore_permissions=True)
		self._created.append(doc.name)
		return doc


class TestVTProjectCRUD(_ProjBase):
	def test_create(self):
		doc = self._make()
		self.assertTrue(doc.name.startswith("PROJ-"))

	def test_update_title(self):
		doc = self._make()
		doc.title = "Updated"
		doc.save()
		self.assertEqual(frappe.db.get_value("VT Project", doc.name, "title"), "Updated")


class TestVTProjectValidations(_ProjBase):
	def test_title_normalized(self):
		doc = self._make(title="  Build   Platform  ")
		self.assertEqual(doc.title, "Build Platform")

	def test_title_max_length(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(title="X" * (PROJECT_TITLE_MAX_LEN + 1))

	def test_end_before_start_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(start_date="2026-05-31", end_date="2026-05-01")

	def test_end_equal_start_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(start_date="2026-05-15", end_date="2026-05-15")

	def test_owner_in_team_members_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(team_members=[{"user": OWNER_EMAIL, "role": "Member"}])

	def test_leader_in_team_members_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(team_members=[{"user": LEADER_EMAIL, "role": "Member"}])


class TestVTProjectPDCA(_ProjBase):
	def test_valid_transition(self):
		doc = self._make(pdca_phase="PLAN")
		doc.pdca_phase = "DO"
		doc.save()
		self.assertEqual(doc.pdca_phase, "DO")

	def test_invalid_transition_rejected(self):
		doc = self._make(pdca_phase="PLAN")
		doc.pdca_phase = "CHECK"
		with self.assertRaises(frappe.ValidationError):
			doc.save()

	def test_pdca_closed_locks_status(self):
		doc = self._make(pdca_phase="PLAN")
		doc.pdca_phase = "DO"
		doc.save()
		doc.pdca_phase = "CHECK"
		doc.save()
		doc.pdca_phase = "CLOSED"
		doc.save()
		self.assertEqual(doc.status, STATUS_CLOSED)


class TestVTProjectObjectiveBrand(_ProjBase):
	"""project.brand must match linked Objective's brand."""

	def setUp(self):
		super().setUp()
		# Objective on DEFAULT_BRAND.
		self.obj = frappe.get_doc({
			"doctype": "Objective",
			"title": "Proj Brand Match Obj",
			"brand": DEFAULT_BRAND,
			"period": "2026-Q2",
			"objective_owner": OWNER_EMAIL,
			"pdca_phase": "PLAN",
		}).insert(ignore_permissions=True)

	def tearDown(self):
		# Project teardown may leave the Objective standing — clean up here.
		super().tearDown()
		if frappe.db.exists("Objective", self.obj.name):
			frappe.delete_doc("Objective", self.obj.name, force=True, ignore_permissions=True)

	def test_mismatched_brand_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._make(brand=ALT_BRAND, objective=self.obj.name)

	def test_matching_brand_allowed(self):
		doc = self._make(objective=self.obj.name)
		self.assertEqual(doc.objective, self.obj.name)


class TestVTProjectHelpers(_ProjBase):
	def test_is_user_owner(self):
		doc = self._make()
		self.assertTrue(is_user_owner(doc.name, OWNER_EMAIL))
		self.assertFalse(is_user_owner(doc.name, MEMBER_EMAIL))

	def test_is_user_leader_via_project_leader(self):
		doc = self._make()
		self.assertTrue(is_user_leader(doc.name, LEADER_EMAIL))

	def test_is_user_leader_via_team_member_role(self):
		doc = self._make(project_leader=None, team_members=[{"user": MEMBER_EMAIL, "role": "Leader"}])
		self.assertTrue(is_user_leader(doc.name, MEMBER_EMAIL))

	def test_owner_is_implicitly_in_project(self):
		doc = self._make()
		self.assertTrue(is_user_in_project(doc.name, OWNER_EMAIL))


class TestVTProjectOnTrash(_ProjBase):
	def test_blocks_when_task_linked(self):
		doc = self._make()
		frappe.get_doc({
			"doctype": "VT Task", "title": "Trash Blocker",
			"project": doc.name, "weight": 1.0,
		}).insert(ignore_permissions=True)
		with self.assertRaises(frappe.ValidationError):
			frappe.delete_doc("VT Project", doc.name)

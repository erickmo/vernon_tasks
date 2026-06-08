# Tests for onboarding state derivation + dismiss.
#
# Onboarding completion is DERIVED from data living in the unified VT Item tree:
#   - "buat_proyek": user owns/leads/is-a-team-member of a Project node
#     (legacy VT Project.project_owner/project_leader → owner_user/leader_user;
#      legacy Project Team Member parenttype 'VT Project' → 'VT Item').
#   - "buat_task": user has a Task node (legacy VT Task.assigned_to → owner_user,
#      or the Frappe document `owner`).
# Seeds therefore create VT Item nodes/child rows, not legacy doctypes.
import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_tasks.task.api.onboarding import get_onboarding_state, dismiss_onboarding

_USER = "onb_state@test.local"
_TEAM_USER = "onb_member@test.local"


def _ensure_user(email):
	if not frappe.db.exists("User", email):
		frappe.get_doc({
			"doctype": "User", "email": email, "first_name": "Onb",
			"send_welcome_email": 0, "enabled": 1,
		}).insert(ignore_permissions=True)
		frappe.get_doc("User", email).add_roles("VT Member")
	return email


class TestOnboardingState(FrappeTestCase):
	def setUp(self):
		self.user = _ensure_user(_USER)
		self.member = _ensure_user(_TEAM_USER)
		frappe.defaults.clear_default(key="vt_onboarding_dismissed", parent=self.user)

	def tearDown(self):
		frappe.set_user("Administrator")

	def test_fresh_user_all_incomplete(self):
		frappe.set_user(self.user)
		state = get_onboarding_state()
		self.assertEqual(state["progress"]["total"], 4)
		keys_done = {s["key"]: s["is_complete"] for s in state["steps"]}
		self.assertFalse(keys_done["buat_proyek"])  # fresh user leads no project
		self.assertTrue(state["show"])

	def test_project_step_completes_with_project(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("VT Brand", "OnbBrand"):
			frappe.get_doc({"doctype": "VT Brand", "brand_name": "OnbBrand"}).insert(ignore_permissions=True)
		# Project lives in the VT Item tree as a root Project node.
		# project_owner/project_leader → owner_user/leader_user.
		frappe.get_doc({
			"doctype": "VT Item",
			"node_type": "Project",
			"title": "Onb Proj",
			"brand": "OnbBrand",
			"owner_user": self.user,
			"leader_user": self.user,
			"start_date": "2026-01-01",
			"end_date": "2026-12-31",
			"health_status": "Open",
		}).insert(ignore_permissions=True)
		frappe.set_user(self.user)
		state = get_onboarding_state()
		done = {s["key"]: s["is_complete"] for s in state["steps"]}
		self.assertTrue(done["buat_proyek"])

	def test_team_step_completes_with_member(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("VT Brand", "OnbBrand"):
			frappe.get_doc({"doctype": "VT Brand", "brand_name": "OnbBrand"}).insert(ignore_permissions=True)
		# Project node with a team member child row (parenttype is now 'VT Item').
		frappe.get_doc({
			"doctype": "VT Item",
			"node_type": "Project",
			"title": "Onb Team Proj",
			"brand": "OnbBrand",
			"owner_user": self.user,
			"leader_user": self.user,
			"start_date": "2026-01-01",
			"end_date": "2026-12-31",
			"health_status": "Open",
			"team_members": [{"user": self.member, "role": "Member"}],
		}).insert(ignore_permissions=True)
		frappe.set_user(self.user)
		state = get_onboarding_state()
		done = {s["key"]: s["is_complete"] for s in state["steps"]}
		self.assertTrue(done["buat_proyek"])
		self.assertTrue(done["tambah_tim"])

	def test_task_step_completes_with_task(self):
		frappe.set_user("Administrator")
		# Project node to parent the Task (Task parent must be Project/Sprint).
		project = frappe.get_doc({
			"doctype": "VT Item",
			"node_type": "Project",
			"title": "Onb Task Proj",
			"owner_user": self.user,
			"leader_user": self.user,
			"start_date": "2026-01-01",
			"end_date": "2026-12-31",
			"health_status": "Open",
		}).insert(ignore_permissions=True)
		# Task node assigned to the user (legacy assigned_to → owner_user).
		frappe.get_doc({
			"doctype": "VT Item",
			"node_type": "Task",
			"title": "Onb Task",
			"parent_vt_item": project.name,
			"owner_user": self.user,
		}).insert(ignore_permissions=True)
		frappe.set_user(self.user)
		state = get_onboarding_state()
		done = {s["key"]: s["is_complete"] for s in state["steps"]}
		self.assertTrue(done["buat_task"])

	def test_dismiss_hides_card(self):
		frappe.set_user(self.user)
		dismiss_onboarding()
		self.assertFalse(get_onboarding_state()["show"])

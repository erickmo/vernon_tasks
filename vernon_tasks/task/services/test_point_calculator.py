import frappe
from frappe.tests.utils import FrappeTestCase

# Migrated to the unified VT Item tree: Projects/Tasks are VT Item nodes
# (node_type='Project'/'Task'). The legacy VT Task.assigned_to assignee Link is
# now owner_user on the Task node; the legacy VT Task.project Link is the
# parent_vt_item tree relation (Task is a child of the Project node).
OWNER = "test_pts_owner@example.com"
LEADER = "test_pts_leader@example.com"
MEMBER = "test_pts_member@example.com"
_BRAND = "TEST-PTS-BRAND"


def _ensure_brand():
	if not frappe.db.exists("VT Brand", _BRAND):
		frappe.get_doc({
			"doctype": "VT Brand",
			"brand_name": _BRAND,
		}).insert(ignore_permissions=True)
	return _BRAND


def setup_users():
	for email, role in [(OWNER, "VT Manager"), (LEADER, "VT Leader"), (MEMBER, "VT Member")]:
		if not frappe.db.exists("User", email):
			frappe.get_doc({
				"doctype": "User", "email": email,
				"first_name": email.split("@")[0], "last_name": "P",
				"enabled": 1, "roles": [{"role": role}]
			}).insert(ignore_permissions=True)


def make_task():
	setup_users()
	proj = frappe.get_doc({
		"doctype": "VT Item", "node_type": "Project",
		"title": "Points Test Project",
		"brand": _ensure_brand(),
		"owner_user": OWNER, "leader_user": LEADER,
		"start_date": "2026-05-01", "end_date": "2026-05-31",
		"pdca_phase": "PLAN", "health_status": "Open",
		"team_members": [{"user": MEMBER, "role": "Member"}]
	})
	proj.insert(ignore_permissions=True)
	task = frappe.get_doc({
		"doctype": "VT Item", "node_type": "Task",
		"title": "Points Task",
		"parent_vt_item": proj.name, "owner_user": MEMBER,
		"priority": "Medium", "pdca_phase": "DO",
		"kanban_status": "In Progress",
		"weight": 5.0, "estimated_minutes": 8.0,
		"start_date": "2026-05-10", "deadline": "2026-05-20",
		"revision_count": 0,
		"base_points": 50,
	})
	task.insert(ignore_permissions=True)
	return task, proj


class TestPointCalculator(FrappeTestCase):
	def test_base_points_on_time(self):
		from vernon_tasks.task.services.point_calculator import compute_points
		result = compute_points(weight=5.0, deadline="2026-05-20", completion_date="2026-05-20", revision_count=0)
		settings = frappe.get_single("VT Settings")
		expected_base = int(round(5.0 * (settings.weight_multiplier or 10)))
		self.assertEqual(result["base"], expected_base)
		self.assertEqual(result["early_bonus"], 0)
		self.assertEqual(result["late_penalty"], 0)
		self.assertEqual(result["earned"], expected_base)

	def test_early_bonus_applied(self):
		from vernon_tasks.task.services.point_calculator import compute_points
		result = compute_points(weight=5.0, deadline="2026-05-20", completion_date="2026-05-18", revision_count=0)
		self.assertGreater(result["early_bonus"], 0)
		self.assertGreater(result["earned"], result["base"])

	def test_late_penalty_applied(self):
		from vernon_tasks.task.services.point_calculator import compute_points
		result = compute_points(weight=5.0, deadline="2026-05-20", completion_date="2026-05-22", revision_count=0)
		self.assertGreater(result["late_penalty"], 0)
		self.assertLess(result["earned"], result["base"])

	def test_revision_deduction(self):
		from vernon_tasks.task.services.point_calculator import compute_points
		result = compute_points(weight=5.0, deadline="2026-05-20", completion_date="2026-05-20", revision_count=2)
		self.assertLess(result["earned"], result["base"])

	def test_override_points_creates_log(self):
		from vernon_tasks.task.services.point_calculator import override_points
		task, proj = make_task()
		frappe.db.set_value("VT Item", task.name, "earned_points", 50)
		override_points(task.name, new_points=80, reason="Excellent work", overridden_by=LEADER)
		task_doc = frappe.get_doc("VT Item", task.name)
		self.assertEqual(task_doc.leader_override_points, 80)
		log = frappe.get_all(
			"Task Point Log",
			filters={"task": task.name, "transaction_type": "leader_override"},
			fields=["amount", "original_amount"]
		)
		self.assertEqual(len(log), 1)
		self.assertEqual(log[0].original_amount, 50)
		frappe.db.delete("Task Point Log", {"task": task.name})
		task.delete()
		proj.delete()

	def test_apply_revision_deduction_increments_count(self):
		from vernon_tasks.task.services.point_calculator import apply_revision_deduction
		task, proj = make_task()
		apply_revision_deduction(task.name)
		updated = frappe.db.get_value("VT Item", task.name, "revision_count")
		self.assertEqual(updated, 1)
		log = frappe.get_all("Task Point Log", filters={"task": task.name, "transaction_type": "revision_deduction"})
		self.assertEqual(len(log), 1)
		frappe.db.delete("Task Point Log", {"task": task.name})
		task.delete()
		proj.delete()

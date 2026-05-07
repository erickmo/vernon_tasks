import frappe
from frappe.tests.utils import FrappeTestCase

OWNER = "test_task_owner@example.com"
LEADER = "test_task_leader@example.com"
MEMBER = "test_task_member@example.com"


def setup_users():
    for email, role in [(OWNER, "VT Manager"), (LEADER, "VT Leader"), (MEMBER, "VT Member")]:
        if not frappe.db.exists("User", email):
            frappe.get_doc({
                "doctype": "User", "email": email,
                "first_name": email.split("@")[0], "last_name": "T",
                "enabled": 1, "roles": [{"role": role}]
            }).insert(ignore_permissions=True)


def make_project():
    proj = frappe.get_doc({
        "doctype": "VT Project", "title": "Task Test Project",
        "project_owner": OWNER, "project_leader": LEADER,
        "start_date": "2026-05-01", "end_date": "2026-06-30",
        "pdca_phase": "PLAN", "status": "Open",
        "team_members": [{"user": MEMBER, "role": "Member"}]
    })
    proj.insert(ignore_permissions=True)
    return proj


def make_task(project_name, **kwargs):
    defaults = {
        "doctype": "VT Task", "title": "Test Task",
        "project": project_name, "assigned_to": MEMBER,
        "priority": "Medium", "pdca_phase": "BACKLOG",
        "kanban_status": "Backlog", "weight": 3.0,
        "estimated_hours": 8.0,
        "start_date": "2026-05-10", "deadline": "2026-05-20",
    }
    defaults.update(kwargs)
    return frappe.get_doc(defaults)


class TestVTTask(FrappeTestCase):
    def setUp(self):
        setup_users()
        self.project = make_project()

    def test_create_task(self):
        task = make_task(self.project.name)
        task.insert(ignore_permissions=True)
        self.assertTrue(task.name.startswith("TASK-"))
        task.delete()

    def test_deadline_before_start_raises(self):
        task = make_task(self.project.name, start_date="2026-05-20", deadline="2026-05-10")
        with self.assertRaises(frappe.ValidationError):
            task.insert(ignore_permissions=True)

    def test_pdca_kanban_sync(self):
        task = make_task(self.project.name)
        task.insert(ignore_permissions=True)
        # Valid transition: BACKLOG -> PLAN -> DO
        task.pdca_phase = "PLAN"
        task.save()
        self.assertEqual(task.kanban_status, "Scheduled")
        task.pdca_phase = "DO"
        task.save()
        self.assertEqual(task.kanban_status, "In Progress")
        task.delete()

    def test_recurring_requires_rule(self):
        task = make_task(self.project.name, is_recurring=1, recurring_rule=None)
        with self.assertRaises(frappe.ValidationError):
            task.insert(ignore_permissions=True)

    def test_dependency_self_reference_raises(self):
        task = make_task(self.project.name)
        task.insert(ignore_permissions=True)
        task.append("dependencies", {"blocked_by": task.name, "dependency_type": "Finish-to-Start"})
        with self.assertRaises(frappe.ValidationError):
            task.save()
        task.delete()

    def test_get_blocked_tasks_for_user(self):
        task = make_task(self.project.name)
        task.insert(ignore_permissions=True)
        from vernon_tasks.task.doctype.vt_task.vt_task import get_blocked_tasks_for_user
        blocked = get_blocked_tasks_for_user(MEMBER)
        self.assertIsInstance(blocked, list)
        task.delete()

    def tearDown(self):
        self.project.delete()

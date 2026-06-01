import frappe
from frappe.tests.utils import FrappeTestCase
from datetime import date

OWNER = "test_sched_owner@example.com"
LEADER = "test_sched_leader@example.com"
MEMBER = "test_sched_member@example.com"
_FIXTURE_BRAND = "TEST-SCHED-BRAND"


def _ensure_brand():
    if not frappe.db.exists("VT Brand", _FIXTURE_BRAND):
        frappe.get_doc({
            "doctype": "VT Brand",
            "brand_name": _FIXTURE_BRAND,
        }).insert(ignore_permissions=True)
    return _FIXTURE_BRAND


def setup():
    for email, role in [(OWNER, "VT Manager"), (LEADER, "VT Leader"), (MEMBER, "VT Member")]:
        if not frappe.db.exists("User", email):
            frappe.get_doc({
                "doctype": "User", "email": email,
                "first_name": email.split("@")[0], "last_name": "S",
                "enabled": 1, "roles": [{"role": role}]
            }).insert(ignore_permissions=True)
    if not frappe.db.exists("Work Profile", {"user": MEMBER}):
        frappe.get_doc({
            "doctype": "Work Profile",
            "user": MEMBER,
            "daily_target_hours": 8.0,
            "working_days": [
                {"day_of_week": "Monday", "is_working": 1},
                {"day_of_week": "Tuesday", "is_working": 1},
                {"day_of_week": "Wednesday", "is_working": 1},
                {"day_of_week": "Thursday", "is_working": 1},
                {"day_of_week": "Friday", "is_working": 1},
                {"day_of_week": "Saturday", "is_working": 0},
                {"day_of_week": "Sunday", "is_working": 0},
            ]
        }).insert(ignore_permissions=True)


def make_task_and_project():
    setup()
    proj = frappe.get_doc({
        "doctype": "VT Project", "title": "Sched Test Proj",
        "brand": _ensure_brand(),
        "project_owner": OWNER, "project_leader": LEADER,
        "start_date": "2026-05-01", "end_date": "2026-05-31",
        "pdca_phase": "PLAN", "status": "Open",
        "team_members": [{"user": MEMBER, "role": "Member"}]
    })
    proj.insert(ignore_permissions=True)
    task = frappe.get_doc({
        "doctype": "VT Task", "title": "Scheduled Task",
        "project": proj.name, "assigned_to": MEMBER,
        "priority": "Medium", "pdca_phase": "PLAN",
        "kanban_status": "Scheduled",
        "weight": 3.0, "estimated_minutes": 10.0,
        "start_date": "2026-05-11", "deadline": "2026-05-15",
    })
    task.insert(ignore_permissions=True)
    return task, proj


class TestSchedulingEngine(FrappeTestCase):
    def setUp(self):
        self.task, self.project = make_task_and_project()

    def test_get_working_days_in_range(self):
        from vernon_tasks.task.services.scheduling_engine import get_working_days_in_range
        days = get_working_days_in_range(MEMBER, date(2026, 5, 11), date(2026, 5, 15))
        self.assertEqual(len(days), 5)

    def test_distribute_creates_schedule_entries(self):
        from vernon_tasks.task.services.scheduling_engine import distribute_task_schedule
        distribute_task_schedule(self.task.name)
        task = frappe.get_doc("VT Task", self.task.name)
        self.assertEqual(len(task.schedule_entries), 5)
        total = sum(row.allocated_minutes for row in task.schedule_entries)
        self.assertAlmostEqual(total, 10.0, places=0)

    def test_distribute_no_conflict_for_low_load(self):
        from vernon_tasks.task.services.scheduling_engine import distribute_task_schedule, check_capacity_conflict
        distribute_task_schedule(self.task.name)
        conflicts = check_capacity_conflict(MEMBER, date(2026, 5, 11), 4.0)
        self.assertFalse(conflicts)

    def test_override_recalculates_remaining_days(self):
        from vernon_tasks.task.services.scheduling_engine import distribute_task_schedule, override_schedule_entry
        distribute_task_schedule(self.task.name)
        override_schedule_entry(self.task.name, date(2026, 5, 11), 5.0)
        task = frappe.get_doc("VT Task", self.task.name)
        overridden = [r for r in task.schedule_entries if r.is_override]
        self.assertEqual(len(overridden), 1)
        self.assertEqual(overridden[0].allocated_minutes, 5.0)
        non_overridden = [r for r in task.schedule_entries if not r.is_override]
        total_remaining = sum(r.allocated_minutes for r in non_overridden)
        self.assertAlmostEqual(total_remaining, 5.0, places=0)

    def tearDown(self):
        frappe.db.delete("Task Schedule Entry", {"parent": self.task.name})
        self.task.delete()
        self.project.delete()

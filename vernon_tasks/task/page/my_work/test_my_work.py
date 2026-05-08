import frappe
import unittest
from frappe.utils import today, add_days


def _make_project():
    if frappe.db.exists("VT Project", "TEST-MYWORK-PRJ"):
        return frappe.get_doc("VT Project", "TEST-MYWORK-PRJ")
    return frappe.get_doc({
        "doctype": "VT Project",
        "name": "TEST-MYWORK-PRJ",
        "title": "Test My Work Project",
        "owner_user": "Administrator",
        "start_date": today(),
        "end_date": add_days(today(), 30),
        "pdca_phase": "DO",
    }).insert(ignore_permissions=True)


def _make_task(name, assigned_to, pdca_phase="PLAN", kanban_status="Scheduled"):
    if frappe.db.exists("VT Task", name):
        frappe.delete_doc("VT Task", name, force=True)
    return frappe.get_doc({
        "doctype": "VT Task",
        "name": name,
        "title": f"Task {name}",
        "project": "TEST-MYWORK-PRJ",
        "assigned_to": assigned_to,
        "pdca_phase": pdca_phase,
        "kanban_status": kanban_status,
        "start_date": today(),
        "deadline": add_days(today(), 5),
        "weight": 3.0,
        "priority": "Medium",
    }).insert(ignore_permissions=True)


def _make_schedule_entry(task_name, user, hours=2.0):
    if frappe.db.exists("Task Schedule Entry", {"parent": task_name, "date": today()}):
        return
    task = frappe.get_doc("VT Task", task_name)
    task.append("schedule_entries", {
        "date": today(),
        "allocated_hours": hours,
        "is_override": False,
    })
    task.save(ignore_permissions=True)


class TestMyWorkAPI(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        frappe.set_user("Administrator")
        _make_project()

    @classmethod
    def tearDownClass(cls):
        if frappe.db.exists("VT Project", "TEST-MYWORK-PRJ"):
            frappe.delete_doc("VT Project", "TEST-MYWORK-PRJ", force=True)
        frappe.db.commit()

    def setUp(self):
        frappe.set_user("Administrator")

    def tearDown(self):
        for name in ["MW-TASK-1", "MW-TASK-2", "MW-TASK-BLK", "MW-TASK-BLOCKER", "MW-TASK-SOON"]:
            if frappe.db.exists("VT Task", name):
                frappe.delete_doc("VT Task", name, force=True)
        frappe.db.commit()

    # --- get_my_day ---

    def test_get_my_day_returns_todays_entries(self):
        _make_task("MW-TASK-1", "Administrator")
        _make_schedule_entry("MW-TASK-1", "Administrator", hours=2.0)

        from vernon_tasks.task.page.my_work.my_work import get_my_day
        result = get_my_day()

        names = [r["name"] for r in result]
        self.assertIn("MW-TASK-1", names)

    def test_get_my_day_excludes_done_tasks(self):
        _make_task("MW-TASK-2", "Administrator", pdca_phase="DONE", kanban_status="Done")
        _make_schedule_entry("MW-TASK-2", "Administrator")

        from vernon_tasks.task.page.my_work.my_work import get_my_day
        result = get_my_day()

        names = [r["name"] for r in result]
        self.assertNotIn("MW-TASK-2", names)

    # --- get_what_to_do_today ---

    def test_get_what_to_do_today_includes_due_soon(self):
        frappe.get_doc({
            "doctype": "VT Task",
            "name": "MW-TASK-SOON",
            "title": "Due Soon Task",
            "project": "TEST-MYWORK-PRJ",
            "assigned_to": "Administrator",
            "pdca_phase": "PLAN",
            "kanban_status": "Scheduled",
            "start_date": today(),
            "deadline": add_days(today(), 2),
            "weight": 2.0,
            "priority": "High",
        }).insert(ignore_permissions=True)

        from vernon_tasks.task.page.my_work.my_work import get_what_to_do_today
        result = get_what_to_do_today()
        names = [r["name"] for r in result]
        self.assertIn("MW-TASK-SOON", names)

    def test_get_what_to_do_today_excludes_blocked(self):
        frappe.get_doc({
            "doctype": "VT Task",
            "name": "MW-TASK-BLOCKER",
            "title": "Blocker",
            "project": "TEST-MYWORK-PRJ",
            "assigned_to": "Administrator",
            "pdca_phase": "DO",
            "kanban_status": "In Progress",
            "start_date": today(),
            "deadline": add_days(today(), 10),
            "weight": 1.0,
            "priority": "Low",
        }).insert(ignore_permissions=True)

        frappe.get_doc({
            "doctype": "VT Task",
            "name": "MW-TASK-BLK",
            "title": "Blocked Task",
            "project": "TEST-MYWORK-PRJ",
            "assigned_to": "Administrator",
            "pdca_phase": "PLAN",
            "kanban_status": "Scheduled",
            "start_date": today(),
            "deadline": add_days(today(), 1),
            "weight": 2.0,
            "priority": "High",
            "dependencies": [{"blocked_by": "MW-TASK-BLOCKER", "dependency_type": "Finish-to-Start"}],
        }).insert(ignore_permissions=True)

        from vernon_tasks.task.page.my_work.my_work import get_what_to_do_today
        result = get_what_to_do_today()
        names = [r["name"] for r in result]
        self.assertNotIn("MW-TASK-BLK", names)

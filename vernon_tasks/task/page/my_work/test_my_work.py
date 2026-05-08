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

    def setUp(self):
        frappe.set_user("Administrator")
        _make_project()

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

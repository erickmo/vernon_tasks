import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, today, getdate
from vernon_tasks.task.services.burndown_service import get_burndown


class TestBurndownService(FrappeTestCase):
    def setUp(self):
        if frappe.db.exists("VT Project", "BD-Proj"):
            frappe.delete_doc("VT Project", "BD-Proj", force=True)
        self.project = frappe.get_doc({
            "doctype": "VT Project",
            "title": "BD-Proj",
            "project_owner": frappe.session.user,
            "start_date": add_days(today(), -10),
            "end_date": add_days(today(), 10),
            "status": "Open",
        }).insert(ignore_permissions=True)
        # 5-day sprint starting 4 days ago
        self.sprint = frappe.get_doc({
            "doctype": "VT Sprint",
            "sprint_title": "BD-S1",
            "project": self.project.name,
            "start_date": add_days(today(), -4),
            "end_date": add_days(today(), 0),
            "status": "Active",
        }).insert(ignore_permissions=True)
        # 3 tasks, 10h each = 30h total
        for offset in (-2, -1, None):
            frappe.get_doc({
                "doctype": "VT Task",
                "title": "T",
                "project": self.project.name,
                "sprint": self.sprint.name,
                "estimated_hours": 10,
                "actual_hours": 10,
                "completion_date": add_days(today(), offset) if offset is not None else None,
                "pdca_phase": "DONE" if offset is not None else "DO",
                "kanban_status": "Done" if offset is not None else "In Progress",
            }).insert(ignore_permissions=True)
        # Unestimated task
        frappe.get_doc({
            "doctype": "VT Task",
            "title": "U",
            "project": self.project.name,
            "sprint": self.sprint.name,
            "estimated_hours": 0,
            "actual_hours": 0,
            "pdca_phase": "DO",
            "kanban_status": "In Progress",
        }).insert(ignore_permissions=True)

    def test_labels_cover_sprint_window_inclusive(self):
        result = get_burndown(self.sprint.name)
        self.assertEqual(len(result["labels"]), 5)
        self.assertEqual(result["labels"][0], str(getdate(add_days(today(), -4))))
        self.assertEqual(result["labels"][-1], str(getdate(today())))

    def test_ideal_starts_at_total_ends_at_zero(self):
        result = get_burndown(self.sprint.name)
        self.assertEqual(result["ideal"][0], 30.0)
        self.assertEqual(result["ideal"][-1], 0.0)

    def test_remaining_decreases_as_tasks_complete(self):
        result = get_burndown(self.sprint.name)
        self.assertEqual(result["remaining"][0], 30.0)
        self.assertEqual(result["remaining"][-1], 10.0)

    def test_unestimated_count(self):
        result = get_burndown(self.sprint.name)
        self.assertEqual(result["unestimated_count"], 1)

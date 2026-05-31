import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, today
from vernon_tasks.task.services.streak_service import get_streak


class TestStreak(FrappeTestCase):
    def setUp(self):
        if not frappe.db.exists("User", "sk-me@x.com"):
            frappe.get_doc({"doctype": "User", "email": "sk-me@x.com",
                            "first_name": "T", "send_welcome_email": 0, "enabled": 1}
                           ).insert(ignore_permissions=True)
        if frappe.db.exists("VT Project", "SK-Proj"):
            frappe.delete_doc("VT Project", "SK-Proj", force=True)
        self.project = frappe.get_doc({
            "doctype": "VT Project", "title": "SK-Proj",
            "project_owner": frappe.session.user,
            "start_date": add_days(today(), -120),
            "end_date": add_days(today(), 30),
            "status": "Open",
        }).insert(ignore_permissions=True)

        def _s(idx, off, user_hrs):
            s = frappe.get_doc({
                "doctype": "VT Sprint", "sprint_title": f"SK-S{idx}",
                "project": self.project.name,
                "start_date": add_days(today(), off),
                "end_date": add_days(today(), off + 13),
                "status": "Closed",
            }).insert(ignore_permissions=True)
            if user_hrs > 0:
                frappe.get_doc({
                    "doctype": "VT Task", "title": "T",
                    "project": self.project.name, "sprint": s.name,
                    "assigned_to": "sk-me@x.com",
                    "estimated_minutes": user_hrs, "actual_minutes": user_hrs,
                    "pdca_phase": "DONE", "kanban_status": "Done",
                    "completion_date": add_days(today(), off + 2),
                }).insert(ignore_permissions=True)
            return s

        _s(1, -84, 0)   # gap (oldest)
        _s(2, -56, 4)
        _s(3, -28, 6)
        _s(4, -14, 8)   # newest

    def test_streak_three(self):
        r = get_streak("sk-me@x.com", self.project.name)
        self.assertEqual(r["streak"], 3)
        self.assertEqual(r["sprints_checked"], 4)

    def test_no_sprints(self):
        if frappe.db.exists("VT Project", "SK-Empty"):
            frappe.delete_doc("VT Project", "SK-Empty", force=True)
        p = frappe.get_doc({
            "doctype": "VT Project", "title": "SK-Empty",
            "project_owner": frappe.session.user,
            "start_date": today(), "end_date": add_days(today(), 1),
            "status": "Open",
        }).insert(ignore_permissions=True)
        r = get_streak("sk-me@x.com", p.name)
        self.assertEqual(r["streak"], 0)
        self.assertEqual(r["sprints_checked"], 0)

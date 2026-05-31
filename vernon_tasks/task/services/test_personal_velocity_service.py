import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, today
from vernon_tasks.task.services.personal_velocity_service import get_personal_velocity


class TestPersonalVelocity(FrappeTestCase):
    def setUp(self):
        for email in ("pv-me@x.com", "pv-other@x.com"):
            if not frappe.db.exists("User", email):
                frappe.get_doc({
                    "doctype": "User", "email": email, "first_name": "T",
                    "send_welcome_email": 0, "enabled": 1,
                }).insert(ignore_permissions=True)
        if frappe.db.exists("VT Project", "PV-Proj"):
            frappe.delete_doc("VT Project", "PV-Proj", force=True)
        self.project = frappe.get_doc({
            "doctype": "VT Project", "title": "PV-Proj",
            "project_owner": frappe.session.user,
            "start_date": add_days(today(), -60),
            "end_date": add_days(today(), 30),
            "status": "Open",
        }).insert(ignore_permissions=True)

        def _s(idx, off):
            return frappe.get_doc({
                "doctype": "VT Sprint", "sprint_title": f"PV-S{idx}",
                "project": self.project.name,
                "start_date": add_days(today(), off),
                "end_date": add_days(today(), off + 13),
                "status": "Closed",
            }).insert(ignore_permissions=True)

        def _t(sprint, user, hrs, off):
            frappe.get_doc({
                "doctype": "VT Task", "title": "T",
                "project": self.project.name, "sprint": sprint,
                "assigned_to": user,
                "estimated_minutes": hrs, "actual_minutes": hrs,
                "pdca_phase": "DONE", "kanban_status": "Done",
                "completion_date": add_days(today(), off + 2),
            }).insert(ignore_permissions=True)

        self.s1 = _s(1, -28); self.s2 = _s(2, -14)
        _t(self.s1.name, "pv-me@x.com", 10, -28)
        _t(self.s1.name, "pv-other@x.com", 20, -28)
        _t(self.s2.name, "pv-me@x.com", 6, -14)
        _t(self.s2.name, "pv-other@x.com", 10, -14)

    def test_personal_vs_team_avg(self):
        r = get_personal_velocity("pv-me@x.com", self.project.name, n=6)
        self.assertEqual(r["personal"], [10.0, 6.0])
        self.assertEqual(r["team_avg"], [15.0, 8.0])
        self.assertAlmostEqual(r["avg"], 8.0)
        self.assertAlmostEqual(r["team_avg_total"], 11.5)

    def test_empty_project(self):
        if frappe.db.exists("VT Project", "PV-Empty"):
            frappe.delete_doc("VT Project", "PV-Empty", force=True)
        p = frappe.get_doc({
            "doctype": "VT Project", "title": "PV-Empty",
            "project_owner": frappe.session.user,
            "start_date": today(), "end_date": add_days(today(), 1),
            "status": "Open",
        }).insert(ignore_permissions=True)
        r = get_personal_velocity("pv-me@x.com", p.name)
        self.assertEqual(r["personal"], [])
        self.assertEqual(r["avg"], 0.0)

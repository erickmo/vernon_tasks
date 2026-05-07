import frappe
from frappe.tests.utils import FrappeTestCase

OWNER_EMAIL = "test_sprint_owner@example.com"
LEADER_EMAIL = "test_sprint_leader@example.com"


def setup_users():
    for email, role in [(OWNER_EMAIL, "VT Manager"), (LEADER_EMAIL, "VT Leader")]:
        if not frappe.db.exists("User", email):
            frappe.get_doc({
                "doctype": "User", "email": email,
                "first_name": email.split("@")[0], "last_name": "T",
                "enabled": 1, "roles": [{"role": role}]
            }).insert(ignore_permissions=True)


def make_project():
    proj = frappe.get_doc({
        "doctype": "VT Project",
        "title": "Sprint Test Project",
        "project_owner": OWNER_EMAIL,
        "project_leader": LEADER_EMAIL,
        "start_date": "2026-05-01",
        "end_date": "2026-05-31",
        "pdca_phase": "PLAN",
        "status": "Open",
    })
    proj.insert(ignore_permissions=True)
    return proj


class TestVTSprint(FrappeTestCase):
    def setUp(self):
        setup_users()
        self.project = make_project()

    def test_create_sprint(self):
        sprint = frappe.get_doc({
            "doctype": "VT Sprint",
            "sprint_title": "Sprint 1",
            "project": self.project.name,
            "start_date": "2026-05-01",
            "end_date": "2026-05-14",
            "status": "Planning",
            "goal": "Ship MVP features",
        })
        sprint.insert(ignore_permissions=True)
        self.assertTrue(sprint.name.startswith("SP-"))
        sprint.delete()

    def test_end_before_start_raises(self):
        sprint = frappe.get_doc({
            "doctype": "VT Sprint",
            "sprint_title": "Bad Sprint",
            "project": self.project.name,
            "start_date": "2026-05-14",
            "end_date": "2026-05-01",
            "status": "Planning",
        })
        with self.assertRaises(frappe.ValidationError):
            sprint.insert(ignore_permissions=True)

    def test_sprint_outside_project_dates_raises(self):
        sprint = frappe.get_doc({
            "doctype": "VT Sprint",
            "sprint_title": "Out of Range Sprint",
            "project": self.project.name,
            "start_date": "2026-06-01",
            "end_date": "2026-06-14",
            "status": "Planning",
        })
        with self.assertRaises(frappe.ValidationError):
            sprint.insert(ignore_permissions=True)

    def tearDown(self):
        self.project.delete()

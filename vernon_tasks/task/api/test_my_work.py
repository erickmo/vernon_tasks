import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_tasks.task.api.my_work import list as my_work_list, detail

# VT Project requires: title, project_owner, start_date, end_date
_FIXTURE_PROJECT = "TEST-MY-WORK-PROJ"


def _ensure_project():
    if not frappe.db.exists("VT Project", _FIXTURE_PROJECT):
        p = frappe.get_doc({
            "doctype": "VT Project",
            "name": _FIXTURE_PROJECT,
            "title": "Test Project (my_work fixtures)",
            "project_owner": "Administrator",
            "start_date": "2025-01-01",
            "end_date": "2025-12-31",
        })
        p.flags.name_set = True
        p.insert(ignore_permissions=True)
    return _FIXTURE_PROJECT


def _ensure_user(email):
    if not frappe.db.exists("User", email):
        frappe.get_doc({
            "doctype": "User",
            "email": email,
            "first_name": email.split("@")[0],
            "send_welcome_email": 0,
            "enabled": 1,
        }).insert(ignore_permissions=True)
    return email


class TestMyWork(FrappeTestCase):
    def setUp(self):
        self.user_a = _ensure_user("a-mywork@test.local")
        self.user_b = _ensure_user("b-mywork@test.local")
        self.project = _ensure_project()
        frappe.db.delete("VT Task", {"project": self.project})

    def tearDown(self):
        frappe.set_user("Administrator")

    def _make_task(self, owner, deadline, title="T"):
        doc = frappe.get_doc({
            "doctype": "VT Task",
            "title": title,
            "deadline": deadline,
            "assigned_to": owner,
            "project": self.project,
        })
        doc.flags.ignore_links = True
        return doc.insert(ignore_permissions=True)

    def test_list_groups_correctly(self):
        frappe.set_user(self.user_a)
        today = frappe.utils.today()
        self._make_task(self.user_a, frappe.utils.add_days(today, -2), "old")
        self._make_task(self.user_a, today, "now")
        self._make_task(self.user_a, frappe.utils.add_days(today, 3), "soon")
        result = my_work_list()
        self.assertEqual(len(result["overdue"]), 1)
        self.assertEqual(len(result["today"]), 1)
        self.assertEqual(len(result["upcoming"]), 1)

    def test_detail_rejects_other_user(self):
        frappe.set_user("Administrator")
        task = self._make_task(self.user_a, frappe.utils.today())
        frappe.set_user(self.user_b)
        with self.assertRaises(frappe.PermissionError):
            detail(task.name)

    def test_detail_returns_expected_keys(self):
        frappe.set_user("Administrator")
        task = self._make_task(self.user_a, frappe.utils.today(), "Detail Test")
        frappe.set_user(self.user_a)
        result = detail(task.name)
        for key in ("id", "title", "status", "priority", "due_date", "project", "points", "description", "activity"):
            self.assertIn(key, result)
        self.assertIsNone(result["description"])
        self.assertIsInstance(result["activity"], list)

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import today, add_days
from vernon_tasks.task.api.my_work import search


class TestMyWorkSearch(FrappeTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.user = "p1b_search_user@test.local"
        if not frappe.db.exists("User", cls.user):
            frappe.get_doc({"doctype": "User", "email": cls.user, "first_name": cls.user}).insert(
                ignore_permissions=True
            )
        if not frappe.db.exists("VT Project", "TEST-P1B-PROJ-A"):
            frappe.get_doc({
                "doctype": "VT Project",
                "name": "TEST-P1B-PROJ-A",
                "title": "Search Test A",
                "project_owner": "Administrator",
                "start_date": today(),
                "end_date": add_days(today(), 30),
            }).insert(ignore_permissions=True)
        if not frappe.db.exists("VT Project", "TEST-P1B-PROJ-B"):
            frappe.get_doc({
                "doctype": "VT Project",
                "name": "TEST-P1B-PROJ-B",
                "title": "Search Test B",
                "project_owner": "Administrator",
                "start_date": today(),
                "end_date": add_days(today(), 30),
            }).insert(ignore_permissions=True)

    def _make_task(self, title, project="TEST-P1B-PROJ-A", priority="Sedang", deadline=None):
        return frappe.get_doc({
            "doctype": "VT Task",
            "title": title,
            "deadline": deadline or today(),
            "assigned_to": self.user,
            "project": project,
            "priority": priority,
        }).insert(ignore_permissions=True)

    def test_query_matches_title_like(self):
        frappe.set_user(self.user)
        self._make_task("Buat laporan keuangan")
        self._make_task("Audit sprint Q1")
        r = search(query="laporan")
        titles = [x["title"] for x in r["results"]]
        self.assertIn("Buat laporan keuangan", titles)
        self.assertNotIn("Audit sprint Q1", titles)

    def test_priority_in_list(self):
        frappe.set_user(self.user)
        self._make_task("A", priority="Tinggi")
        self._make_task("B", priority="Rendah")
        r = search(priority="Tinggi,Sedang")
        prios = {x["priority"] for x in r["results"]}
        self.assertIn("Tinggi", prios)
        self.assertNotIn("Rendah", prios)

    def test_project_filter(self):
        frappe.set_user(self.user)
        self._make_task("X", project="TEST-P1B-PROJ-A")
        self._make_task("Y", project="TEST-P1B-PROJ-B")
        r = search(project="TEST-P1B-PROJ-A")
        projs = {x["project"] for x in r["results"]}
        self.assertEqual(projs, {"TEST-P1B-PROJ-A"})

    def test_due_range_today(self):
        frappe.set_user(self.user)
        self._make_task("today", deadline=today())
        self._make_task("tomorrow", deadline=add_days(today(), 1))
        r = search(due_range="today")
        titles = [x["title"] for x in r["results"]]
        self.assertIn("today", titles)
        self.assertNotIn("tomorrow", titles)

    def test_due_range_overdue(self):
        frappe.set_user(self.user)
        self._make_task("past", deadline=add_days(today(), -3))
        self._make_task("future", deadline=add_days(today(), 3))
        r = search(due_range="overdue")
        titles = [x["title"] for x in r["results"]]
        self.assertIn("past", titles)
        self.assertNotIn("future", titles)

    def test_empty_returns_all(self):
        frappe.set_user(self.user)
        self._make_task("Z1")
        self._make_task("Z2")
        r = search()
        self.assertGreaterEqual(r["total"], 2)

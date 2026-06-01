import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import today, add_days
from vernon_tasks.task.api.my_work import search


_FIXTURE_BRAND = "TEST-SEARCH-BRAND"


def _ensure_brand():
    if not frappe.db.exists("VT Brand", _FIXTURE_BRAND):
        frappe.get_doc({
            "doctype": "VT Brand",
            "brand_name": _FIXTURE_BRAND,
        }).insert(ignore_permissions=True)
    return _FIXTURE_BRAND


class TestMyWorkSearch(FrappeTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.user = "p1b_search_user@test.local"
        if not frappe.db.exists("User", cls.user):
            frappe.get_doc({
                "doctype": "User", "email": cls.user, "first_name": cls.user,
                "roles": [{"role": "VT Member"}],
            }).insert(ignore_permissions=True)
        brand = _ensure_brand()
        for proj_name, proj_title in [("TEST-P1B-PROJ-A", "Search Test A"), ("TEST-P1B-PROJ-B", "Search Test B")]:
            if not frappe.db.exists("VT Project", proj_name):
                p = frappe.get_doc({
                    "doctype": "VT Project",
                    "name": proj_name,
                    "title": proj_title,
                    "brand": brand,
                    "project_owner": "Administrator",
                    "start_date": today(),
                    "end_date": add_days(today(), 30),
                })
                p.flags.name_set = True
                p.insert(ignore_permissions=True)

    def tearDown(self):
        frappe.set_user("Administrator")

    def _make_task(self, title, project="TEST-P1B-PROJ-A", priority="Medium", deadline=None):
        doc = frappe.get_doc({
            "doctype": "VT Task",
            "title": title,
            "deadline": deadline or today(),
            "assigned_to": self.user,
            "project": project,
            "priority": priority,
        })
        doc.flags.ignore_links = True
        return doc.insert(ignore_permissions=True)

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
        self._make_task("A", priority="High")
        self._make_task("B", priority="Low")
        r = search(priority="High,Medium")
        prios = {x["priority"] for x in r["results"]}
        self.assertIn("High", prios)
        self.assertNotIn("Low", prios)

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

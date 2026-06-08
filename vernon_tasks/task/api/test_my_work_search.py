import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import today, add_days
from vernon_tasks.task.api.my_work import search

# VT Item tree migration (P4): the legacy VT Project / VT Task seeds are now
# VT Item nodes (node_type Project / Task). A task's "project" is its nearest
# Project ancestor (tree.project_of), so tasks are hung directly under the
# project node via parent_vt_item. project_owner -> owner_user; assigned_to ->
# owner_user; VT Task.project Link -> parent_vt_item.
# Spec: docs/superpowers/specs/2026-06-07-vt-item-unified-hierarchy-design.html

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
        # VT Project -> VT Item node_type="Project" (root of the tree); fixed
        # names are gone (autonamed series), so capture the generated node names.
        cls.proj_a = cls._make_project(brand, "Search Test A")
        cls.proj_b = cls._make_project(brand, "Search Test B")

    @classmethod
    def _make_project(cls, brand, title):
        return frappe.get_doc({
            "doctype": "VT Item",
            "node_type": "Project",
            "parent_vt_item": None,
            "title": title,
            "brand": brand,
            "owner_user": "Administrator",
            "start_date": today(),
            "end_date": add_days(today(), 30),
        }).insert(ignore_permissions=True).name

    @classmethod
    def tearDownClass(cls):
        # Per-test task nodes are rolled back by FrappeTestCase; only the two
        # class-level Project nodes persist. Delete deepest-first (lft desc) so
        # NestedSet never sees a parent removed before a stray child.
        for proj in (getattr(cls, "proj_b", None), getattr(cls, "proj_a", None)):
            if proj and frappe.db.exists("VT Item", proj):
                bounds = frappe.db.get_value(
                    "VT Item", proj, ["lft", "rgt"], as_dict=True
                )
                kids = frappe.get_all(
                    "VT Item",
                    filters={"lft": [">", bounds.lft], "rgt": ["<", bounds.rgt]},
                    fields=["name"], order_by="lft desc",
                )
                for k in kids:
                    frappe.delete_doc("VT Item", k["name"], force=True, ignore_permissions=True)
                frappe.delete_doc("VT Item", proj, force=True, ignore_permissions=True)
        super().tearDownClass()

    def tearDown(self):
        frappe.set_user("Administrator")

    def _make_task(self, title, project=None, priority="Medium", deadline=None):
        # VT Task -> VT Item node_type="Task"; assigned_to -> owner_user;
        # project Link -> parent_vt_item (Task hung under its Project node).
        # owner_user is required for the task to surface in search (filtered by
        # owner_user). pdca defaults (BACKLOG) + weight are auto-applied.
        doc = frappe.get_doc({
            "doctype": "VT Item",
            "node_type": "Task",
            "parent_vt_item": project or self.proj_a,
            "title": title,
            "deadline": deadline or today(),
            "owner_user": self.user,
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
        self._make_task("X", project=self.proj_a)
        self._make_task("Y", project=self.proj_b)
        r = search(project=self.proj_a)
        projs = {x["project"] for x in r["results"]}
        self.assertEqual(projs, {self.proj_a})

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

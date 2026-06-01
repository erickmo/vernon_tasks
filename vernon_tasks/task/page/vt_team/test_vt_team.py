"""Tests for vt-team page API: get_team_capacity."""
import frappe
import unittest
from frappe.utils import today, add_months


class TestTeamCapacityAPI(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        frappe.set_user("Administrator")
        cls._profiles = []
        cls._tasks = []
        cls._projects = []
        cls._brands = []
        cls._project_name = cls._make_project()

    @classmethod
    def _make_project(cls):
        existing = frappe.db.get_value("VT Project", {"title": "Test Team Capacity Project"}, "name")
        if existing:
            cls._projects.append(existing)
            return existing
        # Get a brand for the test project (use first available or Administrator's)
        brand = frappe.db.get_value("VT Brand", {"owner": "Administrator"}, "name")
        if not brand:
            # Create minimal brand if none exists
            brand_doc = frappe.get_doc({
                "doctype": "VT Brand",
                "title": "Test Brand",
                "owner": "Administrator",
            }).insert(ignore_permissions=True)
            brand = brand_doc.name
            cls._brands.append(brand)
        doc = frappe.get_doc({
            "doctype": "VT Project",
            "title": "Test Team Capacity Project",
            "brand": brand,
            "project_owner": "Administrator",
            "start_date": today(),
            "end_date": add_months(today(), 1),
            "pdca_phase": "DO",
        }).insert(ignore_permissions=True)
        cls._projects.append(doc.name)
        return doc.name

    @classmethod
    def tearDownClass(cls):
        for t in cls._tasks:
            if frappe.db.exists("VT Task", t):
                frappe.delete_doc("VT Task", t, force=True)
        for p in cls._projects:
            if frappe.db.exists("VT Project", p):
                frappe.delete_doc("VT Project", p, force=True)
        for pr in cls._profiles:
            if frappe.db.exists("Work Profile", pr):
                frappe.delete_doc("Work Profile", pr, force=True)
        for b in cls._brands:
            if frappe.db.exists("VT Brand", b):
                frappe.delete_doc("VT Brand", b, force=True)
        frappe.db.commit()

    def _make_profile(self, user="Administrator", daily_target=8.0):
        existing = frappe.db.get_value("Work Profile", {"user": user}, "name")
        if existing:
            self.__class__._profiles.append(existing)
            return frappe.get_doc("Work Profile", existing)
        doc = frappe.get_doc({
            "doctype": "Work Profile",
            "user": user,
            "daily_target_hours": daily_target,
        }).insert(ignore_permissions=True)
        self.__class__._profiles.append(doc.name)
        return doc

    def _make_active_task(self, user, estimated_minutes=120):
        doc = frappe.get_doc({
            "doctype": "VT Task",
            "title": f"Team Test Task {frappe.generate_hash(length=4)}",
            "project": self._project_name,
            "assigned_to": user,
            "pdca_phase": "DO",
            "kanban_status": "In Progress",
            "priority": "Medium",
            "weight": 3.0,
            "estimated_minutes": estimated_minutes,
        }).insert(ignore_permissions=True)
        self.__class__._tasks.append(doc.name)
        return doc

    def test_get_team_capacity_returns_profile_users(self):
        """get_team_capacity includes users who have a Work Profile."""
        self._make_profile("Administrator", 8.0)
        from vernon_tasks.task.page.vt_team.vt_team import get_team_capacity
        result = get_team_capacity()
        users = [r["user"] for r in result]
        self.assertIn("Administrator", users)

    def test_get_team_capacity_computes_utilization(self):
        """Utilization is total_estimated_hours / (daily_target * 5) * 100."""
        self._make_profile("Administrator", 8.0)
        # 240 min = 4 hours → utilization = 4 / (8 * 5) * 100 = 10%
        self._make_active_task("Administrator", estimated_minutes=240)
        from vernon_tasks.task.page.vt_team.vt_team import get_team_capacity
        # Scope to this test's project to avoid leakage from other test tasks
        result = get_team_capacity(project=self._project_name)
        admin_row = next((r for r in result if r["user"] == "Administrator"), None)
        self.assertIsNotNone(admin_row)
        self.assertAlmostEqual(admin_row["total_estimated_hours"], 4.0, places=1)
        self.assertAlmostEqual(admin_row["utilization_pct"], 10.0, places=1)

    def test_get_team_capacity_sorts_by_utilization_desc(self):
        """Result is sorted highest utilization first."""
        self._make_profile("Administrator", 8.0)
        from vernon_tasks.task.page.vt_team.vt_team import get_team_capacity
        result = get_team_capacity()
        pcts = [r["utilization_pct"] for r in result]
        self.assertEqual(pcts, sorted(pcts, reverse=True))

    def test_get_team_capacity_project_filter(self):
        """project param scopes tasks to a single project."""
        self._make_profile("Administrator", 8.0)
        from vernon_tasks.task.page.vt_team.vt_team import get_team_capacity
        result = get_team_capacity(project=self._project_name)
        self.assertIsInstance(result, list)

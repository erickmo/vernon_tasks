"""Tests for vt-team page API: get_team_capacity.

Seeds nodes in the unified VT Item tree (node_type Project + Task) rather than
the legacy VT Task / VT Project doctypes. The Project node carries a
team_members child row; Task nodes are inserted under the Project with
owner_user set (legacy VT Task.assigned_to -> VT Item.owner_user).
"""
import frappe
import unittest
from frappe.utils import today, add_months

_PROJECT_TITLE = "Test Team Capacity Project"


class TestTeamCapacityAPI(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        frappe.set_user("Administrator")
        cls._profiles = []
        cls._items = []  # VT Item node names (tasks + project), deleted child-first
        cls._project_name = cls._make_project()

    @classmethod
    def _make_project(cls):
        # Locate an existing Project node from a prior run (tree.nodes mirrors
        # the legacy get_value lookup, scoped to node_type="Project").
        from vernon_tasks.task.services.vt_item_tree import nodes
        existing = nodes("Project", filters={"title": _PROJECT_TITLE}, fields=["name"])
        if existing:
            return existing[0]["name"]
        doc = frappe.get_doc({
            "doctype": "VT Item",
            "node_type": "Project",
            "title": _PROJECT_TITLE,
            "is_group": 1,  # parent of Task nodes -> must be a NestedSet group
            "owner_user": "Administrator",  # legacy project_owner -> owner_user
            "start_date": today(),
            "end_date": add_months(today(), 1),
            "pdca_phase": "DO",
            # Project carries its roster as a child table on the VT Item node.
            "team_members": [
                {"user": "Administrator", "role": "Leader", "is_also_leader": 1},
            ],
        }).insert(ignore_permissions=True)
        cls._items.insert(0, doc.name)  # delete project last (after its tasks)
        return doc.name

    @classmethod
    def tearDownClass(cls):
        # Tasks were appended after the project, so iterate to delete leaves
        # before the group node (NestedSet rejects deleting a non-empty group).
        for name in list(cls._items):
            if frappe.db.exists("VT Item", name):
                frappe.delete_doc("VT Item", name, force=True)
        for pr in cls._profiles:
            if frappe.db.exists("Work Profile", pr):
                frappe.delete_doc("Work Profile", pr, force=True)
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
            "doctype": "VT Item",
            "node_type": "Task",
            "title": f"Team Test Task {frappe.generate_hash(length=4)}",
            "parent_vt_item": self._project_name,  # legacy project link -> tree parent
            "owner_user": user,  # legacy assigned_to -> owner_user
            "pdca_phase": "DO",  # controller derives kanban_status "In Progress"
            "kanban_status": "In Progress",
            "priority": "Medium",
            "weight": 3.0,
            "estimated_minutes": estimated_minutes,
        }).insert(ignore_permissions=True)
        # Insert before the project so leaves are deleted first in teardown.
        self.__class__._items.insert(0, doc.name)
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
        # 240 min = 4 hours -> utilization = 4 / (8 * 5) * 100 = 10%
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

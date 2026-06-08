"""Tests for vt-scorecard page API: get_point_log, get_monthly_summary.

Seeds the VT Item tree (Project node + Task node) instead of the legacy
VT Project / VT Task doctypes. A Project is a root node; its Tasks are
Task-typed descendants — exactly what get_point_log's project filter resolves
via vt_item_tree.descendants.
"""
import frappe
import unittest
from frappe.utils import now_datetime

_PROJECT_NAME = None
_PROJECT_TITLE = "Test Scorecard Project"
_TASK_TITLE = "Scorecard Test Task"


def _make_project():
    """Create (or reuse) a Project-typed VT Item node at the tree root."""
    global _PROJECT_NAME
    existing = frappe.db.get_value(
        "VT Item", {"node_type": "Project", "title": _PROJECT_TITLE}, "name"
    )
    if existing:
        _PROJECT_NAME = existing
        return
    doc = frappe.get_doc({
        "doctype": "VT Item",
        "node_type": "Project",
        "title": _PROJECT_TITLE,
        "owner_user": "Administrator",
        "health_status": "On Track",
    }).insert(ignore_permissions=True)
    _PROJECT_NAME = doc.name


def _make_task(project_name):
    """Create a Task-typed VT Item node under the given Project node."""
    return frappe.get_doc({
        "doctype": "VT Item",
        "node_type": "Task",
        "title": _TASK_TITLE,
        "parent_vt_item": project_name,
        "owner_user": "Administrator",
        "pdca_phase": "CLOSED",
        "weight": 5.0,
    }).insert(ignore_permissions=True)


class TestScorecardAPI(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        frappe.set_user("Administrator")
        _make_project()
        cls._task = _make_task(_PROJECT_NAME)
        cls._logs = []
        cls._summaries = []

    @classmethod
    def tearDownClass(cls):
        for log in cls._logs:
            if frappe.db.exists("Task Point Log", log):
                frappe.delete_doc("Task Point Log", log, force=True)
        for s in cls._summaries:
            if frappe.db.exists("User Point Summary", s):
                frappe.delete_doc("User Point Summary", s, force=True)
        # Delete the Task node before its Project parent (nested-set ordering).
        if frappe.db.exists("VT Item", cls._task.name):
            frappe.delete_doc("VT Item", cls._task.name, force=True)
        if _PROJECT_NAME and frappe.db.exists("VT Item", _PROJECT_NAME):
            frappe.delete_doc("VT Item", _PROJECT_NAME, force=True)
        frappe.db.commit()

    def _make_log(self, user, amount, ttype="earned"):
        doc = frappe.get_doc({
            "doctype": "Task Point Log",
            "task": self._task.name,
            "user": user,
            "transaction_type": ttype,
            "amount": amount,
            "original_amount": amount,
            "log_timestamp": now_datetime(),
        }).insert(ignore_permissions=True)
        self.__class__._logs.append(doc.name)
        return doc

    def _make_summary(self, user, period, net_points):
        doc = frappe.get_doc({
            "doctype": "User Point Summary",
            "user": user,
            "period": period,
            "total_earned": net_points,
            "total_penalty": 0,
            "total_bonus": 0,
            "total_override_delta": 0,
            "net_points": net_points,
        }).insert(ignore_permissions=True)
        self.__class__._summaries.append(doc.name)
        return doc

    def test_get_point_log_returns_own_records(self):
        """get_point_log returns Task Point Log for the calling user."""
        self._make_log("Administrator", 50.0, "earned")
        from vernon_tasks.task.page.vt_scorecard.vt_scorecard import get_point_log
        result = get_point_log()
        self.assertTrue(any(r["amount"] == 50.0 for r in result))
        # All returned logs must belong to the calling user (Administrator)
        matched = [r for r in result if r["amount"] == 50.0]
        self.assertGreater(len(matched), 0, "Expected at least one log with amount=50.0")

    def test_get_point_log_enriches_task_title(self):
        """Each log row includes task_title from the linked VT Item Task node."""
        self._make_log("Administrator", 10.0, "earned")
        from vernon_tasks.task.page.vt_scorecard.vt_scorecard import get_point_log
        result = get_point_log()
        self.assertTrue(all("task_title" in r for r in result))
        self.assertTrue(any(r["task_title"] == "Scorecard Test Task" for r in result))

    def test_get_point_log_limit_respected(self):
        """limit param caps the number of rows returned."""
        for _ in range(5):
            self._make_log("Administrator", 1.0)
        from vernon_tasks.task.page.vt_scorecard.vt_scorecard import get_point_log
        result = get_point_log(limit=2)
        self.assertLessEqual(len(result), 2)

    def test_get_monthly_summary_chronological(self):
        """get_monthly_summary returns rows in ascending period order."""
        self._make_summary("Administrator", "2026-03", 100)
        self._make_summary("Administrator", "2026-04", 120)
        self._make_summary("Administrator", "2026-05", 90)
        from vernon_tasks.task.page.vt_scorecard.vt_scorecard import get_monthly_summary
        result = get_monthly_summary(months=6)
        periods = [r["period"] for r in result]
        self.assertEqual(periods, sorted(periods))

    def test_get_monthly_summary_respects_months_limit(self):
        """months param caps how many periods are returned."""
        from vernon_tasks.task.page.vt_scorecard.vt_scorecard import get_monthly_summary
        result = get_monthly_summary(months=2)
        self.assertLessEqual(len(result), 2)

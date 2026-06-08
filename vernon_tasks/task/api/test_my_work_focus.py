import frappe
import unittest
from frappe.utils import today, add_days

from vernon_tasks.task.services import vt_item_tree as tree

# VT Item tree model (unified hierarchy):
# - A project is a VT Item node with node_type="Project".
# - A task is a VT Item node with node_type="Task" parented to the project.
# - Legacy VT Task.assigned_to / VT Project.project_owner -> owner_user.
# - Legacy VT Task.project Link -> parent_vt_item (nested-set tree parent).
# - Legacy terminal phase pdca_phase="DONE" -> "CLOSED".
# - kanban_status is DERIVED from pdca_phase by the controller (PDCA_KANBAN_MAP);
#   seeds set pdca_phase only and never write kanban_status directly.
#
# Source of truth:
# docs/superpowers/specs/2026-06-07-vt-item-unified-hierarchy-design.html

# Module-level variable to hold the actual project node name (auto-generated)
_PROJECT_NAME = None
_PROJECT_TITLE = "Test My Work Project - MW"
_FIXTURE_BRAND = "TEST-MY-WORK-BRAND"

TASK_DOCTYPE = "VT Item"
TASK_NODE_TYPE = "Task"
PROJECT_NODE_TYPE = "Project"


def _ensure_brand():
    if not frappe.db.exists("VT Brand", _FIXTURE_BRAND):
        frappe.get_doc({
            "doctype": "VT Brand",
            "brand_name": _FIXTURE_BRAND,
        }).insert(ignore_permissions=True)
    return _FIXTURE_BRAND


def _make_project():
    global _PROJECT_NAME
    if _PROJECT_NAME and frappe.db.exists(TASK_DOCTYPE, _PROJECT_NAME):
        return frappe.get_doc(TASK_DOCTYPE, _PROJECT_NAME)
    existing = frappe.db.get_value(
        TASK_DOCTYPE,
        {"title": _PROJECT_TITLE, "node_type": PROJECT_NODE_TYPE},
        "name",
    )
    if existing:
        _PROJECT_NAME = existing
        return frappe.get_doc(TASK_DOCTYPE, _PROJECT_NAME)
    doc = frappe.get_doc({
        "doctype": TASK_DOCTYPE,
        "node_type": PROJECT_NODE_TYPE,
        "parent_vt_item": None,
        "title": _PROJECT_TITLE,
        "brand": _ensure_brand(),
        "owner_user": "Administrator",
        "start_date": today(),
        "end_date": add_days(today(), 30),
        "pdca_phase": "DO",
    }).insert(ignore_permissions=True)
    _PROJECT_NAME = doc.name
    return doc


def _get_project_name():
    global _PROJECT_NAME
    if _PROJECT_NAME:
        return _PROJECT_NAME
    existing = frappe.db.get_value(
        TASK_DOCTYPE,
        {"title": _PROJECT_TITLE, "node_type": PROJECT_NODE_TYPE},
        "name",
    )
    if existing:
        _PROJECT_NAME = existing
    return _PROJECT_NAME


def _make_task(title_suffix, owner_user, pdca_phase="PLAN"):
    # kanban_status is derived by the controller from pdca_phase; never set here.
    return frappe.get_doc({
        "doctype": TASK_DOCTYPE,
        "node_type": TASK_NODE_TYPE,
        "parent_vt_item": _get_project_name(),
        "title": f"MW Task {title_suffix}",
        "owner_user": owner_user,
        "pdca_phase": pdca_phase,
        "start_date": today(),
        "deadline": add_days(today(), 5),
        "weight": 3.0,
        "priority": "Medium",
    }).insert(ignore_permissions=True)


def _make_schedule_entry(task_name, hours=2.0):
    task = frappe.get_doc(TASK_DOCTYPE, task_name)
    task.append("schedule_entries", {
        "date": today(),
        "allocated_minutes": hours,
        "is_override": False,
    })
    task.save(ignore_permissions=True)


class TestMyWorkFocus(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        frappe.set_user("Administrator")
        _make_project()
        cls._created_tasks = []

    @classmethod
    def tearDownClass(cls):
        # Delete Task leaf nodes before the Project parent (nested-set safety).
        for task_name in cls._created_tasks:
            if frappe.db.exists(TASK_DOCTYPE, task_name):
                frappe.delete_doc(TASK_DOCTYPE, task_name, force=True)
        project_name = _get_project_name()
        if project_name and frappe.db.exists(TASK_DOCTYPE, project_name):
            frappe.delete_doc(TASK_DOCTYPE, project_name, force=True)
        frappe.db.commit()

    def setUp(self):
        frappe.set_user("Administrator")
        self._test_tasks = []

    def tearDown(self):
        # Tasks are leaf nodes under the project; safe to delete directly.
        for task_name in self._test_tasks:
            if frappe.db.exists(TASK_DOCTYPE, task_name):
                frappe.delete_doc(TASK_DOCTYPE, task_name, force=True)
        frappe.db.commit()

    def _track(self, doc):
        """Track a created task node for cleanup."""
        self._test_tasks.append(doc.name)
        self.__class__._created_tasks.append(doc.name)
        return doc

    # --- get_my_day ---

    def test_get_my_day_returns_todays_entries(self):
        task = self._track(_make_task("day-1", "Administrator"))
        _make_schedule_entry(task.name, hours=2.0)

        from vernon_tasks.task.api.my_work import get_my_day
        result = get_my_day()

        names = [r["name"] for r in result]
        self.assertIn(task.name, names)

    def test_get_my_day_excludes_done_tasks(self):
        task = self._track(_make_task("day-done", "Administrator", pdca_phase="CLOSED"))
        _make_schedule_entry(task.name)

        from vernon_tasks.task.api.my_work import get_my_day
        result = get_my_day()

        names = [r["name"] for r in result]
        self.assertNotIn(task.name, names)

    # --- get_what_to_do_today ---

    def test_get_what_to_do_today_includes_due_soon(self):
        task = self._track(frappe.get_doc({
            "doctype": TASK_DOCTYPE,
            "node_type": TASK_NODE_TYPE,
            "parent_vt_item": _get_project_name(),
            "title": "MW Due Soon Task",
            "owner_user": "Administrator",
            "pdca_phase": "PLAN",
            "start_date": today(),
            "deadline": add_days(today(), 2),
            "weight": 2.0,
            "priority": "High",
        }).insert(ignore_permissions=True))

        from vernon_tasks.task.api.my_work import get_what_to_do_today
        result = get_what_to_do_today()
        names = [r["name"] for r in result]
        self.assertIn(task.name, names)

    def test_get_what_to_do_today_excludes_blocked(self):
        blocker = self._track(frappe.get_doc({
            "doctype": TASK_DOCTYPE,
            "node_type": TASK_NODE_TYPE,
            "parent_vt_item": _get_project_name(),
            "title": "MW Blocker A",
            "owner_user": "Administrator",
            "pdca_phase": "DO",
            "start_date": today(),
            "deadline": add_days(today(), 10),
            "weight": 1.0,
            "priority": "Low",
        }).insert(ignore_permissions=True))

        blocked = self._track(frappe.get_doc({
            "doctype": TASK_DOCTYPE,
            "node_type": TASK_NODE_TYPE,
            "parent_vt_item": _get_project_name(),
            "title": "MW Blocked Task A",
            "owner_user": "Administrator",
            "pdca_phase": "PLAN",
            "start_date": today(),
            "deadline": add_days(today(), 1),
            "weight": 2.0,
            "priority": "High",
            "dependencies": [{"blocked_by": blocker.name, "dependency_type": "Finish-to-Start"}],
        }).insert(ignore_permissions=True))

        from vernon_tasks.task.api.my_work import get_what_to_do_today
        result = get_what_to_do_today()
        names = [r["name"] for r in result]
        self.assertNotIn(blocked.name, names)

    # --- get_my_blocked_tasks ---

    def test_get_my_blocked_tasks_returns_blocker_info(self):
        blocker = self._track(frappe.get_doc({
            "doctype": TASK_DOCTYPE,
            "node_type": TASK_NODE_TYPE,
            "parent_vt_item": _get_project_name(),
            "title": "MW The Blocker",
            "owner_user": "Administrator",
            "pdca_phase": "DO",
            "start_date": today(),
            "deadline": add_days(today(), 10),
            "weight": 1.0,
            "priority": "Low",
        }).insert(ignore_permissions=True))

        blocked = self._track(frappe.get_doc({
            "doctype": TASK_DOCTYPE,
            "node_type": TASK_NODE_TYPE,
            "parent_vt_item": _get_project_name(),
            "title": "MW My Blocked Task",
            "owner_user": "Administrator",
            "pdca_phase": "PLAN",
            "start_date": today(),
            "deadline": add_days(today(), 5),
            "weight": 2.0,
            "priority": "High",
            "dependencies": [{"blocked_by": blocker.name, "dependency_type": "Finish-to-Start"}],
        }).insert(ignore_permissions=True))

        from vernon_tasks.task.api.my_work import get_my_blocked_tasks
        result = get_my_blocked_tasks()
        names = [r["name"] for r in result]
        self.assertIn(blocked.name, names)
        row = next(r for r in result if r["name"] == blocked.name)
        self.assertEqual(row["blocker_name"], blocker.name)
        self.assertIn("days_blocked", row)

    # --- start_task ---

    def test_start_task_transitions_to_in_progress(self):
        task = self._track(_make_task("start-1", "Administrator", pdca_phase="PLAN"))

        from vernon_tasks.task.api.my_work import start_task
        result = start_task(task.name)
        self.assertEqual(result["status"], "ok")

        phase = frappe.db.get_value(TASK_DOCTYPE, task.name, "pdca_phase")
        kanban = frappe.db.get_value(TASK_DOCTYPE, task.name, "kanban_status")
        self.assertEqual(phase, "DO")
        self.assertEqual(kanban, "In Progress")

    def test_start_task_rejected_on_wrong_status(self):
        task = self._track(_make_task("start-2", "Administrator", pdca_phase="CHECK"))

        from vernon_tasks.task.api.my_work import start_task
        with self.assertRaises(frappe.ValidationError):
            start_task(task.name)

    def test_start_task_rejected_when_blocked(self):
        blocker = self._track(frappe.get_doc({
            "doctype": TASK_DOCTYPE,
            "node_type": TASK_NODE_TYPE,
            "parent_vt_item": _get_project_name(),
            "title": "MW Blocker B",
            "owner_user": "Administrator",
            "pdca_phase": "DO",
            "start_date": today(),
            "deadline": add_days(today(), 10),
            "weight": 1.0,
            "priority": "Low",
        }).insert(ignore_permissions=True))

        blocked = self._track(frappe.get_doc({
            "doctype": TASK_DOCTYPE,
            "node_type": TASK_NODE_TYPE,
            "parent_vt_item": _get_project_name(),
            "title": "MW Blocked B",
            "owner_user": "Administrator",
            "pdca_phase": "PLAN",
            "start_date": today(),
            "deadline": add_days(today(), 5),
            "weight": 2.0,
            "priority": "High",
            "dependencies": [{"blocked_by": blocker.name, "dependency_type": "Finish-to-Start"}],
        }).insert(ignore_permissions=True))

        from vernon_tasks.task.api.my_work import start_task
        with self.assertRaises(frappe.ValidationError):
            start_task(blocked.name)

    # --- submit_for_review ---

    def test_submit_for_review_transitions_to_in_review(self):
        task = self._track(_make_task("sfr-1", "Administrator", pdca_phase="DO"))

        from vernon_tasks.task.api.my_work import submit_for_review
        result = submit_for_review(task.name)
        self.assertEqual(result["status"], "ok")

        phase = frappe.db.get_value(TASK_DOCTYPE, task.name, "pdca_phase")
        kanban = frappe.db.get_value(TASK_DOCTYPE, task.name, "kanban_status")
        self.assertEqual(phase, "CHECK")
        self.assertEqual(kanban, "In Review")

    def test_submit_for_review_rejected_on_wrong_status(self):
        task = self._track(_make_task("sfr-2", "Administrator", pdca_phase="PLAN"))

        from vernon_tasks.task.api.my_work import submit_for_review
        with self.assertRaises(frappe.ValidationError):
            submit_for_review(task.name)

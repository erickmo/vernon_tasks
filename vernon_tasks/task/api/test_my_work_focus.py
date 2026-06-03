import frappe
import unittest
from frappe.utils import today, add_days

# Module-level variable to hold the actual project name (auto-generated)
_PROJECT_NAME = None
_PROJECT_TITLE = "Test My Work Project - MW"
_FIXTURE_BRAND = "TEST-MY-WORK-BRAND"


def _ensure_brand():
    if not frappe.db.exists("VT Brand", _FIXTURE_BRAND):
        frappe.get_doc({
            "doctype": "VT Brand",
            "brand_name": _FIXTURE_BRAND,
        }).insert(ignore_permissions=True)
    return _FIXTURE_BRAND


def _make_project():
    global _PROJECT_NAME
    if _PROJECT_NAME and frappe.db.exists("VT Project", _PROJECT_NAME):
        return frappe.get_doc("VT Project", _PROJECT_NAME)
    existing = frappe.db.get_value("VT Project", {"title": _PROJECT_TITLE}, "name")
    if existing:
        _PROJECT_NAME = existing
        return frappe.get_doc("VT Project", _PROJECT_NAME)
    doc = frappe.get_doc({
        "doctype": "VT Project",
        "title": _PROJECT_TITLE,
        "brand": _ensure_brand(),
        "project_owner": "Administrator",
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
    existing = frappe.db.get_value("VT Project", {"title": _PROJECT_TITLE}, "name")
    if existing:
        _PROJECT_NAME = existing
    return _PROJECT_NAME


def _make_task(title_suffix, assigned_to, pdca_phase="PLAN", kanban_status="Scheduled"):
    return frappe.get_doc({
        "doctype": "VT Task",
        "title": f"MW Task {title_suffix}",
        "project": _get_project_name(),
        "assigned_to": assigned_to,
        "pdca_phase": pdca_phase,
        "kanban_status": kanban_status,
        "start_date": today(),
        "deadline": add_days(today(), 5),
        "weight": 3.0,
        "priority": "Medium",
    }).insert(ignore_permissions=True)


def _make_schedule_entry(task_name, hours=2.0):
    task = frappe.get_doc("VT Task", task_name)
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
        for task_name in cls._created_tasks:
            if frappe.db.exists("VT Task", task_name):
                frappe.delete_doc("VT Task", task_name, force=True)
        project_name = _get_project_name()
        if project_name and frappe.db.exists("VT Project", project_name):
            frappe.delete_doc("VT Project", project_name, force=True)
        frappe.db.commit()

    def setUp(self):
        frappe.set_user("Administrator")
        self._test_tasks = []

    def tearDown(self):
        for task_name in self._test_tasks:
            if frappe.db.exists("VT Task", task_name):
                frappe.delete_doc("VT Task", task_name, force=True)
        frappe.db.commit()

    def _track(self, doc):
        """Track a created task for cleanup."""
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
        task = self._track(_make_task("day-done", "Administrator", pdca_phase="DONE", kanban_status="Done"))
        _make_schedule_entry(task.name)

        from vernon_tasks.task.api.my_work import get_my_day
        result = get_my_day()

        names = [r["name"] for r in result]
        self.assertNotIn(task.name, names)

    # --- get_what_to_do_today ---

    def test_get_what_to_do_today_includes_due_soon(self):
        task = self._track(frappe.get_doc({
            "doctype": "VT Task",
            "title": "MW Due Soon Task",
            "project": _get_project_name(),
            "assigned_to": "Administrator",
            "pdca_phase": "PLAN",
            "kanban_status": "Scheduled",
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
            "doctype": "VT Task",
            "title": "MW Blocker A",
            "project": _get_project_name(),
            "assigned_to": "Administrator",
            "pdca_phase": "DO",
            "kanban_status": "In Progress",
            "start_date": today(),
            "deadline": add_days(today(), 10),
            "weight": 1.0,
            "priority": "Low",
        }).insert(ignore_permissions=True))

        blocked = self._track(frappe.get_doc({
            "doctype": "VT Task",
            "title": "MW Blocked Task A",
            "project": _get_project_name(),
            "assigned_to": "Administrator",
            "pdca_phase": "PLAN",
            "kanban_status": "Scheduled",
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
            "doctype": "VT Task",
            "title": "MW The Blocker",
            "project": _get_project_name(),
            "assigned_to": "Administrator",
            "pdca_phase": "DO",
            "kanban_status": "In Progress",
            "start_date": today(),
            "deadline": add_days(today(), 10),
            "weight": 1.0,
            "priority": "Low",
        }).insert(ignore_permissions=True))

        blocked = self._track(frappe.get_doc({
            "doctype": "VT Task",
            "title": "MW My Blocked Task",
            "project": _get_project_name(),
            "assigned_to": "Administrator",
            "pdca_phase": "PLAN",
            "kanban_status": "Scheduled",
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
        task = self._track(_make_task("start-1", "Administrator", pdca_phase="PLAN", kanban_status="Scheduled"))

        from vernon_tasks.task.api.my_work import start_task
        result = start_task(task.name)
        self.assertEqual(result["status"], "ok")

        phase = frappe.db.get_value("VT Task", task.name, "pdca_phase")
        kanban = frappe.db.get_value("VT Task", task.name, "kanban_status")
        self.assertEqual(phase, "DO")
        self.assertEqual(kanban, "In Progress")

    def test_start_task_rejected_on_wrong_status(self):
        task = self._track(_make_task("start-2", "Administrator", pdca_phase="CHECK", kanban_status="In Review"))

        from vernon_tasks.task.api.my_work import start_task
        with self.assertRaises(frappe.ValidationError):
            start_task(task.name)

    def test_start_task_rejected_when_blocked(self):
        blocker = self._track(frappe.get_doc({
            "doctype": "VT Task",
            "title": "MW Blocker B",
            "project": _get_project_name(),
            "assigned_to": "Administrator",
            "pdca_phase": "DO",
            "kanban_status": "In Progress",
            "start_date": today(),
            "deadline": add_days(today(), 10),
            "weight": 1.0,
            "priority": "Low",
        }).insert(ignore_permissions=True))

        blocked = self._track(frappe.get_doc({
            "doctype": "VT Task",
            "title": "MW Blocked B",
            "project": _get_project_name(),
            "assigned_to": "Administrator",
            "pdca_phase": "PLAN",
            "kanban_status": "Scheduled",
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
        task = self._track(_make_task("sfr-1", "Administrator", pdca_phase="DO", kanban_status="In Progress"))

        from vernon_tasks.task.api.my_work import submit_for_review
        result = submit_for_review(task.name)
        self.assertEqual(result["status"], "ok")

        phase = frappe.db.get_value("VT Task", task.name, "pdca_phase")
        kanban = frappe.db.get_value("VT Task", task.name, "kanban_status")
        self.assertEqual(phase, "CHECK")
        self.assertEqual(kanban, "In Review")

    def test_submit_for_review_rejected_on_wrong_status(self):
        task = self._track(_make_task("sfr-2", "Administrator", pdca_phase="PLAN", kanban_status="Scheduled"))

        from vernon_tasks.task.api.my_work import submit_for_review
        with self.assertRaises(frappe.ValidationError):
            submit_for_review(task.name)

import frappe
import unittest
from frappe.utils import today, add_days, get_first_day_of_week, get_last_day_of_week

_PROJECT_NAME = None
_PROJECT_TITLE = "Test My Dashboard Project - MD"


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


def _make_task(suffix, assigned_to, pdca_phase="PLAN", kanban_status="Scheduled",
               estimated_hours=4.0, actual_hours=0.0, earned_points=0.0,
               completion_date=None, deadline_offset=5):
    doc = frappe.get_doc({
        "doctype": "VT Task",
        "title": f"MD Task {suffix}",
        "project": _get_project_name(),
        "assigned_to": assigned_to,
        "pdca_phase": pdca_phase,
        "kanban_status": kanban_status,
        "start_date": today(),
        "deadline": add_days(today(), deadline_offset),
        "weight": 3.0,
        "priority": "Medium",
        "estimated_hours": estimated_hours,
        "actual_hours": actual_hours,
        "earned_points": earned_points,
    }).insert(ignore_permissions=True)
    if completion_date:
        frappe.db.set_value("VT Task", doc.name, "completion_date", completion_date)
    return doc


class TestEmployeeDashboardAPI(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        frappe.set_user("Administrator")
        _make_project()
        cls._created_tasks = []

    @classmethod
    def tearDownClass(cls):
        for name in cls._created_tasks:
            if frappe.db.exists("VT Task", name):
                frappe.delete_doc("VT Task", name, force=True)
        pn = _get_project_name()
        if pn and frappe.db.exists("VT Project", pn):
            frappe.delete_doc("VT Project", pn, force=True)
        frappe.db.commit()

    def setUp(self):
        frappe.set_user("Administrator")
        self._test_tasks = []

    def tearDown(self):
        for name in self._test_tasks:
            if frappe.db.exists("VT Task", name):
                frappe.delete_doc("VT Task", name, force=True)
        frappe.db.commit()

    def _track(self, doc):
        self._test_tasks.append(doc.name)
        self.__class__._created_tasks.append(doc.name)
        return doc

    # --- get_employee_stats ---

    def test_get_employee_stats_returns_required_keys(self):
        from vernon_tasks.task.page.my_dashboard.my_dashboard import get_employee_stats
        result = get_employee_stats()
        for key in ("done_today", "done_week", "points_month", "blocked"):
            self.assertIn(key, result)

    def test_done_today_counts_task_completed_today(self):
        self._track(_make_task("done-today", "Administrator",
                               pdca_phase="DONE", kanban_status="Done",
                               completion_date=today(), earned_points=5.0))
        from vernon_tasks.task.page.my_dashboard.my_dashboard import get_employee_stats
        result = get_employee_stats()
        self.assertGreaterEqual(result["done_today"], 1)

    def test_done_today_excludes_not_done_task(self):
        before = self._get_done_today_count()
        self._track(_make_task("active-task", "Administrator",
                               pdca_phase="DO", kanban_status="In Progress"))
        from vernon_tasks.task.page.my_dashboard.my_dashboard import get_employee_stats
        result = get_employee_stats()
        self.assertEqual(result["done_today"], before)

    def _get_done_today_count(self):
        from vernon_tasks.task.page.my_dashboard.my_dashboard import get_employee_stats
        return get_employee_stats()["done_today"]

    def test_points_month_sums_earned_points_this_month(self):
        self._track(_make_task("points-task", "Administrator",
                               pdca_phase="DONE", kanban_status="Done",
                               completion_date=today(), earned_points=10.0))
        from vernon_tasks.task.page.my_dashboard.my_dashboard import get_employee_stats
        result = get_employee_stats()
        self.assertGreaterEqual(result["points_month"], 10.0)

    def test_blocked_counts_tasks_with_active_blockers(self):
        blocker = self._track(_make_task("blocker", "Administrator",
                                         pdca_phase="DO", kanban_status="In Progress"))
        blocked = self._track(_make_task("blocked", "Administrator"))
        blocked_doc = frappe.get_doc("VT Task", blocked.name)
        blocked_doc.append("dependencies", {"blocked_by": blocker.name})
        blocked_doc.save(ignore_permissions=True)

        from vernon_tasks.task.page.my_dashboard.my_dashboard import get_employee_stats
        result = get_employee_stats()
        self.assertGreaterEqual(result["blocked"], 1)

    # --- get_daily_completions ---

    def test_get_daily_completions_returns_7_entries(self):
        from vernon_tasks.task.page.my_dashboard.my_dashboard import get_daily_completions
        result = get_daily_completions()
        self.assertEqual(len(result), 7)

    def test_get_daily_completions_has_date_and_count_keys(self):
        from vernon_tasks.task.page.my_dashboard.my_dashboard import get_daily_completions
        result = get_daily_completions()
        for row in result:
            self.assertIn("date", row)
            self.assertIn("count", row)

    def test_get_daily_completions_counts_todays_completions(self):
        self._track(_make_task("daily-done", "Administrator",
                               pdca_phase="DONE", kanban_status="Done",
                               completion_date=today(), earned_points=3.0))
        from vernon_tasks.task.page.my_dashboard.my_dashboard import get_daily_completions
        result = get_daily_completions()
        today_row = next((r for r in result if r["date"] == today()), None)
        self.assertIsNotNone(today_row)
        self.assertGreaterEqual(today_row["count"], 1)

    # --- get_hours_summary ---

    def test_get_hours_summary_returns_actual_and_estimated(self):
        from vernon_tasks.task.page.my_dashboard.my_dashboard import get_hours_summary
        result = get_hours_summary()
        self.assertIn("actual_hours", result)
        self.assertIn("estimated_hours", result)

    def test_get_hours_summary_sums_active_tasks(self):
        self._track(_make_task("hours-active", "Administrator",
                               pdca_phase="DO", kanban_status="In Progress",
                               estimated_hours=8.0, actual_hours=3.0))
        from vernon_tasks.task.page.my_dashboard.my_dashboard import get_hours_summary
        result = get_hours_summary()
        self.assertGreaterEqual(result["actual_hours"], 3.0)
        self.assertGreaterEqual(result["estimated_hours"], 8.0)

    def test_get_hours_summary_excludes_done_tasks(self):
        before = self._get_hours_summary_actual()
        self._track(_make_task("hours-done", "Administrator",
                               pdca_phase="DONE", kanban_status="Done",
                               estimated_hours=8.0, actual_hours=8.0,
                               completion_date=today()))
        from vernon_tasks.task.page.my_dashboard.my_dashboard import get_hours_summary
        result = get_hours_summary()
        self.assertEqual(result["actual_hours"], before)

    def _get_hours_summary_actual(self):
        from vernon_tasks.task.page.my_dashboard.my_dashboard import get_hours_summary
        return get_hours_summary()["actual_hours"]

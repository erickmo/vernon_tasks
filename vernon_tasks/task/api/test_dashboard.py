import frappe
from frappe.tests.utils import FrappeTestCase

from vernon_tasks.task.api.dashboard import (
    _calc_risk,
    me_progress,
    my_projects,
    project_detail,
    schedule_agenda,
)

_FIXTURE_PROJECT = "TEST-DASHBOARD-PROJ"
_FIXTURE_BRAND = "TEST-DASHBOARD-BRAND"


def _ensure_brand():
    # VT Project.brand is mandatory; create a dedicated test brand once.
    if not frappe.db.exists("VT Brand", _FIXTURE_BRAND):
        frappe.get_doc({
            "doctype": "VT Brand",
            "brand_name": _FIXTURE_BRAND,
        }).insert(ignore_permissions=True)
    return _FIXTURE_BRAND


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


def _ensure_project(owner):
    if not frappe.db.exists("VT Project", _FIXTURE_PROJECT):
        p = frappe.get_doc({
            "doctype": "VT Project",
            "name": _FIXTURE_PROJECT,
            "title": "Test Dashboard Project",
            "brand": _ensure_brand(),
            "project_owner": owner,
            "project_leader": owner,
            "start_date": "2025-01-01",
            "end_date": "2025-12-31",
        })
        p.flags.name_set = True
        p.insert(ignore_permissions=True)
    return _FIXTURE_PROJECT


class TestDashboard(FrappeTestCase):
    def setUp(self):
        self.user_a = _ensure_user("a-dash@test.local")
        self.project = _ensure_project(self.user_a)
        frappe.db.delete("VT Task", {"project": self.project})

    def tearDown(self):
        frappe.set_user("Administrator")

    def _make_task(self, owner, deadline, status="Backlog", points=3, title="T"):
        doc = frappe.get_doc({
            "doctype": "VT Task",
            "title": title,
            "deadline": deadline,
            "assigned_to": owner,
            "project": self.project,
            "kanban_status": status,
            "base_points": points,
        })
        doc.flags.ignore_links = True
        return doc.insert(ignore_permissions=True)

    # ── _calc_risk ──
    def test_calc_risk_behind(self):
        self.assertEqual(_calc_risk(40.0, 70.0), "behind")

    def test_calc_risk_on_track_when_early(self):
        self.assertEqual(_calc_risk(20.0, 30.0), "on_track")

    def test_calc_risk_boundary(self):
        # elapsed = 60 (not > 60) → on_track
        self.assertEqual(_calc_risk(40.0, 60.0), "on_track")

    # ── me_progress ──
    def test_me_progress_keys(self):
        frappe.set_user(self.user_a)
        result = me_progress()
        for key in ("velocity", "velocity_delta", "sprint", "workload", "next_actions"):
            self.assertIn(key, result)
        self.assertEqual(len(result["velocity"]), 8)
        for k in ("open", "overdue", "due_soon"):
            self.assertIn(k, result["workload"])

    def test_me_progress_workload_overdue(self):
        frappe.set_user("Administrator")
        today = frappe.utils.today()
        self._make_task(self.user_a, frappe.utils.add_days(today, -3), title="late")
        self._make_task(self.user_a, frappe.utils.add_days(today, 1), title="soon")
        frappe.set_user(self.user_a)
        result = me_progress()
        self.assertGreaterEqual(result["workload"]["overdue"], 1)
        self.assertGreaterEqual(result["workload"]["due_soon"], 1)
        self.assertGreaterEqual(len(result["next_actions"]), 2)

    # ── my_projects ──
    def test_my_projects_returns_shape(self):
        frappe.set_user(self.user_a)
        result = my_projects()
        for key in ("is_admin", "led", "member"):
            self.assertIn(key, result)
        self.assertIsInstance(result["led"], list)
        self.assertIsInstance(result["member"], list)

    def test_my_projects_filter_led(self):
        frappe.set_user(self.user_a)
        result = my_projects(filter="led")
        self.assertEqual(result["member"], [])

    # ── project_detail ──
    def test_project_detail_shape(self):
        frappe.set_user("Administrator")
        self._make_task(self.user_a, frappe.utils.today(), title="open task")
        frappe.set_user(self.user_a)
        result = project_detail(self.project)
        for key in ("header", "open_tasks", "team_members", "milestones", "blockers"):
            self.assertIn(key, result)
        self.assertEqual(result["header"]["id"], self.project)
        self.assertIsInstance(result["open_tasks"], list)
        self.assertGreaterEqual(len(result["open_tasks"]), 1)

    def test_project_detail_forbidden(self):
        # A user with no access to the project must be rejected.
        outsider = _ensure_user("outsider-dash@test.local")
        frappe.set_user(outsider)
        with self.assertRaises(frappe.PermissionError):
            project_detail(self.project)

    # ── schedule_agenda ──
    def test_schedule_agenda_shape(self):
        frappe.set_user(self.user_a)
        result = schedule_agenda()
        for key in ("today_summary", "days"):
            self.assertIn(key, result)
        for k in ("tasks", "meetings", "sprint_events"):
            self.assertIn(k, result["today_summary"])

    def test_schedule_agenda_window_includes_today(self):
        frappe.set_user("Administrator")
        today = frappe.utils.today()
        self._make_task(self.user_a, today, title="due today")
        frappe.set_user(self.user_a)
        result = schedule_agenda()
        self.assertGreaterEqual(result["today_summary"]["tasks"], 1)
        first = result["days"][0] if result["days"] else None
        self.assertIsNotNone(first)
        self.assertEqual(first["label"], "Today")

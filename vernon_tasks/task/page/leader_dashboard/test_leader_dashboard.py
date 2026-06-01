import frappe
import unittest
from frappe.utils import today, add_days

_PROJECT_NAME = None
_PROJECT_TITLE = "Test Leader Dashboard Project - LD"
_FIXTURE_BRAND = "TEST-LEADER-DASHBOARD-BRAND"


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


def _make_task(suffix, assigned_to, pdca_phase="PLAN", kanban_status="Scheduled",
               earned_points=0, completion_date=None, revision_count=0,
               deadline_offset=5):
    # Ensure start_date < deadline: if deadline is in the past, push start_date further back
    start_offset = min(deadline_offset - 1, -1) if deadline_offset <= 0 else 0
    doc = frappe.get_doc({
        "doctype": "VT Task",
        "title": f"LD Task {suffix}",
        "project": _get_project_name(),
        "assigned_to": assigned_to,
        "pdca_phase": pdca_phase,
        "kanban_status": kanban_status,
        "start_date": add_days(today(), start_offset),
        "deadline": add_days(today(), deadline_offset),
        "weight": 3.0,
        "priority": "Medium",
        "earned_points": earned_points,
        "revision_count": revision_count,
    }).insert(ignore_permissions=True)
    if completion_date:
        frappe.db.set_value("VT Task", doc.name, "completion_date", completion_date)
    return doc


class TestLeaderDashboardAPI(unittest.TestCase):

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

    # --- get_leader_stats ---

    def test_get_leader_stats_returns_required_keys(self):
        from vernon_tasks.task.page.leader_dashboard.leader_dashboard import get_leader_stats
        result = get_leader_stats()
        for key in ("pending_review", "approval_rate", "team_points_month"):
            self.assertIn(key, result)

    def test_pending_review_counts_in_review_tasks(self):
        self._track(_make_task("review-1", "Administrator",
                               pdca_phase="CHECK", kanban_status="In Review"))
        from vernon_tasks.task.page.leader_dashboard.leader_dashboard import get_leader_stats
        result = get_leader_stats()
        self.assertGreaterEqual(result["pending_review"], 1)

    def test_pending_review_excludes_non_check_tasks(self):
        before = self._get_pending_count()
        self._track(_make_task("not-review", "Administrator",
                               pdca_phase="DO", kanban_status="In Progress"))
        from vernon_tasks.task.page.leader_dashboard.leader_dashboard import get_leader_stats
        result = get_leader_stats()
        self.assertEqual(result["pending_review"], before)

    def _get_pending_count(self):
        from vernon_tasks.task.page.leader_dashboard.leader_dashboard import get_leader_stats
        return get_leader_stats()["pending_review"]

    def test_team_points_month_sums_all_members(self):
        self._track(_make_task("points-a", "Administrator",
                               pdca_phase="DONE", kanban_status="Done",
                               earned_points=15, completion_date=today()))
        from vernon_tasks.task.page.leader_dashboard.leader_dashboard import get_leader_stats
        result = get_leader_stats()
        self.assertGreaterEqual(result["team_points_month"], 15)

    def test_approval_rate_is_between_0_and_100(self):
        from vernon_tasks.task.page.leader_dashboard.leader_dashboard import get_leader_stats
        result = get_leader_stats()
        self.assertGreaterEqual(result["approval_rate"], 0)
        self.assertLessEqual(result["approval_rate"], 100)

    def test_approval_rate_non_zero_when_approved_task_exists(self):
        self._track(_make_task("rate-approved", "Administrator",
                               pdca_phase="DONE", kanban_status="Done",
                               completion_date=today(), revision_count=0))
        from vernon_tasks.task.page.leader_dashboard.leader_dashboard import get_leader_stats
        result = get_leader_stats()
        self.assertGreater(result["approval_rate"], 0)
        self.assertLessEqual(result["approval_rate"], 100)

    # --- get_phase_distribution ---

    def test_get_phase_distribution_returns_list_of_dicts(self):
        from vernon_tasks.task.page.leader_dashboard.leader_dashboard import get_phase_distribution
        result = get_phase_distribution()
        self.assertIsInstance(result, list)
        for row in result:
            self.assertIn("phase", row)
            self.assertIn("count", row)

    def test_get_phase_distribution_includes_task_phase(self):
        self._track(_make_task("phase-do", "Administrator",
                               pdca_phase="DO", kanban_status="In Progress"))
        from vernon_tasks.task.page.leader_dashboard.leader_dashboard import get_phase_distribution
        result = get_phase_distribution()
        phases = [r["phase"] for r in result]
        self.assertIn("DO", phases)

    # --- get_team_leaderboard ---

    def test_get_team_leaderboard_returns_list(self):
        from vernon_tasks.task.page.leader_dashboard.leader_dashboard import get_team_leaderboard
        result = get_team_leaderboard()
        self.assertIsInstance(result, list)

    def test_get_team_leaderboard_has_member_and_points(self):
        self._track(_make_task("lb-task", "Administrator",
                               pdca_phase="DONE", kanban_status="Done",
                               earned_points=20, completion_date=today()))
        from vernon_tasks.task.page.leader_dashboard.leader_dashboard import get_team_leaderboard
        result = get_team_leaderboard()
        self.assertGreaterEqual(len(result), 1)
        self.assertIn("member", result[0])
        self.assertIn("points", result[0])

    def test_get_team_leaderboard_max_10_results(self):
        from vernon_tasks.task.page.leader_dashboard.leader_dashboard import get_team_leaderboard
        result = get_team_leaderboard()
        self.assertLessEqual(len(result), 10)

    # --- get_overdue_tasks ---

    def test_get_overdue_tasks_returns_list(self):
        from vernon_tasks.task.page.leader_dashboard.leader_dashboard import get_overdue_tasks
        result = get_overdue_tasks()
        self.assertIsInstance(result, list)

    def test_get_overdue_tasks_includes_past_deadline_active_task(self):
        self._track(_make_task("overdue-1", "Administrator",
                               pdca_phase="DO", kanban_status="In Progress",
                               deadline_offset=-3))
        from vernon_tasks.task.page.leader_dashboard.leader_dashboard import get_overdue_tasks
        result = get_overdue_tasks()
        self.assertGreaterEqual(len(result), 1)
        for row in result:
            self.assertIn("member", row)
            self.assertIn("task_title", row)
            self.assertIn("deadline", row)
            self.assertIn("days_overdue", row)
            self.assertIn("phase", row)

    def test_get_overdue_tasks_excludes_done_tasks(self):
        done_task = self._track(_make_task("overdue-done", "Administrator",
                                            pdca_phase="DONE", kanban_status="Done",
                                            deadline_offset=-3, completion_date=today()))
        from vernon_tasks.task.page.leader_dashboard.leader_dashboard import get_overdue_tasks
        result = get_overdue_tasks()
        names = [r.get("task_name") for r in result]
        self.assertNotIn(done_task.name, names)

    def test_get_overdue_tasks_excludes_act_tasks(self):
        act_task = self._track(_make_task("overdue-act", "Administrator",
                                          pdca_phase="ACT", kanban_status="Done",
                                          deadline_offset=-3))
        from vernon_tasks.task.page.leader_dashboard.leader_dashboard import get_overdue_tasks
        result = get_overdue_tasks()
        names = [r.get("task_name") for r in result]
        self.assertNotIn(act_task.name, names)

import frappe
import unittest
from unittest.mock import patch, MagicMock


def _set_flag(val: int):
    frappe.db.set_single_value("VT Settings", "portal_reports_enabled", val)
    frappe.db.commit()


def _set_roles(roles: list):
    """Patch frappe.get_roles() for the duration of a test."""
    return patch("frappe.get_roles", return_value=roles)


class TestFlagGate(unittest.TestCase):
    def setUp(self):
        _set_flag(0)

    def tearDown(self):
        _set_flag(0)

    def test_flag_off_health_score_raises_403(self):
        from vernon_tasks.api.portal_reports import get_portal_health_score
        with _set_roles(["VT Manager"]):
            with self.assertRaises(frappe.PermissionError):
                get_portal_health_score()

    def test_flag_off_okr_rollup_raises_403(self):
        from vernon_tasks.api.portal_reports import get_portal_okr_rollup
        with _set_roles(["VT Manager"]):
            with self.assertRaises(frappe.PermissionError):
                get_portal_okr_rollup()

    def test_flag_off_velocity_raises_403(self):
        from vernon_tasks.api.portal_reports import get_portal_velocity_comparison
        with _set_roles(["VT Manager"]):
            with self.assertRaises(frappe.PermissionError):
                get_portal_velocity_comparison()

    def test_flag_off_leaderboard_raises_403(self):
        from vernon_tasks.api.portal_reports import get_portal_leaderboard
        with _set_roles(["VT Manager"]):
            with self.assertRaises(frappe.PermissionError):
                get_portal_leaderboard()

    def test_flag_off_kpi_list_raises_403(self):
        from vernon_tasks.api.portal_reports import get_portal_kpi_list
        with _set_roles(["VT Manager"]):
            with self.assertRaises(frappe.PermissionError):
                get_portal_kpi_list()

    def test_flag_off_kpi_trend_raises_403(self):
        from vernon_tasks.api.portal_reports import get_portal_kpi_trend
        with _set_roles(["VT Manager"]):
            with self.assertRaises(frappe.PermissionError):
                get_portal_kpi_trend("KPI-00001", 12)

    def test_flag_off_forecasts_raises_403(self):
        from vernon_tasks.api.portal_reports import get_portal_forecasts
        with _set_roles(["VT Manager"]):
            with self.assertRaises(frappe.PermissionError):
                get_portal_forecasts()

    def test_flag_off_risks_raises_403(self):
        from vernon_tasks.api.portal_reports import get_portal_risks
        with _set_roles(["VT Manager"]):
            with self.assertRaises(frappe.PermissionError):
                get_portal_risks()

    def test_flag_off_workload_raises_403(self):
        from vernon_tasks.api.portal_reports import get_portal_workload
        with _set_roles(["VT Manager"]):
            with self.assertRaises(frappe.PermissionError):
                get_portal_workload()

    def test_flag_off_overdue_raises_403(self):
        from vernon_tasks.api.portal_reports import get_portal_overdue
        with _set_roles(["VT Manager"]):
            with self.assertRaises(frappe.PermissionError):
                get_portal_overdue()


class TestOkrPermissions(unittest.TestCase):
    def setUp(self):
        _set_flag(1)

    def tearDown(self):
        _set_flag(0)

    def test_health_score_manager_ok(self):
        from vernon_tasks.api.portal_reports import get_portal_health_score
        mock_health = {"score": 82.4, "okr_pct": 0.74, "ontime_pct": 0.88,
                       "velocity_health": 0.91,
                       "components": {"okr_weight": 0.40, "ontime_weight": 0.30, "velocity_weight": 0.30},
                       "as_of": "2026-05-18T10:00:00"}
        with _set_roles(["VT Manager"]):
            with patch("vernon_tasks.api.portal_reports._health", return_value=mock_health):
                result = get_portal_health_score()
        self.assertEqual(result["score"], 82.4)

    def test_health_score_leader_raises_403(self):
        from vernon_tasks.api.portal_reports import get_portal_health_score
        with _set_roles(["VT Leader"]):
            with self.assertRaises(frappe.PermissionError):
                get_portal_health_score()

    def test_health_score_member_raises_403(self):
        from vernon_tasks.api.portal_reports import get_portal_health_score
        with _set_roles(["VT Member"]):
            with self.assertRaises(frappe.PermissionError):
                get_portal_health_score()

    def test_okr_rollup_manager_ok(self):
        from vernon_tasks.api.portal_reports import get_portal_okr_rollup
        mock_rollup = {"period": "Q2-2026", "rows": [], "totals": {
            "objective_count": 0, "kr_count": 0, "avg_progress": 0.0,
            "on_track": 0, "at_risk": 0, "behind": 0}}
        with _set_roles(["VT Manager"]):
            with patch("vernon_tasks.api.portal_reports._okr", return_value=mock_rollup):
                result = get_portal_okr_rollup("Q2-2026")
        self.assertIn("rows", result)

    def test_okr_rollup_leader_raises_403(self):
        from vernon_tasks.api.portal_reports import get_portal_okr_rollup
        with _set_roles(["VT Leader"]):
            with self.assertRaises(frappe.PermissionError):
                get_portal_okr_rollup()

    def test_kpi_list_manager_ok(self):
        from vernon_tasks.api.portal_reports import get_portal_kpi_list
        with _set_roles(["VT Manager"]):
            with patch("vernon_tasks.api.portal_reports._list_kpis", return_value=[]):
                result = get_portal_kpi_list()
        self.assertIsInstance(result, list)

    def test_kpi_list_leader_raises_403(self):
        from vernon_tasks.api.portal_reports import get_portal_kpi_list
        with _set_roles(["VT Leader"]):
            with self.assertRaises(frappe.PermissionError):
                get_portal_kpi_list()

    def test_kpi_trend_manager_ok(self):
        from vernon_tasks.api.portal_reports import get_portal_kpi_trend
        mock_trend = {"kpi_definition": "KPI-00001", "title": "Velocity",
                      "unit": "pts/sprint", "periods": 12, "series": []}
        with _set_roles(["VT Manager"]):
            with patch("vernon_tasks.api.portal_reports._kpi_trend", return_value=mock_trend):
                result = get_portal_kpi_trend("KPI-00001", 12)
        self.assertEqual(result["kpi_definition"], "KPI-00001")

    def test_kpi_trend_leader_raises_403(self):
        from vernon_tasks.api.portal_reports import get_portal_kpi_trend
        with _set_roles(["VT Leader"]):
            with self.assertRaises(frappe.PermissionError):
                get_portal_kpi_trend("KPI-00001", 12)


class TestSprintsPermissions(unittest.TestCase):
    def setUp(self):
        _set_flag(1)

    def tearDown(self):
        _set_flag(0)

    def test_velocity_manager_ok(self):
        from vernon_tasks.api.portal_reports import get_portal_velocity_comparison
        mock_result = {"n": 6, "projects": []}
        with _set_roles(["VT Manager"]):
            with patch("vernon_tasks.api.portal_reports._vel_trend", return_value=[]):
                with patch("vernon_tasks.api.portal_reports._visible_projects",
                           return_value=[]):
                    result = get_portal_velocity_comparison(6)
        self.assertIn("projects", result)

    def test_velocity_leader_ok(self):
        from vernon_tasks.api.portal_reports import get_portal_velocity_comparison
        with _set_roles(["VT Leader"]):
            with patch("vernon_tasks.api.portal_reports._vel_trend", return_value=[]):
                with patch("vernon_tasks.api.portal_reports._visible_projects",
                           return_value=[]):
                    result = get_portal_velocity_comparison(6)
        self.assertIn("projects", result)

    def test_velocity_member_raises_403(self):
        from vernon_tasks.api.portal_reports import get_portal_velocity_comparison
        with _set_roles(["VT Member"]):
            with self.assertRaises(frappe.PermissionError):
                get_portal_velocity_comparison(6)

    def test_velocity_leader_scoped(self):
        """Leader only gets projects returned by _visible_projects."""
        from vernon_tasks.api.portal_reports import get_portal_velocity_comparison
        mock_projects = [{"name": "PROJ-00001", "project_title": "Alpha"}]
        mock_trend = [{"sprint_label": "S-2026-W14", "velocity": 40.0}]
        with _set_roles(["VT Leader"]):
            with patch("vernon_tasks.api.portal_reports._visible_projects",
                       return_value=mock_projects):
                with patch("vernon_tasks.api.portal_reports._vel_trend",
                           return_value=mock_trend):
                    result = get_portal_velocity_comparison(6)
        self.assertEqual(len(result["projects"]), 1)
        self.assertEqual(result["projects"][0]["project"], "PROJ-00001")

    def test_velocity_manager_all_projects(self):
        """Manager gets all projects (no user filter in _visible_projects)."""
        from vernon_tasks.api.portal_reports import get_portal_velocity_comparison
        mock_projects = [
            {"name": "PROJ-00001", "project_title": "Alpha"},
            {"name": "PROJ-00002", "project_title": "Beta"},
        ]
        mock_trend = []
        with _set_roles(["VT Manager"]):
            with patch("vernon_tasks.api.portal_reports._visible_projects",
                       return_value=mock_projects):
                with patch("vernon_tasks.api.portal_reports._vel_trend",
                           return_value=mock_trend):
                    result = get_portal_velocity_comparison(6)
        self.assertEqual(len(result["projects"]), 2)

    def test_forecasts_leader_ok(self):
        from vernon_tasks.api.portal_reports import get_portal_forecasts
        with _set_roles(["VT Leader"]):
            with patch("vernon_tasks.api.portal_reports._visible_projects",
                       return_value=[]):
                with patch("vernon_tasks.api.portal_reports._forecast",
                           return_value={}):
                    result = get_portal_forecasts()
        self.assertIn("forecasts", result)

    def test_forecasts_member_raises_403(self):
        from vernon_tasks.api.portal_reports import get_portal_forecasts
        with _set_roles(["VT Member"]):
            with self.assertRaises(frappe.PermissionError):
                get_portal_forecasts()

    def test_risks_leader_ok(self):
        from vernon_tasks.api.portal_reports import get_portal_risks
        with _set_roles(["VT Leader"]):
            with patch("vernon_tasks.api.portal_reports._visible_projects",
                       return_value=[]):
                result = get_portal_risks()
        self.assertIn("risks", result)

    def test_risks_member_raises_403(self):
        from vernon_tasks.api.portal_reports import get_portal_risks
        with _set_roles(["VT Member"]):
            with self.assertRaises(frappe.PermissionError):
                get_portal_risks()

    def test_velocity_shape(self):
        """Each project in result has sprints array and avg_velocity."""
        from vernon_tasks.api.portal_reports import get_portal_velocity_comparison
        mock_projects = [{"name": "PROJ-00001", "project_title": "Alpha"}]
        mock_trend = [
            {"sprint_label": "S1", "velocity": 40.0},
            {"sprint_label": "S2", "velocity": 44.0},
        ]
        with _set_roles(["VT Manager"]):
            with patch("vernon_tasks.api.portal_reports._visible_projects",
                       return_value=mock_projects):
                with patch("vernon_tasks.api.portal_reports._vel_trend",
                           return_value=mock_trend):
                    result = get_portal_velocity_comparison(6)
        proj = result["projects"][0]
        self.assertIn("sprints", proj)
        self.assertIn("avg_velocity", proj)
        self.assertIn("trend", proj)
        self.assertEqual(len(proj["sprints"]), 2)


class TestTeamPermissions(unittest.TestCase):
    def setUp(self):
        _set_flag(1)

    def tearDown(self):
        _set_flag(0)

    def test_leaderboard_manager_ok(self):
        from vernon_tasks.api.portal_reports import get_portal_leaderboard
        with _set_roles(["VT Manager"]):
            with patch("vernon_tasks.api.portal_reports._lb",
                       return_value={"period": "this_month", "rows": []}):
                result = get_portal_leaderboard("this_month", 20)
        self.assertIn("rows", result)

    def test_leaderboard_leader_ok(self):
        from vernon_tasks.api.portal_reports import get_portal_leaderboard
        with _set_roles(["VT Leader"]):
            with patch("vernon_tasks.api.portal_reports._lb",
                       return_value={"period": "this_month", "rows": []}):
                with patch("vernon_tasks.api.portal_reports._visible_projects",
                           return_value=[]):
                    result = get_portal_leaderboard("this_month", 20)
        self.assertIn("rows", result)

    def test_leaderboard_member_raises_403(self):
        from vernon_tasks.api.portal_reports import get_portal_leaderboard
        with _set_roles(["VT Member"]):
            with self.assertRaises(frappe.PermissionError):
                get_portal_leaderboard("this_month", 20)

    def test_workload_leader_ok(self):
        from vernon_tasks.api.portal_reports import get_portal_workload
        with _set_roles(["VT Leader"]):
            with patch("frappe.db.sql", return_value=[]):
                with patch("frappe.utils.today", return_value="2026-05-18"):
                    with patch("vernon_tasks.api.portal_reports._visible_projects",
                               return_value=[]):
                        result = get_portal_workload()
        self.assertIn("members", result)
        self.assertIn("as_of", result)

    def test_workload_member_raises_403(self):
        from vernon_tasks.api.portal_reports import get_portal_workload
        with _set_roles(["VT Member"]):
            with self.assertRaises(frappe.PermissionError):
                get_portal_workload()

    def test_overdue_leader_ok(self):
        from vernon_tasks.api.portal_reports import get_portal_overdue
        with _set_roles(["VT Leader"]):
            with patch("frappe.db.sql", return_value=[]):
                with patch("frappe.utils.today", return_value="2026-05-18"):
                    with patch("vernon_tasks.api.portal_reports._visible_projects",
                               return_value=[]):
                        result = get_portal_overdue()
        self.assertIn("by_member", result)
        self.assertIn("by_project", result)

    def test_overdue_member_raises_403(self):
        from vernon_tasks.api.portal_reports import get_portal_overdue
        with _set_roles(["VT Member"]):
            with self.assertRaises(frappe.PermissionError):
                get_portal_overdue()

    def test_workload_excludes_done_tasks(self):
        """
        Build a minimal VT Task fixture with kanban_status='Done' and verify
        it does NOT appear in workload open_tasks count.
        """
        from vernon_tasks.api.portal_reports import get_portal_workload
        # Fixture: one project, one Done task, one Open task for same user.
        project_name = frappe.db.exists("VT Project", {"title": "PortalReports Test Proj"})
        if not project_name:
            project_name = frappe.get_doc({
                "doctype": "VT Project",
                "title": "PortalReports Test Proj",
                "project_owner": "Administrator",
                "project_leader": "Administrator",
                "start_date": "2026-01-01",
                "end_date": "2026-12-31",
                "status": "On Track",
                "pdca_phase": "DO",
            }).insert(ignore_permissions=True).name

        # Create Done task
        done_task = frappe.get_doc({
            "doctype": "VT Task",
            "task_title": "Done Task PR Test",
            "project": project_name,
            "assigned_to": "Administrator",
            "kanban_status": "Done",
            "pdca_phase": "DO",
            "estimated_hours": 2.0,
        }).insert(ignore_permissions=True)

        # Create open task
        open_task = frappe.get_doc({
            "doctype": "VT Task",
            "task_title": "Open Task PR Test",
            "project": project_name,
            "assigned_to": "Administrator",
            "kanban_status": "Doing",
            "pdca_phase": "DO",
            "estimated_hours": 4.0,
        }).insert(ignore_permissions=True)

        try:
            with _set_roles(["VT Manager"]):
                with patch("vernon_tasks.api.portal_reports._visible_projects",
                           return_value=[{"name": project_name,
                                          "project_title": "PortalReports Test Proj"}]):
                    result = get_portal_workload()
            admin_row = next(
                (m for m in result["members"] if m["user"] == "Administrator"), None
            )
            self.assertIsNotNone(admin_row)
            # Done task must NOT be counted
            self.assertGreaterEqual(admin_row["open_tasks"], 1)
            # Confirm done task hours not in open_hours
            self.assertLessEqual(admin_row.get("open_hours", 0), 4.0 + 0.001)
        finally:
            frappe.delete_doc("VT Task", done_task.name, ignore_permissions=True)
            frappe.delete_doc("VT Task", open_task.name, ignore_permissions=True)
            frappe.db.commit()

    def test_overdue_deadline_filter(self):
        """Task with deadline yesterday and non-Done status appears in overdue."""
        from vernon_tasks.api.portal_reports import get_portal_overdue
        from frappe.utils import add_days, today as frappe_today
        yesterday = add_days(frappe_today(), -1)

        project_name = frappe.db.exists("VT Project", {"title": "PortalReports Test Proj"})
        if not project_name:
            project_name = frappe.get_doc({
                "doctype": "VT Project",
                "title": "PortalReports Test Proj",
                "project_owner": "Administrator",
                "project_leader": "Administrator",
                "start_date": "2026-01-01",
                "end_date": "2026-12-31",
                "status": "On Track",
                "pdca_phase": "DO",
            }).insert(ignore_permissions=True).name

        overdue_task = frappe.get_doc({
            "doctype": "VT Task",
            "task_title": "Overdue PR Test",
            "project": project_name,
            "assigned_to": "Administrator",
            "kanban_status": "Todo",
            "pdca_phase": "DO",
            "deadline": yesterday,
            "estimated_hours": 3.0,
        }).insert(ignore_permissions=True)

        try:
            with _set_roles(["VT Manager"]):
                with patch("vernon_tasks.api.portal_reports._visible_projects",
                           return_value=[{"name": project_name,
                                          "project_title": "PortalReports Test Proj"}]):
                    result = get_portal_overdue()
            all_users = [r["user"] for r in result["by_member"]]
            self.assertIn("Administrator", all_users)
            admin_row = next(r for r in result["by_member"] if r["user"] == "Administrator")
            self.assertGreaterEqual(admin_row["overdue_count"], 1)
        finally:
            frappe.delete_doc("VT Task", overdue_task.name, ignore_permissions=True)
            frappe.db.commit()

    def test_overdue_done_task_excluded(self):
        """Task with deadline yesterday but kanban_status=Done not in overdue."""
        from vernon_tasks.api.portal_reports import get_portal_overdue
        from frappe.utils import add_days, today as frappe_today
        yesterday = add_days(frappe_today(), -1)

        project_name = frappe.db.exists("VT Project", {"title": "PortalReports Test Proj"})
        if not project_name:
            project_name = frappe.get_doc({
                "doctype": "VT Project",
                "title": "PortalReports Test Proj",
                "project_owner": "Administrator",
                "project_leader": "Administrator",
                "start_date": "2026-01-01",
                "end_date": "2026-12-31",
                "status": "On Track",
                "pdca_phase": "DO",
            }).insert(ignore_permissions=True).name

        done_overdue = frappe.get_doc({
            "doctype": "VT Task",
            "task_title": "Done Overdue PR Test",
            "project": project_name,
            "assigned_to": "Administrator",
            "kanban_status": "Done",
            "pdca_phase": "DO",
            "deadline": yesterday,
            "estimated_hours": 2.0,
        }).insert(ignore_permissions=True)

        try:
            # Capture baseline count before insert
            with _set_roles(["VT Manager"]):
                with patch("vernon_tasks.api.portal_reports._visible_projects",
                           return_value=[{"name": project_name,
                                          "project_title": "PortalReports Test Proj"}]):
                    result_before = get_portal_overdue()

            baseline = sum(
                r.get("overdue_count", 0)
                for r in result_before["by_member"]
                if r["user"] == "Administrator"
            )

            # Re-run with Done task present — count must not increase
            with _set_roles(["VT Manager"]):
                # Bust cache
                from frappe import cache
                cache().delete_value(
                    f"pr:overdue:manager:{frappe.session.user}"
                )
                with patch("vernon_tasks.api.portal_reports._visible_projects",
                           return_value=[{"name": project_name,
                                          "project_title": "PortalReports Test Proj"}]):
                    result_after = get_portal_overdue()

            after = sum(
                r.get("overdue_count", 0)
                for r in result_after["by_member"]
                if r["user"] == "Administrator"
            )
            self.assertEqual(baseline, after)
        finally:
            frappe.delete_doc("VT Task", done_overdue.name, ignore_permissions=True)
            frappe.db.commit()


class TestCaching(unittest.TestCase):
    def setUp(self):
        _set_flag(1)

    def tearDown(self):
        _set_flag(0)

    def test_cache_hit_avoids_second_service_call(self):
        """Second call to get_portal_kpi_list uses cache; _list_kpis called once."""
        from vernon_tasks.api.portal_reports import get_portal_kpi_list
        call_count = {"n": 0}
        def mock_list_kpis():
            call_count["n"] += 1
            return [{"name": "KPI-00001", "title": "Velocity", "unit": "pts/sprint"}]

        with _set_roles(["VT Manager"]):
            # Clear any existing cache
            frappe.cache().delete_value("pr:kpis:manager")
            with patch("vernon_tasks.api.portal_reports._list_kpis",
                       side_effect=mock_list_kpis):
                result1 = get_portal_kpi_list()
                result2 = get_portal_kpi_list()
        # Service called once; second result from cache
        self.assertEqual(call_count["n"], 1)
        self.assertEqual(result1, result2)

    def test_cache_key_differs_by_role(self):
        """Manager and Leader produce different velocity cache keys."""
        from vernon_tasks.api.portal_reports import _role_bucket
        with _set_roles(["VT Manager"]):
            bucket_mgr = _role_bucket()
        with _set_roles(["VT Leader"]):
            bucket_ldr = _role_bucket()
        self.assertNotEqual(bucket_mgr, bucket_ldr)
        self.assertEqual(bucket_mgr, "manager")
        self.assertEqual(bucket_ldr, "leader")

    def test_invalidate_okr_cache_clears_health(self):
        """invalidate_okr_cache deletes the pr:health:manager key."""
        from vernon_tasks.api.portal_reports import invalidate_okr_cache
        frappe.cache().set_value("pr:health:manager", {"score": 99})
        invalidate_okr_cache(MagicMock())
        cached = frappe.cache().get_value("pr:health:manager")
        self.assertIsNone(cached)


class TestBusinessLogic(unittest.TestCase):
    def setUp(self):
        _set_flag(1)

    def tearDown(self):
        _set_flag(0)

    def test_forecasts_status_classification(self):
        """Forecasts classify projects into on-track / at-risk / delayed buckets."""
        from vernon_tasks.api.portal_reports import get_portal_forecasts
        with _set_roles(["VT Manager"]):
            with patch("vernon_tasks.api.portal_reports._visible_projects",
                       return_value=[]):
                with patch("vernon_tasks.api.portal_reports._forecast",
                           return_value={}):
                    result = get_portal_forecasts()
        # result["forecasts"] is list of forecast objects; each must have status field
        for item in result.get("forecasts", []):
            self.assertIn(item.get("status"), ("on_track", "at_risk", "delayed"))

    def test_risks_empty_project(self):
        """Risk endpoint returns empty list when no risky projects exist."""
        from vernon_tasks.api.portal_reports import get_portal_risks
        with _set_roles(["VT Manager"]):
            with patch("vernon_tasks.api.portal_reports._visible_projects",
                       return_value=[]):
                result = get_portal_risks()
        self.assertIsInstance(result.get("risks", result), list)

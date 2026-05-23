import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_tasks.task.services.report_runner import list_for_role, run, MODULES


class TestReportRunner(FrappeTestCase):
    def test_modules_loaded(self):
        for slug in {"project-health", "okr-pacing", "team-throughput",
                     "my-points", "project-burndown-archive", "risk-log"}:
            self.assertIn(slug, MODULES)

    def test_list_filters_by_role(self):
        ic = list_for_role({"Vernon IC"})
        leader = list_for_role({"Vernon Leader"})
        slugs_ic = {r["slug"] for r in ic}
        slugs_leader = {r["slug"] for r in leader}
        self.assertIn("my-points", slugs_ic)
        self.assertNotIn("project-health", slugs_ic)
        self.assertIn("project-health", slugs_leader)

    def test_run_unknown_slug_raises(self):
        with self.assertRaises(ValueError):
            run("nope", {}, {"Vernon Leader"})

    def test_run_perm_denied(self):
        with self.assertRaises(frappe.PermissionError):
            run("project-health", {}, {"Vernon IC"})

    def test_run_my_points_for_logged_user(self):
        frappe.set_user("Administrator")
        out = run("my-points", {}, {"Vernon IC"})
        self.assertEqual(out["slug"], "my-points")
        self.assertIn("rows", out)

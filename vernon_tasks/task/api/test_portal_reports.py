import frappe
from frappe.tests.utils import FrappeTestCase


class TestPortalReportsApi(FrappeTestCase):
    def test_list_requires_login(self):
        frappe.set_user("Guest")
        try:
            with self.assertRaises(frappe.PermissionError):
                frappe.get_attr("vernon_tasks.task.api.portal_reports.list_reports")()
        finally:
            frappe.set_user("Administrator")

    def test_list_returns_list_of_dicts(self):
        frappe.set_user("Administrator")
        out = frappe.get_attr("vernon_tasks.task.api.portal_reports.list_reports")()
        self.assertIsInstance(out, list)
        self.assertTrue(all("slug" in r and "title" in r for r in out))

    def test_run_my_points_smoke(self):
        frappe.set_user("Administrator")
        out = frappe.get_attr("vernon_tasks.task.api.portal_reports.run_report")(
            slug="my-points",
        )
        self.assertEqual(out["slug"], "my-points")
        self.assertIn("columns", out)
        self.assertIn("rows", out)
        self.assertIn("narrative", out)

    def test_run_invalid_filters_json(self):
        frappe.set_user("Administrator")
        with self.assertRaises(frappe.ValidationError):
            frappe.get_attr("vernon_tasks.task.api.portal_reports.run_report")(
                slug="my-points", filters="not-json",
            )

    def test_export_rejects_bad_format(self):
        frappe.set_user("Administrator")
        with self.assertRaises(frappe.ValidationError):
            frappe.get_attr("vernon_tasks.task.api.portal_reports.export")(
                slug="my-points", format="xls",
            )

    def test_export_csv_sets_response(self):
        frappe.set_user("Administrator")
        frappe.get_attr("vernon_tasks.task.api.portal_reports.export")(
            slug="my-points", format="csv",
        )
        self.assertEqual(frappe.local.response.get("type"), "binary")
        self.assertTrue(
            frappe.local.response.get("filename", "").startswith("my-points-")
        )
        self.assertIn(b"Date", frappe.local.response.get("filecontent", b""))

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, get_first_day, getdate, today
from vernon_tasks.task.services.leaderboard_service import get_leaderboard, period_window

_FIXTURE_BRAND = "TEST-LEADERBOARD-BRAND"


def _ensure_brand():
    if not frappe.db.exists("VT Brand", _FIXTURE_BRAND):
        frappe.get_doc({
            "doctype": "VT Brand",
            "brand_name": _FIXTURE_BRAND,
        }).insert(ignore_permissions=True)
    return _FIXTURE_BRAND


class TestLeaderboard(FrappeTestCase):
    def setUp(self):
        for email in ("lb-a@x.com", "lb-b@x.com"):
            if not frappe.db.exists("User", email):
                frappe.get_doc({
                    "doctype": "User", "email": email, "first_name": "T",
                    "send_welcome_email": 0, "enabled": 1,
                }).insert(ignore_permissions=True)
        if frappe.db.exists("VT Project", "LB-Proj"):
            frappe.delete_doc("VT Project", "LB-Proj", force=True)
        p = frappe.get_doc({
            "doctype": "VT Project", "title": "LB-Proj",
            "brand": _ensure_brand(),
            "project_owner": "Administrator",
            "start_date": add_days(today(), -30),
            "end_date": add_days(today(), 30),
            "status": "Open",
        }).insert(ignore_permissions=True)
        self.project = p.name
        self._created_tasks = []

        # Use dates anchored to the first day of the current month so the
        # fixtures are always inside the "month" window regardless of which
        # day of the month the tests run.  (add_days(today(), -N) can land in
        # the previous month when today is within the first few days.)
        month_start = get_first_day(getdate(today()))

        def _t(user, pts, day_offset):
            # completion_date and earned_points are read_only in the doctype,
            # so Frappe strips them on insert().  Use db_set() after insert to
            # write the values directly, mirroring what the controller does in
            # on_submit().
            doc = frappe.get_doc({
                "doctype": "VT Task", "title": "T",
                "project": self.project, "assigned_to": user,
                "estimated_minutes": 1,
                "pdca_phase": "DONE", "kanban_status": "Done",
            }).insert(ignore_permissions=True)
            doc.db_set("earned_points", pts)
            doc.db_set("completion_date", add_days(month_start, day_offset))
            self._created_tasks.append(doc.name)
            return doc

        _t("lb-a@x.com", 30, 0)
        _t("lb-b@x.com", 10, 1)
        _t("lb-b@x.com", 10, 2)

    def tearDown(self):
        for task_name in getattr(self, "_created_tasks", []):
            if frappe.db.exists("VT Task", task_name):
                frappe.delete_doc("VT Task", task_name, force=True)
        if frappe.db.exists("VT Project", "LB-Proj"):
            frappe.delete_doc("VT Project", "LB-Proj", force=True)

    def test_month_leaderboard_orders_by_points(self):
        result = get_leaderboard("month")
        usrs = [r["user"] for r in result if r["user"] in ("lb-a@x.com", "lb-b@x.com")]
        self.assertEqual(usrs[:2], ["lb-a@x.com", "lb-b@x.com"])

    def test_includes_task_count(self):
        result = get_leaderboard("month")
        b_row = [r for r in result if r["user"] == "lb-b@x.com"][0]
        self.assertEqual(b_row["task_count"], 2)
        self.assertEqual(b_row["points"], 20.0)

    def test_invalid_period_raises(self):
        with self.assertRaises(ValueError):
            get_leaderboard("yearly")

    def test_period_window_returns_tuple(self):
        start, end = period_window("week")
        self.assertLessEqual(start, end)

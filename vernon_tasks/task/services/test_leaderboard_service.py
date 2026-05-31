import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, today
from vernon_tasks.task.services.leaderboard_service import get_leaderboard, period_window


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
            "project_owner": frappe.session.user,
            "start_date": add_days(today(), -30),
            "end_date": add_days(today(), 30),
            "status": "Open",
        }).insert(ignore_permissions=True)
        self.project = p.name

        def _t(user, pts, days_ago):
            return frappe.get_doc({
                "doctype": "VT Task", "title": "T",
                "project": self.project, "assigned_to": user,
                "estimated_minutes": 1, "actual_minutes": 1,
                "earned_points": pts,
                "pdca_phase": "DONE", "kanban_status": "Done",
                "completion_date": add_days(today(), -days_ago),
            }).insert(ignore_permissions=True)

        _t("lb-a@x.com", 30, 2)
        _t("lb-b@x.com", 10, 1)
        _t("lb-b@x.com", 10, 3)

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

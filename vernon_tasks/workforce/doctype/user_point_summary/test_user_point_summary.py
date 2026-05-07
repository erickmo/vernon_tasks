import frappe
from frappe.tests.utils import FrappeTestCase

TEST_USER = "test_ups_user@example.com"
TEST_PERIOD = "2026-05"


def create_test_user():
    if not frappe.db.exists("User", TEST_USER):
        frappe.get_doc({
            "doctype": "User",
            "email": TEST_USER,
            "first_name": "Test",
            "last_name": "UPS",
            "enabled": 1,
            "roles": [{"role": "VT Member"}]
        }).insert(ignore_permissions=True)


class TestUserPointSummary(FrappeTestCase):
    def setUp(self):
        create_test_user()
        frappe.db.delete("User Point Summary", {"user": TEST_USER, "period": TEST_PERIOD})

    def test_create_summary(self):
        doc = frappe.get_doc({
            "doctype": "User Point Summary",
            "user": TEST_USER,
            "period": TEST_PERIOD,
            "total_earned": 200.0,
            "total_penalty": 20.0,
            "total_bonus": 15.0,
            "total_override_delta": -10.0,
            "net_points": 185.0,
        })
        doc.insert(ignore_permissions=True)
        self.assertEqual(doc.net_points, 185.0)

    def test_get_or_create_period(self):
        from vernon_tasks.workforce.doctype.user_point_summary.user_point_summary import get_or_create_period
        doc = get_or_create_period(TEST_USER, TEST_PERIOD)
        self.assertEqual(doc.user, TEST_USER)
        self.assertEqual(doc.period, TEST_PERIOD)
        # Calling again returns same doc (idempotent)
        doc2 = get_or_create_period(TEST_USER, TEST_PERIOD)
        self.assertEqual(doc.name, doc2.name)

    def test_add_points_to_period(self):
        from vernon_tasks.workforce.doctype.user_point_summary.user_point_summary import add_points_to_period
        add_points_to_period(
            user=TEST_USER,
            period=TEST_PERIOD,
            earned=100.0,
            bonus=10.0,
            penalty=5.0,
            override_delta=0.0,
        )
        name = frappe.db.get_value(
            "User Point Summary", {"user": TEST_USER, "period": TEST_PERIOD}, "name"
        )
        doc = frappe.get_doc("User Point Summary", name)
        self.assertEqual(doc.total_earned, 100.0)
        self.assertEqual(doc.total_bonus, 10.0)
        self.assertEqual(doc.total_penalty, 5.0)
        self.assertEqual(doc.net_points, 105.0)  # 100 + 10 - 5 + 0

    def tearDown(self):
        frappe.db.delete("User Point Summary", {"user": TEST_USER, "period": TEST_PERIOD})

import frappe
from frappe.tests.utils import FrappeTestCase

TEST_USER = "test_wp_user@example.com"


def create_test_user():
    if not frappe.db.exists("User", TEST_USER):
        user = frappe.get_doc({
            "doctype": "User",
            "email": TEST_USER,
            "first_name": "Test",
            "last_name": "WP",
            "enabled": 1,
            "roles": [{"role": "VT Member"}]
        })
        user.insert(ignore_permissions=True)
    return TEST_USER


class TestWorkProfile(FrappeTestCase):
    def setUp(self):
        create_test_user()
        frappe.db.delete("Work Profile", {"user": TEST_USER})

    def test_create_work_profile_with_defaults(self):
        doc = frappe.get_doc({
            "doctype": "Work Profile",
            "user": TEST_USER,
            "daily_target_hours": 8.0,
        })
        doc.insert(ignore_permissions=True)
        self.assertEqual(doc.user, TEST_USER)
        self.assertEqual(doc.daily_target_hours, 8.0)

    def test_invalid_daily_target_hours_raises(self):
        doc = frappe.get_doc({
            "doctype": "Work Profile",
            "user": TEST_USER,
            "daily_target_hours": -1.0,
        })
        with self.assertRaises(frappe.ValidationError):
            doc.insert(ignore_permissions=True)

    def test_zero_daily_target_raises(self):
        doc = frappe.get_doc({
            "doctype": "Work Profile",
            "user": TEST_USER,
            "daily_target_hours": 0,
        })
        with self.assertRaises(frappe.ValidationError):
            doc.insert(ignore_permissions=True)

    def test_working_days_time_validation(self):
        doc = frappe.get_doc({
            "doctype": "Work Profile",
            "user": TEST_USER,
            "daily_target_hours": 8.0,
            "working_days": [
                {
                    "day_of_week": "Monday",
                    "is_working": 1,
                    "start_time": "17:00:00",
                    "end_time": "09:00:00",
                }
            ]
        })
        with self.assertRaises(frappe.ValidationError):
            doc.insert(ignore_permissions=True)

    def test_get_working_day_names(self):
        doc = frappe.get_doc({
            "doctype": "Work Profile",
            "user": TEST_USER,
            "daily_target_hours": 8.0,
            "working_days": [
                {"day_of_week": "Monday", "is_working": 1},
                {"day_of_week": "Tuesday", "is_working": 1},
                {"day_of_week": "Saturday", "is_working": 0},
                {"day_of_week": "Sunday", "is_working": 0},
            ]
        })
        doc.insert(ignore_permissions=True)
        working = doc.get_working_day_names()
        self.assertIn("Monday", working)
        self.assertIn("Tuesday", working)
        self.assertNotIn("Saturday", working)
        self.assertNotIn("Sunday", working)

    def tearDown(self):
        frappe.db.delete("Work Profile", {"user": TEST_USER})

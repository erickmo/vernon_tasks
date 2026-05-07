import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import today

TEST_USER = "test_ds_user@example.com"


def create_test_user():
    if not frappe.db.exists("User", TEST_USER):
        frappe.get_doc({
            "doctype": "User",
            "email": TEST_USER,
            "first_name": "Test",
            "last_name": "DS",
            "enabled": 1,
            "roles": [{"role": "VT Member"}]
        }).insert(ignore_permissions=True)


class TestDailySummary(FrappeTestCase):
    def setUp(self):
        create_test_user()
        frappe.db.delete("Daily Summary", {"user": TEST_USER})

    def test_create_daily_summary(self):
        doc = frappe.get_doc({
            "doctype": "Daily Summary",
            "user": TEST_USER,
            "date": today(),
            "target_hours": 8.0,
            "scheduled_hours": 6.5,
            "completed_hours": 4.0,
            "total_points_today": 50.0,
        })
        doc.insert(ignore_permissions=True)
        self.assertEqual(doc.user, TEST_USER)
        self.assertEqual(doc.scheduled_hours, 6.5)

    def test_get_or_create_today(self):
        from vernon_tasks.workforce.doctype.daily_summary.daily_summary import get_or_create_today
        doc = get_or_create_today(TEST_USER, target_hours=8.0)
        self.assertEqual(doc.user, TEST_USER)
        # Calling again returns same doc (idempotent)
        doc2 = get_or_create_today(TEST_USER, target_hours=8.0)
        self.assertEqual(doc.name, doc2.name)

    def test_update_scheduled_hours(self):
        from vernon_tasks.workforce.doctype.daily_summary.daily_summary import (
            get_or_create_today,
            update_scheduled_hours,
        )
        from frappe.utils import getdate
        get_or_create_today(TEST_USER, target_hours=8.0)
        update_scheduled_hours(TEST_USER, getdate(today()), 3.5)
        name = frappe.db.get_value("Daily Summary", {"user": TEST_USER, "date": today()}, "name")
        doc = frappe.get_doc("Daily Summary", name)
        self.assertEqual(doc.scheduled_hours, 3.5)

    def tearDown(self):
        frappe.db.delete("Daily Summary", {"user": TEST_USER})

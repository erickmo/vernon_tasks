import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_tasks.task.api.notifications import (
    list as notif_list,
    mark_read,
    mark_all_read,
    count_unread,
)


class TestNotifications(FrappeTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.user_a = "p1b_notif_a@test.local"
        cls.user_b = "p1b_notif_b@test.local"
        for u in (cls.user_a, cls.user_b):
            if not frappe.db.exists("User", u):
                frappe.get_doc({"doctype": "User", "email": u, "first_name": u}).insert(
                    ignore_permissions=True
                )

    def setUp(self):
        frappe.db.delete("Notification Log", {"for_user": ["in", [self.user_a, self.user_b]]})
        frappe.cache().delete_value(f"vt:notif:unread:{self.user_a}")
        frappe.cache().delete_value(f"vt:notif:unread:{self.user_b}")

    def _make_notif(self, user, subject="Test", read=0):
        return frappe.get_doc({
            "doctype": "Notification Log",
            "for_user": user,
            "subject": subject,
            "type": "Assignment",
            "read": read,
        }).insert(ignore_permissions=True)

    def test_list_returns_own_notifications_only(self):
        self._make_notif(self.user_a, "for A")
        self._make_notif(self.user_b, "for B")
        frappe.set_user(self.user_a)
        r = notif_list()
        subjects = [x["subject"] for x in r["results"]]
        self.assertIn("for A", subjects)
        self.assertNotIn("for B", subjects)

    def test_mark_read_sets_flag(self):
        n = self._make_notif(self.user_a)
        frappe.set_user(self.user_a)
        mark_read(n.name)
        self.assertEqual(frappe.db.get_value("Notification Log", n.name, "read"), 1)

    def test_mark_read_forbidden_other_user(self):
        n = self._make_notif(self.user_a)
        frappe.set_user(self.user_b)
        with self.assertRaises(frappe.PermissionError):
            mark_read(n.name)

    def test_count_unread_excludes_read(self):
        self._make_notif(self.user_a, read=0)
        self._make_notif(self.user_a, read=0)
        self._make_notif(self.user_a, read=1)
        frappe.set_user(self.user_a)
        self.assertEqual(count_unread()["count"], 2)

    def test_mark_all_read_clears_unread(self):
        self._make_notif(self.user_a, read=0)
        self._make_notif(self.user_a, read=0)
        frappe.set_user(self.user_a)
        mark_all_read()
        self.assertEqual(count_unread()["count"], 0)

import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_tasks.task.api.push import (
    get_public_key,
    subscribe,
    unsubscribe,
    is_subscribed,
)


class TestPushAPI(FrappeTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.user_a = "push_a@test.local"
        cls.user_b = "push_b@test.local"
        for u in (cls.user_a, cls.user_b):
            if not frappe.db.exists("User", u):
                frappe.get_doc(
                    {"doctype": "User", "email": u, "first_name": u}
                ).insert(ignore_permissions=True)

    def setUp(self):
        frappe.db.delete(
            "Vernon Push Subscription",
            {"user": ["in", [self.user_a, self.user_b]]},
        )

    def test_get_public_key_returns_string(self):
        r = get_public_key()
        self.assertIn("public_key", r)
        self.assertIsInstance(r["public_key"], str)

    def test_subscribe_creates_then_renews(self):
        frappe.set_user(self.user_a)
        r1 = subscribe(endpoint="https://push.example/abc", p256dh="P", auth="A")
        self.assertFalse(r1["renewed"])
        r2 = subscribe(endpoint="https://push.example/abc", p256dh="P2", auth="A2")
        self.assertTrue(r2["renewed"])
        count = frappe.db.count(
            "Vernon Push Subscription",
            {"endpoint": "https://push.example/abc"},
        )
        self.assertEqual(count, 1)

    def test_unsubscribe_removes_own(self):
        frappe.set_user(self.user_a)
        subscribe(endpoint="https://push.example/x", p256dh="P", auth="A")
        unsubscribe(endpoint="https://push.example/x")
        self.assertFalse(
            frappe.db.exists(
                "Vernon Push Subscription",
                {"endpoint": "https://push.example/x"},
            )
        )

    def test_unsubscribe_other_user_noop(self):
        frappe.set_user(self.user_a)
        subscribe(endpoint="https://push.example/y", p256dh="P", auth="A")
        frappe.set_user(self.user_b)
        unsubscribe(endpoint="https://push.example/y")
        # Still exists because owner is user_a
        self.assertTrue(
            frappe.db.exists(
                "Vernon Push Subscription",
                {"endpoint": "https://push.example/y", "user": self.user_a},
            )
        )

    def test_is_subscribed(self):
        frappe.set_user(self.user_a)
        self.assertFalse(is_subscribed(endpoint="https://push.example/z")["subscribed"])
        subscribe(endpoint="https://push.example/z", p256dh="P", auth="A")
        self.assertTrue(is_subscribed(endpoint="https://push.example/z")["subscribed"])

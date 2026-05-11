from unittest.mock import patch, MagicMock

import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_tasks.task.services.push_sender import (
    send_to_user,
    send_push_for_notification,
)


class TestPushSender(FrappeTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.user = "push_send@test.local"
        if not frappe.db.exists("User", cls.user):
            frappe.get_doc(
                {"doctype": "User", "email": cls.user, "first_name": cls.user}
            ).insert(ignore_permissions=True)

    def setUp(self):
        frappe.db.delete("Vernon Push Subscription", {"user": self.user})
        # Ensure a private key exists so send_to_user does not early-exit
        frappe.db.set_single_value(
            "VT Settings", "push_vapid_private_key", "TEST_PRIV"
        )

    def _make_sub(self, endpoint="https://push.example/aaa"):
        return frappe.get_doc(
            {
                "doctype": "Vernon Push Subscription",
                "user": self.user,
                "endpoint": endpoint,
                "p256dh": "P",
                "auth": "A",
            }
        ).insert(ignore_permissions=True)

    def test_send_to_user_iterates(self):
        self._make_sub(endpoint="https://push.example/1")
        self._make_sub(endpoint="https://push.example/2")
        with patch(
            "vernon_tasks.task.services.push_sender.__import__",
            create=True,
        ):
            pass  # fallthrough, real import happens
        with patch("pywebpush.webpush") as wp:
            wp.return_value = MagicMock()
            sent = send_to_user(self.user, {"title": "T", "body": "B"})
            self.assertEqual(sent, 2)
            self.assertEqual(wp.call_count, 2)

    def test_send_prunes_dead_endpoints(self):
        self._make_sub(endpoint="https://push.example/dead")
        from pywebpush import WebPushException

        class FakeResp:
            status_code = 410

        with patch("pywebpush.webpush") as wp:
            err = WebPushException("dead")
            err.response = FakeResp()
            wp.side_effect = err
            send_to_user(self.user, {"title": "T", "body": "B"})
            self.assertFalse(
                frappe.db.exists(
                    "Vernon Push Subscription",
                    {"endpoint": "https://push.example/dead"},
                )
            )

    def test_notification_hook_skips_admin(self):
        doc = frappe._dict(
            for_user="Administrator",
            subject="x",
            name="N1",
            document_type=None,
            document_name=None,
            get=lambda k, default=None: None,
        )
        with patch(
            "vernon_tasks.task.services.push_sender.send_to_user"
        ) as send_mock:
            send_push_for_notification(doc)
            send_mock.assert_not_called()

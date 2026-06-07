from unittest.mock import patch, MagicMock

import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_tasks.task.services.push_sender import (
    send_to_user,
    send_push_for_notification,
)

_TASK_TITLE = "Push-Send-Task"
_PROJ_TITLE = "Push-Send-Proj"


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
        self._cleanup_task()
        # Ensure a private key exists so send_to_user does not early-exit
        frappe.db.set_single_value(
            "VT Settings", "push_vapid_private_key", "TEST_PRIV"
        )

    def tearDown(self):
        self._cleanup_task()

    def _cleanup_task(self):
        # Delete subtree deepest-first: NestedSet blocks deleting a parent
        # before its children.
        for row in frappe.get_all(
            "VT Item",
            filters={"title": ["in", (_TASK_TITLE, _PROJ_TITLE)]},
            fields=["name"],
            order_by="lft desc",
        ):
            frappe.delete_doc("VT Item", row["name"], force=True)

    def _make_task(self):
        # A task is now a VT Item node (node_type="Task") parented under a
        # Project node — Task may not sit at the tree root.
        project = frappe.get_doc(
            {
                "doctype": "VT Item",
                "node_type": "Project",
                "title": _PROJ_TITLE,
            }
        ).insert(ignore_permissions=True)
        return frappe.get_doc(
            {
                "doctype": "VT Item",
                "node_type": "Task",
                "title": _TASK_TITLE,
                "parent_vt_item": project.name,
            }
        ).insert(ignore_permissions=True)

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

    def test_notification_hook_builds_task_payload_for_vt_item_node(self):
        # A notification pointing at a VT Item Task node must produce a
        # task-aware payload: deep link to the item, task actions, task_id set.
        task = self._make_task()
        fields = {
            "for_user": self.user,
            "subject": "Task ready",
            "name": "N-task",
            "type": "Assignment",
            "document_type": "VT Item",
            "document_name": task.name,
        }
        doc = frappe._dict(**fields)
        doc.get = lambda k, default=None: fields.get(k, default)
        with patch(
            "vernon_tasks.task.services.push_sender.send_to_user"
        ) as send_mock:
            send_push_for_notification(doc)
            send_mock.assert_called_once()
            _user, payload = send_mock.call_args[0]
            self.assertEqual(_user, self.user)
            self.assertEqual(payload["url"], f"/app/vt-item/{task.name}")
            self.assertEqual(payload["task_id"], task.name)
            self.assertTrue(payload["actions"])

    def test_notification_hook_non_task_item_is_plain(self):
        # A VT Item node that is NOT a Task (e.g. an OKR) must NOT get the
        # task treatment: no deep link, no task_id, no task actions.
        okr = frappe.get_doc(
            {"doctype": "VT Item", "node_type": "OKR", "title": "Push-Send-OKR"}
        ).insert(ignore_permissions=True)
        try:
            fields = {
                "for_user": self.user,
                "subject": "OKR note",
                "name": "N-okr",
                "type": "Assignment",
                "document_type": "VT Item",
                "document_name": okr.name,
            }
            doc = frappe._dict(**fields)
            doc.get = lambda k, default=None: fields.get(k, default)
            with patch(
                "vernon_tasks.task.services.push_sender.send_to_user"
            ) as send_mock:
                send_push_for_notification(doc)
                send_mock.assert_called_once()
                _user, payload = send_mock.call_args[0]
                self.assertEqual(payload["url"], "/app/notification-log")
                self.assertIsNone(payload["task_id"])
                self.assertEqual(payload["actions"], [])
        finally:
            frappe.delete_doc("VT Item", okr.name, force=True)

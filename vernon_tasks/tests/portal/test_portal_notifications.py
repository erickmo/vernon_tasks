import frappe
import unittest
from unittest.mock import patch


# ---------------------------------------------------------------------------
# Fixtures helper
# ---------------------------------------------------------------------------

def _make_user(email: str, full_name: str = "Test User") -> str:
    """Ensure a minimal User record exists; return email."""
    if not frappe.db.exists("User", email):
        user = frappe.get_doc({
            "doctype": "User",
            "email": email,
            "first_name": full_name,
            "send_welcome_email": 0,
            "enabled": 1,
        })
        user.insert(ignore_permissions=True)
    return email


def _make_task(title: str, assigned_to: str, kanban_status: str = "Backlog") -> str:
    """Create a VT Task and return its name."""
    doc = frappe.get_doc({
        "doctype": "VT Task",
        "title": title,
        "assigned_to": assigned_to,
        "kanban_status": kanban_status,
    })
    doc.insert(ignore_permissions=True)
    return doc.name


def _make_sprint(sprint_title: str, project: str = "TEST-PROJ") -> str:
    """Create a VT Sprint and return its name."""
    if not frappe.db.exists("VT Project", project):
        proj = frappe.get_doc({
            "doctype": "VT Project",
            "project_name": project,
        })
        proj.insert(ignore_permissions=True)
    doc = frappe.get_doc({
        "doctype": "VT Sprint",
        "sprint_title": sprint_title,
        "project": project,
        "status": "Planning",
        "start_date": "2026-05-01",
        "end_date": "2026-05-14",
    })
    doc.insert(ignore_permissions=True)
    return doc.name


def _notif_count(user: str, event_type: str = None, reference_name: str = None) -> int:
    filters = {"user": user}
    if event_type:
        filters["event_type"] = event_type
    if reference_name:
        filters["reference_name"] = reference_name
    return frappe.db.count("Vernon Notification", filters=filters)


def _enable_flag(enabled: int = 1):
    frappe.db.set_single_value("VT Settings", "portal_notifications_enabled", enabled)
    frappe.cache().delete_value("vt:portal:notif:flag")


# ---------------------------------------------------------------------------
# queue_notification unit tests
# ---------------------------------------------------------------------------

class TestQueueNotification(unittest.TestCase):

    def setUp(self):
        _enable_flag(1)
        self.user_a = _make_user("notif_a@test.local", "Notif A")
        self.user_b = _make_user("notif_b@test.local", "Notif B")
        # Clean slate
        frappe.db.delete("Vernon Notification", {"user": ["in", [self.user_a, self.user_b]]})

    def tearDown(self):
        frappe.db.delete("Vernon Notification", {"user": ["in", [self.user_a, self.user_b]]})

    def test_happy_path_creates_row(self):
        from vernon_tasks.api.portal_notifications import queue_notification
        with patch.object(frappe, "session") as mock_sess:
            mock_sess.user = "someone_else@test.local"
            queue_notification(
                user=self.user_a,
                event_type="task_assigned",
                reference_doctype="VT Task",
                reference_name="VT-9999",
                message="Task assigned to you: Test Task",
            )
        self.assertEqual(_notif_count(self.user_a, "task_assigned", "VT-9999"), 1)

    def test_self_notification_skipped(self):
        from vernon_tasks.api.portal_notifications import queue_notification
        with patch.object(frappe, "session") as mock_sess:
            mock_sess.user = self.user_a
            queue_notification(
                user=self.user_a,
                event_type="task_assigned",
                reference_doctype="VT Task",
                reference_name="VT-9998",
                message="Task assigned to you: Test Task",
            )
        self.assertEqual(_notif_count(self.user_a, "task_assigned", "VT-9998"), 0)

    def test_guest_skipped(self):
        from vernon_tasks.api.portal_notifications import queue_notification
        with patch.object(frappe, "session") as mock_sess:
            mock_sess.user = "someone_else@test.local"
            queue_notification(
                user="Guest",
                event_type="task_assigned",
                reference_doctype="VT Task",
                reference_name="VT-9997",
                message="Task assigned to you: Test",
            )
        self.assertEqual(frappe.db.count("Vernon Notification", {"user": "Guest"}), 0)

    def test_deduplication_no_second_row(self):
        from vernon_tasks.api.portal_notifications import queue_notification
        with patch.object(frappe, "session") as mock_sess:
            mock_sess.user = "other@test.local"
            queue_notification(
                user=self.user_b,
                event_type="comment",
                reference_doctype="VT Task",
                reference_name="VT-8888",
                message="Someone commented",
            )
            queue_notification(
                user=self.user_b,
                event_type="comment",
                reference_doctype="VT Task",
                reference_name="VT-8888",
                message="Someone commented again",
            )
        self.assertEqual(_notif_count(self.user_b, "comment", "VT-8888"), 1)

    def test_cache_invalidated_after_insert(self):
        from vernon_tasks.api.portal_notifications import queue_notification, _UNREAD_CACHE_KEY
        # Seed a stale cache value
        frappe.cache().set_value(_UNREAD_CACHE_KEY.format(user=self.user_a), 0, expires_in_sec=30)
        with patch.object(frappe, "session") as mock_sess:
            mock_sess.user = "other@test.local"
            queue_notification(
                user=self.user_a,
                event_type="sprint_status",
                reference_doctype="VT Sprint",
                reference_name="SP-0001",
                message="Sprint started: Alpha",
            )
        cached = frappe.cache().get_value(_UNREAD_CACHE_KEY.format(user=self.user_a))
        self.assertIsNone(cached)


# ---------------------------------------------------------------------------
# on_vt_task_update tests
# ---------------------------------------------------------------------------

class TestOnVtTaskUpdate(unittest.TestCase):

    def setUp(self):
        _enable_flag(1)
        self.user_a = _make_user("task_upd_a@test.local", "Task A")
        self.user_b = _make_user("task_upd_b@test.local", "Task B")
        frappe.db.delete("Vernon Notification", {
            "user": ["in", [self.user_a, self.user_b]]
        })

    def tearDown(self):
        frappe.db.delete("Vernon Notification", {
            "user": ["in", [self.user_a, self.user_b]]
        })

    def test_assigned_to_change_creates_notification(self):
        from vernon_tasks.api.portal_notifications import on_vt_task_update

        doc = frappe.get_doc({
            "doctype": "VT Task",
            "title": "Assign Me",
            "assigned_to": self.user_b,
            "kanban_status": "Backlog",
        })
        doc._doc_before_save = frappe._dict(assigned_to="", kanban_status="Backlog")

        with patch.object(frappe, "session") as mock_sess:
            mock_sess.user = self.user_a
            on_vt_task_update(doc, None)

        self.assertEqual(_notif_count(self.user_b, "task_assigned"), 1)

    def test_assigned_to_unchanged_no_notification(self):
        from vernon_tasks.api.portal_notifications import on_vt_task_update

        doc = frappe.get_doc({
            "doctype": "VT Task",
            "title": "No Change",
            "assigned_to": self.user_b,
            "kanban_status": "Backlog",
        })
        doc._doc_before_save = frappe._dict(assigned_to=self.user_b, kanban_status="Backlog")

        with patch.object(frappe, "session") as mock_sess:
            mock_sess.user = self.user_a
            on_vt_task_update(doc, None)

        self.assertEqual(_notif_count(self.user_b, "task_assigned"), 0)

    def test_kanban_done_creates_task_review_approved(self):
        from vernon_tasks.api.portal_notifications import on_vt_task_update

        doc = frappe.get_doc({
            "doctype": "VT Task",
            "title": "Approve Me",
            "assigned_to": self.user_b,
            "kanban_status": "Done",
        })
        doc._doc_before_save = frappe._dict(assigned_to=self.user_b, kanban_status="In Review")

        with patch.object(frappe, "session") as mock_sess:
            mock_sess.user = self.user_a
            on_vt_task_update(doc, None)

        self.assertEqual(_notif_count(self.user_b, "task_review"), 1)
        notif = frappe.db.get_value(
            "Vernon Notification",
            {"user": self.user_b, "event_type": "task_review"},
            "message",
        )
        self.assertIn("approved", notif)

    def test_kanban_revision_creates_task_review_rejected(self):
        from vernon_tasks.api.portal_notifications import on_vt_task_update

        doc = frappe.get_doc({
            "doctype": "VT Task",
            "title": "Reject Me",
            "assigned_to": self.user_b,
            "kanban_status": "Revision",
        })
        doc._doc_before_save = frappe._dict(assigned_to=self.user_b, kanban_status="In Review")

        with patch.object(frappe, "session") as mock_sess:
            mock_sess.user = self.user_a
            on_vt_task_update(doc, None)

        notif = frappe.db.get_value(
            "Vernon Notification",
            {"user": self.user_b, "event_type": "task_review"},
            "message",
        )
        self.assertIn("rejected", notif)

    def test_kanban_status_unchanged_no_review_notification(self):
        from vernon_tasks.api.portal_notifications import on_vt_task_update

        doc = frappe.get_doc({
            "doctype": "VT Task",
            "title": "No Review",
            "assigned_to": self.user_b,
            "kanban_status": "In Progress",
        })
        doc._doc_before_save = frappe._dict(assigned_to=self.user_b, kanban_status="In Progress")

        with patch.object(frappe, "session") as mock_sess:
            mock_sess.user = self.user_a
            on_vt_task_update(doc, None)

        self.assertEqual(_notif_count(self.user_b, "task_review"), 0)


# ---------------------------------------------------------------------------
# on_vt_sprint_update tests
# ---------------------------------------------------------------------------

class TestOnVtSprintUpdate(unittest.TestCase):

    def setUp(self):
        _enable_flag(1)
        self.user_a = _make_user("sprint_upd_a@test.local", "Sprint A")
        self.user_b = _make_user("sprint_upd_b@test.local", "Sprint B")
        frappe.db.delete("Vernon Notification", {
            "user": ["in", [self.user_a, self.user_b]]
        })

    def tearDown(self):
        frappe.db.delete("Vernon Notification", {
            "user": ["in", [self.user_a, self.user_b]]
        })

    def test_status_to_active_notifies_task_owners(self):
        from vernon_tasks.api.portal_notifications import on_vt_sprint_update

        sprint_name = _make_sprint("Sprint Active Test")
        # Create tasks in sprint for user_a and user_b
        task_a = _make_task("Task A", self.user_a)
        task_b = _make_task("Task B", self.user_b)
        frappe.db.set_value("VT Task", task_a, "sprint", sprint_name)
        frappe.db.set_value("VT Task", task_b, "sprint", sprint_name)

        doc = frappe.get_doc("VT Sprint", sprint_name)
        doc._doc_before_save = frappe._dict(status="Planning")
        doc.status = "Active"

        with patch.object(frappe, "session") as mock_sess:
            mock_sess.user = "manager@test.local"
            on_vt_sprint_update(doc, None)

        self.assertEqual(_notif_count(self.user_a, "sprint_status", sprint_name), 1)
        self.assertEqual(_notif_count(self.user_b, "sprint_status", sprint_name), 1)
        msg = frappe.db.get_value(
            "Vernon Notification",
            {"user": self.user_a, "event_type": "sprint_status", "reference_name": sprint_name},
            "message",
        )
        self.assertIn("started", msg)

    def test_status_to_completed_notifies_task_owners(self):
        from vernon_tasks.api.portal_notifications import on_vt_sprint_update

        sprint_name = _make_sprint("Sprint Completed Test")
        task_a = _make_task("Task C", self.user_a)
        frappe.db.set_value("VT Task", task_a, "sprint", sprint_name)

        doc = frappe.get_doc("VT Sprint", sprint_name)
        doc._doc_before_save = frappe._dict(status="Active")
        doc.status = "Completed"

        with patch.object(frappe, "session") as mock_sess:
            mock_sess.user = "manager@test.local"
            on_vt_sprint_update(doc, None)

        msg = frappe.db.get_value(
            "Vernon Notification",
            {"user": self.user_a, "event_type": "sprint_status", "reference_name": sprint_name},
            "message",
        )
        self.assertIn("completed", msg)

    def test_status_to_planning_no_notification(self):
        from vernon_tasks.api.portal_notifications import on_vt_sprint_update

        sprint_name = _make_sprint("Sprint Planning Test")
        task_a = _make_task("Task D", self.user_a)
        frappe.db.set_value("VT Task", task_a, "sprint", sprint_name)

        doc = frappe.get_doc("VT Sprint", sprint_name)
        doc._doc_before_save = frappe._dict(status="Active")
        doc.status = "Planning"

        with patch.object(frappe, "session") as mock_sess:
            mock_sess.user = "manager@test.local"
            on_vt_sprint_update(doc, None)

        self.assertEqual(_notif_count(self.user_a, "sprint_status", sprint_name), 0)

    def test_sprint_no_tasks_no_notifications(self):
        from vernon_tasks.api.portal_notifications import on_vt_sprint_update

        sprint_name = _make_sprint("Sprint Empty Test")
        doc = frappe.get_doc("VT Sprint", sprint_name)
        doc._doc_before_save = frappe._dict(status="Planning")
        doc.status = "Active"

        with patch.object(frappe, "session") as mock_sess:
            mock_sess.user = "manager@test.local"
            on_vt_sprint_update(doc, None)

        count = frappe.db.count(
            "Vernon Notification",
            {"event_type": "sprint_status", "reference_name": sprint_name},
        )
        self.assertEqual(count, 0)


# ---------------------------------------------------------------------------
# on_comment_insert tests
# ---------------------------------------------------------------------------

class TestOnCommentInsert(unittest.TestCase):

    def setUp(self):
        _enable_flag(1)
        self.user_a = _make_user("comment_a@test.local", "Comment A")
        self.user_b = _make_user("comment_b@test.local", "Comment B")
        frappe.db.delete("Vernon Notification", {
            "user": ["in", [self.user_a, self.user_b]]
        })

    def tearDown(self):
        frappe.db.delete("Vernon Notification", {
            "user": ["in", [self.user_a, self.user_b]]
        })

    def test_comment_on_vt_task_notifies_assigned_to(self):
        from vernon_tasks.api.portal_notifications import on_comment_insert

        task_name = _make_task("Commented Task", self.user_a)

        doc = frappe._dict(
            reference_doctype="VT Task",
            reference_name=task_name,
            comment_by=self.user_b,
            content="Nice work!",
        )

        on_comment_insert(doc, None)

        self.assertEqual(_notif_count(self.user_a, "comment", task_name), 1)

    def test_self_comment_no_notification(self):
        from vernon_tasks.api.portal_notifications import on_comment_insert

        task_name = _make_task("Self Comment Task", self.user_a)

        doc = frappe._dict(
            reference_doctype="VT Task",
            reference_name=task_name,
            comment_by=self.user_a,
            content="My own note",
        )

        on_comment_insert(doc, None)

        self.assertEqual(_notif_count(self.user_a, "comment", task_name), 0)

    def test_comment_on_non_vt_task_no_notification(self):
        from vernon_tasks.api.portal_notifications import on_comment_insert

        doc = frappe._dict(
            reference_doctype="VT Project",
            reference_name="PROJ-0001",
            comment_by=self.user_b,
            content="Project note",
        )

        on_comment_insert(doc, None)

        count = frappe.db.count("Vernon Notification", {"event_type": "comment"})
        self.assertEqual(count, 0)


# ---------------------------------------------------------------------------
# list_notifications endpoint tests
# ---------------------------------------------------------------------------

class TestListNotifications(unittest.TestCase):

    def setUp(self):
        _enable_flag(1)
        self.user = _make_user("list_notif@test.local", "List Notif")
        self.other = _make_user("list_other@test.local", "Other User")
        frappe.db.delete("Vernon Notification", {"user": ["in", [self.user, self.other]]})
        # Insert 3 unread task_assigned + 2 read sprint_status for self.user
        for i in range(3):
            frappe.get_doc({
                "doctype": "Vernon Notification",
                "user": self.user,
                "event_type": "task_assigned",
                "reference_doctype": "VT Task",
                "reference_name": f"VT-LIST-{i}",
                "message": f"Task {i}",
                "is_read": 0,
            }).insert(ignore_permissions=True)
        for i in range(2):
            frappe.get_doc({
                "doctype": "Vernon Notification",
                "user": self.user,
                "event_type": "sprint_status",
                "reference_doctype": "VT Sprint",
                "reference_name": f"SP-LIST-{i}",
                "message": f"Sprint {i}",
                "is_read": 1,
            }).insert(ignore_permissions=True)
        # One row for other user
        frappe.get_doc({
            "doctype": "Vernon Notification",
            "user": self.other,
            "event_type": "comment",
            "reference_doctype": "VT Task",
            "reference_name": "VT-OTHER-1",
            "message": "Other comment",
            "is_read": 0,
        }).insert(ignore_permissions=True)

    def tearDown(self):
        frappe.db.delete("Vernon Notification", {"user": ["in", [self.user, self.other]]})

    def test_returns_only_session_user_rows(self):
        from vernon_tasks.api.portal_notifications import list_notifications
        with patch.object(frappe, "session") as mock_sess:
            mock_sess.user = self.user
            result = list_notifications(limit=20, offset=0)
        names = {r["user"] for r in result["results"]}
        self.assertEqual(names, {self.user})

    def test_only_unread_filter(self):
        from vernon_tasks.api.portal_notifications import list_notifications
        with patch.object(frappe, "session") as mock_sess:
            mock_sess.user = self.user
            result = list_notifications(limit=20, offset=0, only_unread=1)
        self.assertEqual(len(result["results"]), 3)
        for r in result["results"]:
            self.assertEqual(r["is_read"], 0)

    def test_event_type_filter(self):
        from vernon_tasks.api.portal_notifications import list_notifications
        with patch.object(frappe, "session") as mock_sess:
            mock_sess.user = self.user
            result = list_notifications(limit=20, offset=0, event_type_filter="sprint_status")
        self.assertEqual(len(result["results"]), 2)

    def test_pagination_offset(self):
        from vernon_tasks.api.portal_notifications import list_notifications
        with patch.object(frappe, "session") as mock_sess:
            mock_sess.user = self.user
            result_page1 = list_notifications(limit=2, offset=0)
            result_page2 = list_notifications(limit=2, offset=2)
        names_p1 = {r["name"] for r in result_page1["results"]}
        names_p2 = {r["name"] for r in result_page2["results"]}
        self.assertEqual(len(names_p1), 2)
        self.assertTrue(names_p1.isdisjoint(names_p2))

    def test_total_unread_in_response(self):
        from vernon_tasks.api.portal_notifications import list_notifications
        with patch.object(frappe, "session") as mock_sess:
            mock_sess.user = self.user
            result = list_notifications(limit=20, offset=0)
        self.assertEqual(result["total_unread"], 3)


# ---------------------------------------------------------------------------
# mark_read / mark_all_read tests
# ---------------------------------------------------------------------------

class TestMarkRead(unittest.TestCase):

    def setUp(self):
        _enable_flag(1)
        self.user = _make_user("mark_read@test.local", "Mark Read")
        self.other = _make_user("mark_other@test.local", "Mark Other")
        frappe.db.delete("Vernon Notification", {"user": ["in", [self.user, self.other]]})
        self.notif = frappe.get_doc({
            "doctype": "Vernon Notification",
            "user": self.user,
            "event_type": "task_assigned",
            "reference_doctype": "VT Task",
            "reference_name": "VT-MR-1",
            "message": "Mark this",
            "is_read": 0,
        })
        self.notif.insert(ignore_permissions=True)
        self.other_notif = frappe.get_doc({
            "doctype": "Vernon Notification",
            "user": self.other,
            "event_type": "task_assigned",
            "reference_doctype": "VT Task",
            "reference_name": "VT-MR-2",
            "message": "Other mark",
            "is_read": 0,
        })
        self.other_notif.insert(ignore_permissions=True)

    def tearDown(self):
        frappe.db.delete("Vernon Notification", {"user": ["in", [self.user, self.other]]})

    def test_mark_read_sets_is_read(self):
        from vernon_tasks.api.portal_notifications import mark_read
        with patch.object(frappe, "session") as mock_sess:
            mock_sess.user = self.user
            result = mark_read(name=self.notif.name)
        self.assertTrue(result["ok"])
        val = frappe.db.get_value("Vernon Notification", self.notif.name, "is_read")
        self.assertEqual(val, 1)

    def test_mark_read_wrong_user_raises_permission_error(self):
        from vernon_tasks.api.portal_notifications import mark_read
        with patch.object(frappe, "session") as mock_sess:
            mock_sess.user = self.other
            with self.assertRaises(frappe.PermissionError):
                mark_read(name=self.notif.name)

    def test_mark_all_read_sets_all_unread_for_user(self):
        from vernon_tasks.api.portal_notifications import mark_all_read
        # Add second unread for self.user
        frappe.get_doc({
            "doctype": "Vernon Notification",
            "user": self.user,
            "event_type": "comment",
            "reference_doctype": "VT Task",
            "reference_name": "VT-MR-3",
            "message": "Also unread",
            "is_read": 0,
        }).insert(ignore_permissions=True)

        with patch.object(frappe, "session") as mock_sess:
            mock_sess.user = self.user
            result = mark_all_read()
        self.assertTrue(result["ok"])
        remaining = frappe.db.count("Vernon Notification", {"user": self.user, "is_read": 0})
        self.assertEqual(remaining, 0)

    def test_mark_all_read_does_not_affect_other_user(self):
        from vernon_tasks.api.portal_notifications import mark_all_read
        with patch.object(frappe, "session") as mock_sess:
            mock_sess.user = self.user
            mark_all_read()
        other_unread = frappe.db.count(
            "Vernon Notification", {"user": self.other, "is_read": 0}
        )
        self.assertEqual(other_unread, 1)


# ---------------------------------------------------------------------------
# Feature flag guard tests
# ---------------------------------------------------------------------------

class TestFeatureFlagGuard(unittest.TestCase):

    def test_list_notifications_raises_when_flag_off(self):
        from vernon_tasks.api.portal_notifications import list_notifications
        _enable_flag(0)
        try:
            with patch.object(frappe, "session") as mock_sess:
                mock_sess.user = "anyuser@test.local"
                with self.assertRaises(frappe.PermissionError):
                    list_notifications(limit=20, offset=0)
        finally:
            _enable_flag(1)

    def test_count_unread_raises_when_flag_off(self):
        from vernon_tasks.api.portal_notifications import count_unread
        _enable_flag(0)
        try:
            with patch.object(frappe, "session") as mock_sess:
                mock_sess.user = "anyuser@test.local"
                with self.assertRaises(frappe.PermissionError):
                    count_unread()
        finally:
            _enable_flag(1)

    def test_mark_read_raises_when_flag_off(self):
        from vernon_tasks.api.portal_notifications import mark_read
        _enable_flag(0)
        try:
            with patch.object(frappe, "session") as mock_sess:
                mock_sess.user = "anyuser@test.local"
                with self.assertRaises(frappe.PermissionError):
                    mark_read(name="VN-0001")
        finally:
            _enable_flag(1)

    def test_mark_all_read_raises_when_flag_off(self):
        from vernon_tasks.api.portal_notifications import mark_all_read
        _enable_flag(0)
        try:
            with patch.object(frappe, "session") as mock_sess:
                mock_sess.user = "anyuser@test.local"
                with self.assertRaises(frappe.PermissionError):
                    mark_all_read()
        finally:
            _enable_flag(1)

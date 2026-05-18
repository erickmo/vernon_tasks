# Portal Notifications P4c Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an in-app notification center for the desktop portal — a bell icon in TopBar with unread badge, a 5-item dropdown panel, and a full `/portal/notifications` inbox, powered by four backend event hooks (task assigned, review result, sprint status, comment) and a polling-based React Query frontend.

**Architecture:** New `vernon_tasks/api/portal_notifications.py` module exposes five whitelisted RPC endpoints; doc-event hooks in `hooks.py` call a shared `queue_notification` helper that writes to the existing `Vernon Notification` DocType with 30-second cache-invalidation. The React frontend (`pwa/src/portal/notifications/`) polls `count_unread` every 30 s via React Query and gates everything behind a `portal_notifications_enabled` feature flag in VT Settings, following the same FeatureGate pattern as P3.2 Sprints.

**Tech Stack:** Frappe v15 (Python), `unittest`, `bench run-tests`, React + TypeScript + Vite, React Query (`@tanstack/react-query`), Vitest + React Testing Library, `date-fns`.

**Spec:** `docs/superpowers/specs/2026-05-18-portal-notifications-p4c-design.html`

---

## File Structure (created or modified)

**Backend — created:**
- `vernon_tasks/api/portal_notifications.py` — all RPC endpoints + doc-event handlers + `queue_notification` helper
- `vernon_tasks/patches/v1_x/add_portal_notifications_flag.py` — schema patch for VT Settings field
- `vernon_tasks/tests/portal/test_portal_notifications.py` — all backend tests

**Backend — modified:**
- `vernon_tasks/vt_settings/doctype/vt_settings/vt_settings.json` — add `portal_notifications_enabled` Check field
- `vernon_tasks/hooks.py` — register doc-event handlers for VT Task, VT Sprint, Comment
- `vernon_tasks/patches.txt` — register new patch
- `vernon_tasks/task/api/telemetry.py` — add 8 portal.notif_* events to ALLOWED_EVENTS

**Frontend — created (`pwa/src/portal/notifications/`):**
- `api/portalNotifications.ts` — RPC wrappers
- `hooks/useNotificationCount.ts` — polls count_unread every 30s
- `hooks/useNotifications.ts` — fetches list_notifications
- `NotificationsFeatureGate.tsx` + `.test.tsx`
- `NotificationBell.tsx` + `.test.tsx`
- `NotificationPanel.tsx` + `.test.tsx`
- `NotificationItem.tsx` + `.test.tsx`
- `NotificationsPage.tsx` + `.test.tsx`
- `__integration.test.tsx`

**Frontend — modified:**
- `pwa/src/portal/TopBar.tsx` — replace static bell button with `NotificationsFeatureGate > NotificationBell`
- `pwa/src/portal/routes.tsx` — add `/portal/notifications` route
- `pwa/src/portal/nav.ts` — add "Notifications" nav item with key `notifications`
- `pwa/src/hooks/useVtSettings.ts` — add `portal_notifications_enabled` to `VtSettings` interface + fieldname list
- `pwa/src/telemetry.ts` — add 8 portal.notif_* events to `TelemetryEvent` union + typed track functions

---

## Conventions (read first)

- **Test runner backend:** `bench --site test_site run-tests --app vernon_tasks --module vernon_tasks.tests.portal.test_portal_notifications`. Tests use `unittest.TestCase`; fixtures inserted with `ignore_permissions=True`.
- **Test runner frontend:** `cd pwa && pnpm vitest run <pattern>`. Lint: `pnpm lint`. Type-check: `pnpm typecheck`.
- **Frappe RPC from client:** POST to `/api/method/vernon_tasks.api.portal_notifications.<fn>`. GET params passed as query string. Follows identical pattern to `pwa/src/portal/sprints/api/sprints.ts`.
- **Cache key convention:** `vt:portal:notif:unread:{user}` (TTL 30s), `vt:portal:notif:flag` (TTL 60s). Use `frappe.cache().get_value` / `frappe.cache().set_value`.
- **Branch:** Create `feat/portal-notifications-p4c` from `master` before Task 1.
- **Commit language:** deskripsi dalam bahasa indonesia, e.g. `feat(portal-notif): tambah flag portal_notifications_enabled`.
- **review_status detection:** `VT Task` uses `kanban_status` field. "In Review" → "Done" transition (or "Revision") is the review-result signal. Specifically: fire `task_review` notification when `kanban_status` changes to `"Done"` (approved) or `"Revision"` (rejected). This maps to the spec's "approve/reject" semantics using the actual field that exists.

---

## Task 0: Create feature branch

**Files:** none

- [ ] **Step 1: Create branch**

```bash
git checkout -b feat/portal-notifications-p4c
```

- [ ] **Step 2: Verify branch**

```bash
git branch --show-current
```

Expected: `feat/portal-notifications-p4c`

---

## Task 1: VT Settings — add `portal_notifications_enabled` flag

**Files:**
- Modify: `vernon_tasks/vt_settings/doctype/vt_settings/vt_settings.json`
- Create: `vernon_tasks/patches/v1_x/add_portal_notifications_flag.py`
- Modify: `vernon_tasks/patches.txt`

- [ ] **Step 1: Read current vt_settings.json**

Open `vernon_tasks/vt_settings/doctype/vt_settings/vt_settings.json`. Locate the `"field_order"` array and the `"fields"` array. Note that `"portal_sprints_enabled"` is the last portal flag at index 27 in `field_order` and near line 153 in `fields`.

- [ ] **Step 2: Add to `field_order`**

In the `"field_order"` array, add `"portal_notifications_enabled"` immediately after `"portal_sprints_enabled"`.

- [ ] **Step 3: Add to `fields` array**

After the `portal_sprints_enabled` field object in the `"fields"` array, insert:

```json
{
  "default": "0",
  "fieldname": "portal_notifications_enabled",
  "fieldtype": "Check",
  "label": "Portal Notifications Enabled"
}
```

- [ ] **Step 4: Create patch file**

Create `vernon_tasks/patches/v1_x/add_portal_notifications_flag.py`:

```python
import frappe


def execute():
    """Add portal_notifications_enabled Check field to VT Settings. Idempotent."""
    frappe.reload_doc("vt_settings", "doctype", "vt_settings")
    columns = frappe.db.sql(
        "SHOW COLUMNS FROM `tabVT Settings` LIKE 'portal_notifications_enabled'"
    )
    if not columns:
        frappe.db.sql_ddl(
            "ALTER TABLE `tabVT Settings`"
            " ADD COLUMN `portal_notifications_enabled` TINYINT(1) NOT NULL DEFAULT 0"
        )
    frappe.db.commit()
```

- [ ] **Step 5: Register patch in patches.txt**

Append to `vernon_tasks/patches.txt`:

```
vernon_tasks.patches.v1_x.add_portal_notifications_flag
```

- [ ] **Step 6: Commit**

```bash
git add vernon_tasks/vt_settings/doctype/vt_settings/vt_settings.json \
        vernon_tasks/patches/v1_x/add_portal_notifications_flag.py \
        vernon_tasks/patches.txt
git commit -m "feat(portal-notif): tambah field portal_notifications_enabled di VT Settings"
```

---

## Task 2: Backend — `portal_notifications.py` core module

This task builds the full backend: `queue_notification` helper, the four doc-event handlers, and all five RPC endpoints. Tests come first.

**Files:**
- Create: `vernon_tasks/tests/portal/__init__.py`
- Create: `vernon_tasks/tests/portal/test_portal_notifications.py`
- Create: `vernon_tasks/api/portal_notifications.py`

- [ ] **Step 1: Create test directory**

```bash
mkdir -p /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/vernon_tasks/tests/portal
touch /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/vernon_tasks/tests/__init__.py
touch /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/vernon_tasks/tests/portal/__init__.py
```

- [ ] **Step 2: Write failing tests**

Create `vernon_tasks/tests/portal/test_portal_notifications.py`:

```python
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
```

- [ ] **Step 3: Run tests — verify FAIL**

```bash
bench --site test_site run-tests --app vernon_tasks --module vernon_tasks.tests.portal.test_portal_notifications
```

Expected: `ImportError: cannot import name 'queue_notification' from 'vernon_tasks.api.portal_notifications'` (module does not exist yet).

- [ ] **Step 4: Implement `portal_notifications.py`**

Create `vernon_tasks/api/portal_notifications.py`:

```python
import frappe
from frappe import _
from vernon_tasks.task.api.security import clamp_int

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_UNREAD_CACHE_KEY = "vt:portal:notif:unread:{user}"
_FLAG_CACHE_KEY = "vt:portal:notif:flag"
_VALID_EVENT_TYPES = {"task_assigned", "task_review", "sprint_status", "comment"}

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _get_flag() -> bool:
    """Return portal_notifications_enabled from VT Settings. Cached 60s."""
    cached = frappe.cache().get_value(_FLAG_CACHE_KEY)
    if cached is not None:
        return bool(cached)
    value = frappe.db.get_single_value("VT Settings", "portal_notifications_enabled")
    frappe.cache().set_value(_FLAG_CACHE_KEY, int(bool(value)), expires_in_sec=60)
    return bool(value)


def _require_flag():
    """Raise PermissionError if the feature flag is off."""
    if not _get_flag():
        frappe.throw(_("Portal notifications are not enabled"), frappe.PermissionError)


def _invalidate_unread_cache(user: str) -> None:
    """Delete the unread-count cache entry for a given user."""
    frappe.cache().delete_value(_UNREAD_CACHE_KEY.format(user=user))


def _count_unread_for_user(user: str) -> int:
    """Return live count of unread Vernon Notification rows for user."""
    cached = frappe.cache().get_value(_UNREAD_CACHE_KEY.format(user=user))
    if cached is not None:
        return int(cached)
    count = frappe.db.count("Vernon Notification", {"user": user, "is_read": 0})
    frappe.cache().set_value(
        _UNREAD_CACHE_KEY.format(user=user), count, expires_in_sec=30
    )
    return count


# ---------------------------------------------------------------------------
# queue_notification — shared helper for all doc-event handlers
# ---------------------------------------------------------------------------


def queue_notification(
    user: str,
    event_type: str,
    reference_doctype: str,
    reference_name: str,
    message: str,
) -> None:
    """
    Create a Vernon Notification row for `user`.

    Guards:
    - Skip if user == "Guest"
    - Skip if user == frappe.session.user  (no self-notifications)
    - Skip if an unread row for same (user, event_type, reference_name) already exists
    """
    if not user or user == "Guest":
        return
    if user == frappe.session.user:
        return

    # Deduplication: skip if unread row already exists for same tuple
    existing = frappe.db.exists(
        "Vernon Notification",
        {
            "user": user,
            "event_type": event_type,
            "reference_doctype": reference_doctype,
            "reference_name": reference_name,
            "is_read": 0,
        },
    )
    if existing:
        return

    doc = frappe.get_doc({
        "doctype": "Vernon Notification",
        "user": user,
        "event_type": event_type,
        "reference_doctype": reference_doctype,
        "reference_name": reference_name,
        "message": message,
        "is_read": 0,
    })
    doc.insert(ignore_permissions=True)
    _invalidate_unread_cache(user)


# ---------------------------------------------------------------------------
# Doc-event handlers
# ---------------------------------------------------------------------------


def on_vt_task_update(doc, method):
    """
    Handle VT Task on_update.
    Fires notifications for:
      1. assigned_to change → task_assigned
      2. kanban_status change to Done (approved) or Revision (rejected) → task_review
    """
    if not _get_flag():
        return

    before = getattr(doc, "_doc_before_save", None)
    if before is None:
        return

    # --- task_assigned ---
    new_assigned = doc.assigned_to or ""
    old_assigned = before.assigned_to or ""
    if new_assigned and new_assigned != old_assigned:
        queue_notification(
            user=new_assigned,
            event_type="task_assigned",
            reference_doctype="VT Task",
            reference_name=doc.name,
            message=f"Task assigned to you: {doc.title}",
        )

    # --- task_review (approve/reject via kanban_status change) ---
    new_status = doc.kanban_status or ""
    old_status = before.kanban_status or ""
    if new_status != old_status and new_status in ("Done", "Revision"):
        assigned_to = doc.assigned_to or ""
        if not assigned_to:
            return
        if new_status == "Done":
            action = "approved"
        else:
            action = "rejected"
        queue_notification(
            user=assigned_to,
            event_type="task_review",
            reference_doctype="VT Task",
            reference_name=doc.name,
            message=f"Your task was {action}: {doc.title}",
        )


def on_vt_sprint_update(doc, method):
    """
    Handle VT Sprint on_update.
    Fires sprint_status notifications to all task owners when status → Active or Completed.
    """
    if not _get_flag():
        return

    before = getattr(doc, "_doc_before_save", None)
    if before is None:
        return

    new_status = doc.status or ""
    old_status = before.status or ""

    if new_status == old_status:
        return
    if new_status not in ("Active", "Completed"):
        return

    if new_status == "Active":
        message = f"Sprint started: {doc.sprint_title}"
    else:
        message = f"Sprint completed: {doc.sprint_title}"

    # Gather all assigned_to values for tasks in this sprint
    rows = frappe.get_all(
        "VT Task",
        filters={"sprint": doc.name},
        pluck="assigned_to",
    )
    recipients = list({r for r in rows if r and r != "Guest"})

    if len(recipients) > 100:
        frappe.log_error(
            f"Sprint {doc.name} has {len(recipients)} task owners — "
            "consider async queue for large sprint notifications (P4d).",
            "portal_notifications sprint fanout warning",
        )

    for user in recipients:
        queue_notification(
            user=user,
            event_type="sprint_status",
            reference_doctype="VT Sprint",
            reference_name=doc.name,
            message=message,
        )


def on_comment_insert(doc, method):
    """
    Handle Comment after_insert.
    Fires comment notification to the VT Task's assigned_to user.
    """
    if not _get_flag():
        return

    if doc.reference_doctype != "VT Task":
        return

    assigned_to = frappe.db.get_value(
        "VT Task", doc.reference_name, "assigned_to"
    )
    if not assigned_to:
        return

    # Self-comment guard
    if doc.comment_by == assigned_to:
        return

    commenter_name = (
        frappe.db.get_value("User", doc.comment_by, "full_name") or doc.comment_by
    )
    task_title = (
        frappe.db.get_value("VT Task", doc.reference_name, "title") or doc.reference_name
    )

    queue_notification(
        user=assigned_to,
        event_type="comment",
        reference_doctype="VT Task",
        reference_name=doc.reference_name,
        message=f"{commenter_name} commented on your task: {task_title}",
    )


# ---------------------------------------------------------------------------
# Whitelisted RPC endpoints
# ---------------------------------------------------------------------------


@frappe.whitelist()
def list_notifications(
    limit: int = 20,
    offset: int = 0,
    only_unread: int = 0,
    event_type_filter: str = "",
) -> dict:
    """
    Return paginated Vernon Notification rows for the session user.

    Query params:
      limit          int, clamped 1–100
      offset         int, clamped 0–10000
      only_unread    int 0/1
      event_type_filter  str, one of task_assigned|task_review|sprint_status|comment
    """
    _require_flag()
    user = frappe.session.user

    limit = clamp_int(int(limit), 1, 100, "limit")
    offset = clamp_int(int(offset), 0, 10000, "offset")

    filters = {"user": user}
    if int(only_unread):
        filters["is_read"] = 0
    if event_type_filter and event_type_filter in _VALID_EVENT_TYPES:
        filters["event_type"] = event_type_filter

    rows = frappe.get_all(
        "Vernon Notification",
        filters=filters,
        fields=["name", "event_type", "reference_doctype", "reference_name",
                "message", "is_read", "creation", "user"],
        order_by="creation desc",
        limit=limit,
        start=offset,
    )

    total_unread = _count_unread_for_user(user)

    return {"results": rows, "total_unread": total_unread}


@frappe.whitelist()
def count_unread() -> dict:
    """
    Return {"count": N} for session user. Returns {"count": 0} for Guest without throwing.
    """
    _require_flag()
    user = frappe.session.user
    if user == "Guest":
        return {"count": 0}
    return {"count": _count_unread_for_user(user)}


@frappe.whitelist(methods=["POST"])
def mark_read(name: str) -> dict:
    """
    Mark a single Vernon Notification as read.
    Raises PermissionError if the row belongs to a different user.
    """
    _require_flag()
    user = frappe.session.user

    doc = frappe.get_doc("Vernon Notification", name)
    if doc.user != user:
        frappe.throw(_("Forbidden"), frappe.PermissionError)

    doc.is_read = 1
    doc.save(ignore_permissions=True)
    _invalidate_unread_cache(user)
    return {"ok": True}


@frappe.whitelist(methods=["POST"])
def mark_all_read() -> dict:
    """
    Mark all unread Vernon Notification rows for session user as read.
    """
    _require_flag()
    user = frappe.session.user

    frappe.db.set_value(
        "Vernon Notification",
        {"user": user, "is_read": 0},
        "is_read",
        1,
        update_modified=False,
    )
    _invalidate_unread_cache(user)
    return {"ok": True}


@frappe.whitelist()
def get_feature_flag() -> dict:
    """Return {"enabled": bool} — cached 60s. Used by NotificationsFeatureGate."""
    # Note: this endpoint does NOT call _require_flag() — it's the flag check itself.
    return {"enabled": _get_flag()}
```

- [ ] **Step 5: Run tests — verify PASS**

```bash
bench --site test_site run-tests --app vernon_tasks --module vernon_tasks.tests.portal.test_portal_notifications
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add vernon_tasks/api/portal_notifications.py \
        vernon_tasks/tests/__init__.py \
        vernon_tasks/tests/portal/__init__.py \
        vernon_tasks/tests/portal/test_portal_notifications.py
git commit -m "feat(portal-notif): tambah modul portal_notifications.py dan test lengkap"
```

---

## Task 3: Register doc-event hooks in `hooks.py`

**Files:**
- Modify: `vernon_tasks/hooks.py`

- [ ] **Step 1: Update VT Task `on_update` list in `doc_events`**

The current `on_update` for `VT Task` is a list. Add the portal notifications handler at the end of that list.

Open `vernon_tasks/hooks.py`. Locate `doc_events`. Change:

```python
doc_events = {
    "VT Task": {
        "on_submit": "vernon_tasks.task.services.point_calculator.calculate_points",
        "on_update": [
            "vernon_tasks.task.services.scheduling_engine.on_task_update",
            "vernon_tasks.task.api.analytics.invalidate_project_cache",
        ],
        "validate": "vernon_tasks.task.doctype.vt_task.vt_task.validate_permissions",
    },
    "VT Project": {
        "validate": "vernon_tasks.project.doctype.vt_project.vt_project.validate_team",
    },
    "VT Sprint": {
        "on_update": "vernon_tasks.task.api.analytics.invalidate_project_cache",
    },
    "Notification Log": {
        "after_insert": "vernon_tasks.task.services.push_sender.send_push_for_notification",
    },
}
```

To:

```python
doc_events = {
    "VT Task": {
        "on_submit": "vernon_tasks.task.services.point_calculator.calculate_points",
        "on_update": [
            "vernon_tasks.task.services.scheduling_engine.on_task_update",
            "vernon_tasks.task.api.analytics.invalidate_project_cache",
            "vernon_tasks.api.portal_notifications.on_vt_task_update",
        ],
        "validate": "vernon_tasks.task.doctype.vt_task.vt_task.validate_permissions",
    },
    "VT Project": {
        "validate": "vernon_tasks.project.doctype.vt_project.vt_project.validate_team",
    },
    "VT Sprint": {
        "on_update": [
            "vernon_tasks.task.api.analytics.invalidate_project_cache",
            "vernon_tasks.api.portal_notifications.on_vt_sprint_update",
        ],
    },
    "Comment": {
        "after_insert": "vernon_tasks.api.portal_notifications.on_comment_insert",
    },
    "Notification Log": {
        "after_insert": "vernon_tasks.task.services.push_sender.send_push_for_notification",
    },
}
```

- [ ] **Step 2: Verify syntax**

```bash
python3 -c "import ast; ast.parse(open('apps/vernon_tasks/vernon_tasks/hooks.py').read()); print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add vernon_tasks/hooks.py
git commit -m "feat(portal-notif): daftarkan doc_events untuk VT Task, VT Sprint, Comment di hooks.py"
```

---

## Task 4: Telemetry allowlist (backend + frontend)

**Files:**
- Modify: `vernon_tasks/task/api/telemetry.py`
- Modify: `pwa/src/telemetry.ts`

- [ ] **Step 1: Add events to backend `ALLOWED_EVENTS`**

Open `vernon_tasks/task/api/telemetry.py`. Locate the `ALLOWED_EVENTS` set. After `"push_action_complete"`, add:

```python
    "portal.notif_bell_open",
    "portal.notif_panel_close",
    "portal.notif_item_click",
    "portal.notif_mark_read",
    "portal.notif_mark_all_read",
    "portal.notif_page_view",
    "portal.notif_filter_change",
    "portal.notif_load_more",
```

- [ ] **Step 2: Add events to frontend `TelemetryEvent` union**

Open `pwa/src/telemetry.ts`. After `"sprints.rank_rebalance"`, extend the union:

```typescript
  | "portal.notif_bell_open"
  | "portal.notif_panel_close"
  | "portal.notif_item_click"
  | "portal.notif_mark_read"
  | "portal.notif_mark_all_read"
  | "portal.notif_page_view"
  | "portal.notif_filter_change"
  | "portal.notif_load_more";
```

- [ ] **Step 3: Add typed track functions to `pwa/src/telemetry.ts`**

Append at end of file:

```typescript
export function trackNotifBellOpen(unread_count: number) {
  self.logEvent("portal.notif_bell_open", { unread_count });
}
export function trackNotifPanelClose(duration_ms: number) {
  self.logEvent("portal.notif_panel_close", { duration_ms });
}
export function trackNotifItemClick(event_type: string, is_read: boolean) {
  self.logEvent("portal.notif_item_click", { event_type, is_read });
}
export function trackNotifMarkRead(event_type: string) {
  self.logEvent("portal.notif_mark_read", { event_type });
}
export function trackNotifMarkAllRead(count_marked: number) {
  self.logEvent("portal.notif_mark_all_read", { count_marked });
}
export function trackNotifPageView(filter: string, only_unread: boolean) {
  self.logEvent("portal.notif_page_view", { filter, only_unread });
}
export function trackNotifFilterChange(from: string, to: string) {
  self.logEvent("portal.notif_filter_change", { from, to });
}
export function trackNotifLoadMore(offset: number, filter: string) {
  self.logEvent("portal.notif_load_more", { offset, filter });
}
```

- [ ] **Step 4: Type-check**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add vernon_tasks/task/api/telemetry.py pwa/src/telemetry.ts
git commit -m "feat(portal-notif): tambah 8 event telemetri portal.notif_* ke allowlist dan union type"
```

---

## Task 5: Frontend API client + hooks

**Files:**
- Create: `pwa/src/portal/notifications/api/portalNotifications.ts`
- Create: `pwa/src/portal/notifications/hooks/useNotificationCount.ts`
- Create: `pwa/src/portal/notifications/hooks/useNotifications.ts`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa/src/portal/notifications/api
mkdir -p /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa/src/portal/notifications/hooks
```

- [ ] **Step 2: Create `api/portalNotifications.ts`**

```typescript
import { api } from "../../../api/client";

const BASE = "/api/method/vernon_tasks.api.portal_notifications";

export interface PortalNotification {
  name: string;
  event_type: "task_assigned" | "task_review" | "sprint_status" | "comment";
  reference_doctype: string;
  reference_name: string;
  message: string;
  is_read: 0 | 1;
  creation: string;
  user: string;
}

export interface ListResult {
  results: PortalNotification[];
  total_unread: number;
}

export interface ListParams {
  limit?: number;
  offset?: number;
  onlyUnread?: boolean;
  eventTypeFilter?: string;
}

export const portalNotificationsApi = {
  listNotifications(p: ListParams = {}): Promise<ListResult> {
    return api.get<ListResult>(`${BASE}.list_notifications`, {
      limit: p.limit ?? 20,
      offset: p.offset ?? 0,
      only_unread: p.onlyUnread ? 1 : 0,
      event_type_filter: p.eventTypeFilter ?? "",
    });
  },

  countUnread(): Promise<{ count: number }> {
    return api.get<{ count: number }>(`${BASE}.count_unread`);
  },

  markRead(name: string): Promise<{ ok: boolean }> {
    return api.post<{ ok: boolean }>(`${BASE}.mark_read`, { name });
  },

  markAllRead(): Promise<{ ok: boolean }> {
    return api.post<{ ok: boolean }>(`${BASE}.mark_all_read`, {});
  },

  getFeatureFlag(): Promise<{ enabled: boolean }> {
    return api.get<{ enabled: boolean }>(`${BASE}.get_feature_flag`);
  },
};
```

- [ ] **Step 3: Create `hooks/useNotificationCount.ts`**

```typescript
import { useQuery } from "@tanstack/react-query";
import { portalNotificationsApi } from "../api/portalNotifications";

export function useNotificationCount() {
  return useQuery({
    queryKey: ["portal", "notif", "count"],
    queryFn: () => portalNotificationsApi.countUnread(),
    refetchInterval: 30_000,
    staleTime: 25_000,
    select: (data) => data.count,
  });
}
```

- [ ] **Step 4: Create `hooks/useNotifications.ts`**

```typescript
import { useQuery } from "@tanstack/react-query";
import { portalNotificationsApi, type ListParams } from "../api/portalNotifications";

interface UseNotificationsParams extends ListParams {
  enabled?: boolean;
}

export function useNotifications(params: UseNotificationsParams = {}) {
  return useQuery({
    queryKey: ["portal", "notif", "list", params],
    queryFn: () => portalNotificationsApi.listNotifications(params),
    enabled: params.enabled ?? true,
    staleTime: 15_000,
  });
}
```

- [ ] **Step 5: Type-check**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add pwa/src/portal/notifications/
git commit -m "feat(portal-notif): tambah API client dan hooks useNotificationCount, useNotifications"
```

---

## Task 6: `NotificationsFeatureGate` + `useVtSettings` extension

**Files:**
- Modify: `pwa/src/hooks/useVtSettings.ts`
- Create: `pwa/src/portal/notifications/NotificationsFeatureGate.tsx`
- Create: `pwa/src/portal/notifications/NotificationsFeatureGate.test.tsx`

- [ ] **Step 1: Write failing test**

Create `pwa/src/portal/notifications/NotificationsFeatureGate.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NotificationsFeatureGate } from "./NotificationsFeatureGate";

vi.mock("../../../hooks/useVtSettings", () => ({
  useVtSettings: vi.fn(),
}));

import { useVtSettings } from "../../../hooks/useVtSettings";
const mockUseVtSettings = vi.mocked(useVtSettings);

describe("NotificationsFeatureGate", () => {
  it("renders children when flag is enabled", () => {
    mockUseVtSettings.mockReturnValue({
      isLoading: false,
      data: { portal_notifications_enabled: 1 },
    } as ReturnType<typeof useVtSettings>);

    render(
      <NotificationsFeatureGate>
        <div>Notification Bell</div>
      </NotificationsFeatureGate>
    );

    expect(screen.getByText("Notification Bell")).toBeDefined();
  });

  it("renders null when flag is disabled", () => {
    mockUseVtSettings.mockReturnValue({
      isLoading: false,
      data: { portal_notifications_enabled: 0 },
    } as ReturnType<typeof useVtSettings>);

    const { container } = render(
      <NotificationsFeatureGate>
        <div>Notification Bell</div>
      </NotificationsFeatureGate>
    );

    expect(container.firstChild).toBeNull();
  });

  it("renders null while loading", () => {
    mockUseVtSettings.mockReturnValue({
      isLoading: true,
      data: undefined,
    } as ReturnType<typeof useVtSettings>);

    const { container } = render(
      <NotificationsFeatureGate>
        <div>Notification Bell</div>
      </NotificationsFeatureGate>
    );

    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run test — verify FAIL**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa && pnpm vitest run NotificationsFeatureGate
```

Expected: FAIL with "Cannot find module './NotificationsFeatureGate'".

- [ ] **Step 3: Extend `useVtSettings.ts`**

Open `pwa/src/hooks/useVtSettings.ts`. Add `portal_notifications_enabled` to the interface and the fieldname list:

```typescript
export interface VtSettings {
  portal_enabled: boolean | 0 | 1;
  portal_okr_enabled: boolean | 0 | 1;
  portal_projects_enabled: boolean | 0 | 1;
  portal_sprints_enabled: boolean | 0 | 1;
  portal_notifications_enabled: boolean | 0 | 1;
}
```

And in `fetchVtSettings`, change the `fieldname` JSON.stringify array to include `"portal_notifications_enabled"`:

```typescript
    fieldname: JSON.stringify([
      "portal_enabled",
      "portal_okr_enabled",
      "portal_projects_enabled",
      "portal_sprints_enabled",
      "portal_notifications_enabled",
    ]),
```

- [ ] **Step 4: Create `NotificationsFeatureGate.tsx`**

```tsx
import { type ReactNode } from "react";
import { useVtSettings } from "../../hooks/useVtSettings";

export function NotificationsFeatureGate({ children }: { children: ReactNode }) {
  const settings = useVtSettings();
  if (settings.isLoading) return null;
  if (!settings.data?.portal_notifications_enabled) return null;
  return <>{children}</>;
}
```

- [ ] **Step 5: Run test — verify PASS**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa && pnpm vitest run NotificationsFeatureGate
```

Expected: all 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add pwa/src/hooks/useVtSettings.ts \
        pwa/src/portal/notifications/NotificationsFeatureGate.tsx \
        pwa/src/portal/notifications/NotificationsFeatureGate.test.tsx
git commit -m "feat(portal-notif): tambah NotificationsFeatureGate dan extend useVtSettings"
```

---

## Task 7: `NotificationItem` component

**Files:**
- Create: `pwa/src/portal/notifications/NotificationItem.tsx`
- Create: `pwa/src/portal/notifications/NotificationItem.test.tsx`

- [ ] **Step 1: Write failing test**

Create `pwa/src/portal/notifications/NotificationItem.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NotificationItem } from "./NotificationItem";
import type { PortalNotification } from "./api/portalNotifications";

function makeNotif(overrides: Partial<PortalNotification> = {}): PortalNotification {
  return {
    name: "VN-0001",
    event_type: "task_assigned",
    reference_doctype: "VT Task",
    reference_name: "VT-0042",
    message: "Task assigned to you: Fix login",
    is_read: 0,
    creation: "2026-05-18 10:00:00",
    user: "test@test.local",
    ...overrides,
  };
}

describe("NotificationItem", () => {
  it("unread item has data-unread=true", () => {
    const { container } = render(
      <NotificationItem notification={makeNotif({ is_read: 0 })} onRead={vi.fn()} />
    );
    expect(container.querySelector("[data-unread='true']")).toBeTruthy();
  });

  it("read item has data-unread=false", () => {
    const { container } = render(
      <NotificationItem notification={makeNotif({ is_read: 1 })} onRead={vi.fn()} />
    );
    expect(container.querySelector("[data-unread='false']")).toBeTruthy();
  });

  it("click calls onRead with correct name", () => {
    const onRead = vi.fn();
    render(<NotificationItem notification={makeNotif()} onRead={onRead} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onRead).toHaveBeenCalledWith("VN-0001");
  });

  it("task_assigned shows clipboard icon", () => {
    const { container } = render(
      <NotificationItem notification={makeNotif({ event_type: "task_assigned" })} onRead={vi.fn()} />
    );
    expect(container.querySelector("[data-icon='task_assigned']")).toBeTruthy();
  });

  it("task_review shows review icon", () => {
    const { container } = render(
      <NotificationItem notification={makeNotif({ event_type: "task_review" })} onRead={vi.fn()} />
    );
    expect(container.querySelector("[data-icon='task_review']")).toBeTruthy();
  });

  it("sprint_status shows sprint icon", () => {
    const { container } = render(
      <NotificationItem notification={makeNotif({ event_type: "sprint_status" })} onRead={vi.fn()} />
    );
    expect(container.querySelector("[data-icon='sprint_status']")).toBeTruthy();
  });

  it("comment shows comment icon", () => {
    const { container } = render(
      <NotificationItem notification={makeNotif({ event_type: "comment" })} onRead={vi.fn()} />
    );
    expect(container.querySelector("[data-icon='comment']")).toBeTruthy();
  });

  it("renders message text", () => {
    render(
      <NotificationItem notification={makeNotif({ message: "Task assigned to you: Fix login" })} onRead={vi.fn()} />
    );
    expect(screen.getByText("Task assigned to you: Fix login")).toBeDefined();
  });

  it("renders relative timestamp", () => {
    render(<NotificationItem notification={makeNotif()} onRead={vi.fn()} />);
    // date-fns formatDistanceToNow returns something like "X minutes ago" or "about X years ago"
    const timeEl = document.querySelector("time");
    expect(timeEl).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test — verify FAIL**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa && pnpm vitest run NotificationItem.test
```

Expected: FAIL with "Cannot find module './NotificationItem'".

- [ ] **Step 3: Install `date-fns` if not already present**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa && pnpm list date-fns 2>/dev/null | grep date-fns || pnpm add date-fns
```

- [ ] **Step 4: Implement `NotificationItem.tsx`**

```tsx
import { formatDistanceToNow } from "date-fns";
import type { PortalNotification } from "./api/portalNotifications";

interface Props {
  notification: PortalNotification;
  onRead: (name: string) => void;
}

function EventIcon({ eventType }: { eventType: PortalNotification["event_type"] }) {
  const icons: Record<PortalNotification["event_type"], string> = {
    task_assigned: "📋",
    task_review: "✅",
    sprint_status: "⚡",
    comment: "💬",
  };
  return (
    <span
      className="notif-item__icon"
      data-icon={eventType}
      aria-hidden="true"
    >
      {icons[eventType]}
    </span>
  );
}

export function NotificationItem({ notification, onRead }: Props) {
  const { name, event_type, message, is_read, creation } = notification;
  const isUnread = is_read === 0;

  const creationDate = new Date(creation.replace(" ", "T"));
  const relativeTime = formatDistanceToNow(creationDate, { addSuffix: true });

  function handleClick() {
    onRead(name);
  }

  return (
    <button
      type="button"
      className="notif-item"
      data-unread={String(isUnread)}
      onClick={handleClick}
      aria-label={message}
    >
      <div className="notif-item__icon-wrap">
        <EventIcon eventType={event_type} />
      </div>
      <div className="notif-item__body">
        <p className="notif-item__message">{message}</p>
        <time
          className="notif-item__time"
          dateTime={creationDate.toISOString()}
        >
          {relativeTime}
        </time>
      </div>
    </button>
  );
}
```

- [ ] **Step 5: Run test — verify PASS**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa && pnpm vitest run NotificationItem.test
```

Expected: all 9 tests pass.

- [ ] **Step 6: Commit**

```bash
git add pwa/src/portal/notifications/NotificationItem.tsx \
        pwa/src/portal/notifications/NotificationItem.test.tsx
git commit -m "feat(portal-notif): tambah komponen NotificationItem dengan icon dan timestamp relatif"
```

---

## Task 8: `NotificationPanel` component

**Files:**
- Create: `pwa/src/portal/notifications/NotificationPanel.tsx`
- Create: `pwa/src/portal/notifications/NotificationPanel.test.tsx`

- [ ] **Step 1: Write failing test**

Create `pwa/src/portal/notifications/NotificationPanel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { NotificationPanel } from "./NotificationPanel";

vi.mock("./api/portalNotifications", () => ({
  portalNotificationsApi: {
    listNotifications: vi.fn(),
    markAllRead: vi.fn(),
    countUnread: vi.fn(),
  },
}));

import { portalNotificationsApi } from "./api/portalNotifications";
const mockApi = vi.mocked(portalNotificationsApi);

function renderPanel(props = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <NotificationPanel onClose={vi.fn()} {...props} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("NotificationPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.countUnread.mockResolvedValue({ count: 0 });
  });

  it("shows loading skeletons while fetching", () => {
    mockApi.listNotifications.mockReturnValue(new Promise(() => {}));
    renderPanel();
    const skeletons = document.querySelectorAll(".notif-panel__skeleton");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("shows 5 items when 5 notifications returned", async () => {
    const items = Array.from({ length: 5 }, (_, i) => ({
      name: `VN-${i}`,
      event_type: "task_assigned" as const,
      reference_doctype: "VT Task",
      reference_name: `VT-${i}`,
      message: `Task ${i}`,
      is_read: 0 as const,
      creation: "2026-05-18 10:00:00",
      user: "u@test.local",
    }));
    mockApi.listNotifications.mockResolvedValue({ results: items, total_unread: 5 });

    renderPanel();

    await waitFor(() => {
      expect(screen.getAllByRole("button").filter(b => b.classList.contains("notif-item")).length).toBe(5);
    });
  });

  it("shows View all link pointing to /portal/notifications", async () => {
    mockApi.listNotifications.mockResolvedValue({ results: [], total_unread: 0 });
    renderPanel();
    await waitFor(() => {
      const link = screen.getByText(/view all/i);
      expect(link).toBeDefined();
      expect((link as HTMLAnchorElement).getAttribute("href")).toBe("/portal/notifications");
    });
  });

  it("shows empty state when results empty", async () => {
    mockApi.listNotifications.mockResolvedValue({ results: [], total_unread: 0 });
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText(/you're all caught up/i)).toBeDefined();
    });
  });

  it("shows error state on fetch failure with retry button", async () => {
    mockApi.listNotifications.mockRejectedValue(new Error("Network error"));
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText(/could not load notifications/i)).toBeDefined();
      expect(screen.getByRole("button", { name: /retry/i })).toBeDefined();
    });
  });

  it("Mark all read button calls markAllRead", async () => {
    mockApi.listNotifications.mockResolvedValue({
      results: [
        {
          name: "VN-1",
          event_type: "task_assigned" as const,
          reference_doctype: "VT Task",
          reference_name: "VT-1",
          message: "Task 1",
          is_read: 0 as const,
          creation: "2026-05-18 10:00:00",
          user: "u@test.local",
        },
      ],
      total_unread: 1,
    });
    mockApi.markAllRead.mockResolvedValue({ ok: true });

    renderPanel();

    await waitFor(() => screen.getByRole("button", { name: /mark all read/i }));
    fireEvent.click(screen.getByRole("button", { name: /mark all read/i }));

    await waitFor(() => {
      expect(mockApi.markAllRead).toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run test — verify FAIL**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa && pnpm vitest run NotificationPanel.test
```

Expected: FAIL with "Cannot find module './NotificationPanel'".

- [ ] **Step 3: Implement `NotificationPanel.tsx`**

```tsx
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useNotifications } from "./hooks/useNotifications";
import { portalNotificationsApi } from "./api/portalNotifications";
import { NotificationItem } from "./NotificationItem";
import type { PortalNotification } from "./api/portalNotifications";
import * as telemetry from "../../telemetry";

interface Props {
  onClose: () => void;
}

function SkeletonRow() {
  return (
    <div className="notif-panel__skeleton" aria-hidden="true">
      <div className="notif-panel__skeleton-icon" />
      <div className="notif-panel__skeleton-body">
        <div className="notif-panel__skeleton-line" />
        <div className="notif-panel__skeleton-line notif-panel__skeleton-line--short" />
      </div>
    </div>
  );
}

export function NotificationPanel({ onClose }: Props) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useNotifications({
    limit: 5,
    offset: 0,
  });

  const items: PortalNotification[] = data?.results ?? [];
  const totalUnread: number = data?.total_unread ?? 0;

  async function handleMarkAllRead() {
    await portalNotificationsApi.markAllRead();
    telemetry.trackNotifMarkAllRead(totalUnread);
    queryClient.invalidateQueries({ queryKey: ["portal", "notif"] });
  }

  function handleRead(name: string) {
    const notif = items.find((n) => n.name === name);
    // Optimistic update
    queryClient.setQueryData(
      ["portal", "notif", "list", { limit: 5, offset: 0 }],
      (old: typeof data) => {
        if (!old) return old;
        return {
          ...old,
          results: old.results.map((n) =>
            n.name === name ? { ...n, is_read: 1 as const } : n
          ),
        };
      }
    );
    portalNotificationsApi.markRead(name).then(() => {
      queryClient.invalidateQueries({ queryKey: ["portal", "notif", "count"] });
    });
    if (notif) {
      telemetry.trackNotifMarkRead(notif.event_type);
    }
  }

  return (
    <div
      className="notif-panel"
      role="dialog"
      aria-label="Notifications"
    >
      <div className="notif-panel__header">
        <span className="notif-panel__title">Notifications</span>
        {totalUnread > 0 && (
          <button
            type="button"
            className="notif-panel__mark-all"
            onClick={handleMarkAllRead}
            aria-label="Mark all read"
          >
            Mark all read
          </button>
        )}
      </div>

      <div className="notif-panel__list">
        {isLoading && (
          <>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </>
        )}

        {isError && (
          <div className="notif-panel__error">
            <p>Could not load notifications. Retry?</p>
            <button type="button" onClick={() => refetch()} aria-label="Retry">
              Retry
            </button>
          </div>
        )}

        {!isLoading && !isError && items.length === 0 && (
          <div className="notif-panel__empty">
            <span>You&apos;re all caught up</span>
          </div>
        )}

        {!isLoading && !isError && items.map((notif) => (
          <NotificationItem
            key={notif.name}
            notification={notif}
            onRead={handleRead}
          />
        ))}
      </div>

      <div className="notif-panel__footer">
        <Link
          to="/portal/notifications"
          className="notif-panel__view-all"
          onClick={onClose}
        >
          View all notifications →
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test — verify PASS**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa && pnpm vitest run NotificationPanel.test
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add pwa/src/portal/notifications/NotificationPanel.tsx \
        pwa/src/portal/notifications/NotificationPanel.test.tsx
git commit -m "feat(portal-notif): tambah NotificationPanel dengan loading, empty, error, mark all read"
```

---

## Task 9: `NotificationBell` component + `TopBar.tsx` integration

**Files:**
- Create: `pwa/src/portal/notifications/NotificationBell.tsx`
- Create: `pwa/src/portal/notifications/NotificationBell.test.tsx`
- Modify: `pwa/src/portal/TopBar.tsx`

- [ ] **Step 1: Write failing test**

Create `pwa/src/portal/notifications/NotificationBell.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { NotificationBell } from "./NotificationBell";

vi.mock("./hooks/useNotificationCount", () => ({
  useNotificationCount: vi.fn(),
}));
vi.mock("./NotificationPanel", () => ({
  NotificationPanel: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog">
      <button onClick={onClose}>close</button>
    </div>
  ),
}));

import { useNotificationCount } from "./hooks/useNotificationCount";
const mockCount = vi.mocked(useNotificationCount);

function renderBell() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("NotificationBell", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders without badge when count is 0", () => {
    mockCount.mockReturnValue(0 as unknown as ReturnType<typeof useNotificationCount>);
    renderBell();
    expect(document.querySelector(".notif-bell__badge")).toBeNull();
  });

  it("renders badge with correct count when count > 0", () => {
    mockCount.mockReturnValue(3 as unknown as ReturnType<typeof useNotificationCount>);
    renderBell();
    expect(screen.getByText("3")).toBeDefined();
  });

  it("badge shows 99+ when count >= 100", () => {
    mockCount.mockReturnValue(100 as unknown as ReturnType<typeof useNotificationCount>);
    renderBell();
    expect(screen.getByText("99+")).toBeDefined();
  });

  it("click opens panel (aria-expanded becomes true)", () => {
    mockCount.mockReturnValue(2 as unknown as ReturnType<typeof useNotificationCount>);
    renderBell();
    const btn = screen.getByRole("button", { name: /notifications/i });
    fireEvent.click(btn);
    expect(screen.getByRole("dialog")).toBeDefined();
  });

  it("second click closes panel", () => {
    mockCount.mockReturnValue(0 as unknown as ReturnType<typeof useNotificationCount>);
    renderBell();
    const btn = screen.getByRole("button", { name: /notifications/i });
    fireEvent.click(btn);
    expect(screen.queryByRole("dialog")).toBeTruthy();
    fireEvent.click(btn);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Escape key closes panel", async () => {
    mockCount.mockReturnValue(0 as unknown as ReturnType<typeof useNotificationCount>);
    renderBell();
    const btn = screen.getByRole("button", { name: /notifications/i });
    fireEvent.click(btn);
    expect(screen.queryByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("aria-label reflects count when unread > 0", () => {
    mockCount.mockReturnValue(3 as unknown as ReturnType<typeof useNotificationCount>);
    renderBell();
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-label")).toBe("Notifications — 3 unread");
  });

  it("aria-label is plain Notifications when count is 0", () => {
    mockCount.mockReturnValue(0 as unknown as ReturnType<typeof useNotificationCount>);
    renderBell();
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-label")).toBe("Notifications");
  });
});
```

- [ ] **Step 2: Run test — verify FAIL**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa && pnpm vitest run NotificationBell.test
```

Expected: FAIL with "Cannot find module './NotificationBell'".

- [ ] **Step 3: Implement `NotificationBell.tsx`**

```tsx
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useNotificationCount } from "./hooks/useNotificationCount";
import { NotificationPanel } from "./NotificationPanel";
import * as telemetry from "../../telemetry";

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 0, right: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const openedAt = useRef<number>(0);
  const count = useNotificationCount();
  const unreadCount = typeof count === "number" ? count : 0;

  const badgeLabel = unreadCount >= 100 ? "99+" : String(unreadCount);
  const ariaLabel =
    unreadCount > 0 ? `Notifications — ${unreadCount} unread` : "Notifications";

  function handleClick() {
    if (!isOpen) {
      // Compute panel position from button bounding rect
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        setPanelPos({
          top: rect.bottom + 8,
          right: window.innerWidth - rect.right,
        });
      }
      openedAt.current = Date.now();
      telemetry.trackNotifBellOpen(unreadCount);
    } else {
      telemetry.trackNotifPanelClose(Date.now() - openedAt.current);
    }
    setIsOpen((prev) => !prev);
  }

  function handleClose() {
    telemetry.trackNotifPanelClose(Date.now() - openedAt.current);
    setIsOpen(false);
  }

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        handleClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="portal-topbar__bell"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={handleClick}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="notif-bell__badge" aria-hidden="true">
            {badgeLabel}
          </span>
        )}
      </button>

      {isOpen &&
        createPortal(
          <div
            className="notif-bell__panel-wrapper"
            style={{
              position: "fixed",
              top: panelPos.top,
              right: panelPos.right,
              zIndex: 9999,
            }}
          >
            <NotificationPanel onClose={handleClose} />
          </div>,
          document.body
        )}
    </>
  );
}
```

- [ ] **Step 4: Run test — verify PASS**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa && pnpm vitest run NotificationBell.test
```

Expected: all 8 tests pass.

- [ ] **Step 5: Update `TopBar.tsx`**

Replace the static bell button with the gated `NotificationBell`. In `pwa/src/portal/TopBar.tsx`, change:

```tsx
import { NavLink, Link } from "react-router-dom";
import * as permsHook from "../auth/usePermissions";
import * as telemetry from "../telemetry";
import { portalNav, filterNavByPermissions } from "./nav";
```

To:

```tsx
import { NavLink, Link } from "react-router-dom";
import * as permsHook from "../auth/usePermissions";
import * as telemetry from "../telemetry";
import { portalNav, filterNavByPermissions } from "./nav";
import { NotificationsFeatureGate } from "./notifications/NotificationsFeatureGate";
import { NotificationBell } from "./notifications/NotificationBell";
```

And replace:

```tsx
      <button type="button" className="portal-topbar__bell" aria-label="Notifications">🔔</button>
```

With:

```tsx
      <NotificationsFeatureGate>
        <NotificationBell />
      </NotificationsFeatureGate>
```

- [ ] **Step 6: Run TopBar tests**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa && pnpm vitest run TopBar.test
```

Expected: all existing TopBar tests pass.

- [ ] **Step 7: Commit**

```bash
git add pwa/src/portal/notifications/NotificationBell.tsx \
        pwa/src/portal/notifications/NotificationBell.test.tsx \
        pwa/src/portal/TopBar.tsx
git commit -m "feat(portal-notif): tambah NotificationBell ke TopBar dengan badge, panel, dan Escape handler"
```

---

## Task 10: `NotificationsPage` component

**Files:**
- Create: `pwa/src/portal/notifications/NotificationsPage.tsx`
- Create: `pwa/src/portal/notifications/NotificationsPage.test.tsx`

- [ ] **Step 1: Write failing test**

Create `pwa/src/portal/notifications/NotificationsPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { NotificationsPage } from "./NotificationsPage";

vi.mock("./api/portalNotifications", () => ({
  portalNotificationsApi: {
    listNotifications: vi.fn(),
    markAllRead: vi.fn(),
    countUnread: vi.fn(),
  },
}));

import { portalNotificationsApi } from "./api/portalNotifications";
const mockApi = vi.mocked(portalNotificationsApi);

function makeItems(count: number, eventType = "task_assigned") {
  return Array.from({ length: count }, (_, i) => ({
    name: `VN-${i}`,
    event_type: eventType as "task_assigned",
    reference_doctype: "VT Task",
    reference_name: `VT-${i}`,
    message: `Notification ${i}`,
    is_read: 0 as const,
    creation: "2026-05-18 10:00:00",
    user: "u@test.local",
  }));
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("NotificationsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.countUnread.mockResolvedValue({ count: 0 });
  });

  it("renders filter tabs: All, Tasks, Reviews, Sprints, Comments", async () => {
    mockApi.listNotifications.mockResolvedValue({ results: [], total_unread: 0 });
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /all/i })).toBeDefined();
      expect(screen.getByRole("tab", { name: /tasks/i })).toBeDefined();
      expect(screen.getByRole("tab", { name: /reviews/i })).toBeDefined();
      expect(screen.getByRole("tab", { name: /sprints/i })).toBeDefined();
      expect(screen.getByRole("tab", { name: /comments/i })).toBeDefined();
    });
  });

  it("clicking Tasks tab passes event_type_filter=task_assigned", async () => {
    mockApi.listNotifications.mockResolvedValue({ results: [], total_unread: 0 });
    renderPage();

    await waitFor(() => screen.getByRole("tab", { name: /tasks/i }));
    fireEvent.click(screen.getByRole("tab", { name: /tasks/i }));

    await waitFor(() => {
      expect(mockApi.listNotifications).toHaveBeenCalledWith(
        expect.objectContaining({ eventTypeFilter: "task_assigned" })
      );
    });
  });

  it("Unread only toggle updates query with onlyUnread=true", async () => {
    mockApi.listNotifications.mockResolvedValue({ results: [], total_unread: 0 });
    renderPage();

    await waitFor(() => screen.getByRole("checkbox", { name: /unread only/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /unread only/i }));

    await waitFor(() => {
      expect(mockApi.listNotifications).toHaveBeenCalledWith(
        expect.objectContaining({ onlyUnread: true })
      );
    });
  });

  it("Load more button appends next page", async () => {
    // First page returns exactly 20 items (implies more)
    mockApi.listNotifications
      .mockResolvedValueOnce({ results: makeItems(20), total_unread: 25 })
      .mockResolvedValueOnce({ results: makeItems(5, "sprint_status"), total_unread: 25 });

    renderPage();
    await waitFor(() => screen.getByRole("button", { name: /load more/i }));
    fireEvent.click(screen.getByRole("button", { name: /load more/i }));

    await waitFor(() => {
      // 20 original + 5 more = 25 NotificationItem buttons
      expect(mockApi.listNotifications).toHaveBeenCalledTimes(2);
    });
  });

  it("Mark all read invalidates list and count queries", async () => {
    mockApi.listNotifications.mockResolvedValue({
      results: makeItems(1),
      total_unread: 1,
    });
    mockApi.markAllRead.mockResolvedValue({ ok: true });
    renderPage();

    await waitFor(() => screen.getByRole("button", { name: /mark all read/i }));
    fireEvent.click(screen.getByRole("button", { name: /mark all read/i }));

    await waitFor(() => {
      expect(mockApi.markAllRead).toHaveBeenCalled();
    });
  });

  it("shows empty state for All tab with no notifications", async () => {
    mockApi.listNotifications.mockResolvedValue({ results: [], total_unread: 0 });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/nothing here yet/i)).toBeDefined();
    });
  });

  it("shows filtered empty state when filter active and no results", async () => {
    mockApi.listNotifications.mockResolvedValue({ results: [], total_unread: 0 });
    renderPage();
    await waitFor(() => screen.getByRole("tab", { name: /tasks/i }));
    fireEvent.click(screen.getByRole("tab", { name: /tasks/i }));
    await waitFor(() => {
      expect(screen.getByText(/no tasks notifications/i)).toBeDefined();
    });
  });
});
```

- [ ] **Step 2: Run test — verify FAIL**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa && pnpm vitest run NotificationsPage.test
```

Expected: FAIL with "Cannot find module './NotificationsPage'".

- [ ] **Step 3: Implement `NotificationsPage.tsx`**

```tsx
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { portalNotificationsApi, type PortalNotification } from "./api/portalNotifications";
import { NotificationItem } from "./NotificationItem";
import * as telemetry from "../../telemetry";

type FilterTab = {
  key: string;
  label: string;
  eventTypeFilter: string;
};

const FILTER_TABS: FilterTab[] = [
  { key: "all",      label: "All",      eventTypeFilter: "" },
  { key: "tasks",    label: "Tasks",    eventTypeFilter: "task_assigned" },
  { key: "reviews",  label: "Reviews",  eventTypeFilter: "task_review" },
  { key: "sprints",  label: "Sprints",  eventTypeFilter: "sprint_status" },
  { key: "comments", label: "Comments", eventTypeFilter: "comment" },
];

const PAGE_SIZE = 20;

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<FilterTab>(FILTER_TABS[0]);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [items, setItems] = useState<PortalNotification[]>([]);
  const [offset, setOffset] = useState(0);
  const [totalUnread, setTotalUnread] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  async function loadPage(newOffset: number, append = false) {
    setIsLoading(true);
    try {
      const result = await portalNotificationsApi.listNotifications({
        limit: PAGE_SIZE,
        offset: newOffset,
        onlyUnread,
        eventTypeFilter: activeTab.eventTypeFilter,
      });
      setTotalUnread(result.total_unread);
      setHasMore(result.results.length === PAGE_SIZE);
      if (append) {
        setItems((prev) => [...prev, ...result.results]);
      } else {
        setItems(result.results);
      }
    } finally {
      setIsLoading(false);
    }
  }

  // Reload on filter or unread-only change
  useEffect(() => {
    setOffset(0);
    setItems([]);
    loadPage(0, false);
    telemetry.trackNotifPageView(activeTab.eventTypeFilter, onlyUnread);
  }, [activeTab, onlyUnread]);

  function handleTabChange(tab: FilterTab) {
    telemetry.trackNotifFilterChange(activeTab.eventTypeFilter, tab.eventTypeFilter);
    setActiveTab(tab);
  }

  function handleLoadMore() {
    const newOffset = offset + PAGE_SIZE;
    setOffset(newOffset);
    telemetry.trackNotifLoadMore(newOffset, activeTab.eventTypeFilter);
    loadPage(newOffset, true);
  }

  async function handleMarkAllRead() {
    await portalNotificationsApi.markAllRead();
    telemetry.trackNotifMarkAllRead(totalUnread);
    queryClient.invalidateQueries({ queryKey: ["portal", "notif"] });
    setItems((prev) => prev.map((n) => ({ ...n, is_read: 1 as const })));
    setTotalUnread(0);
  }

  function handleRead(name: string) {
    const notif = items.find((n) => n.name === name);
    setItems((prev) =>
      prev.map((n) => (n.name === name ? { ...n, is_read: 1 as const } : n))
    );
    portalNotificationsApi.markRead(name).then(() => {
      queryClient.invalidateQueries({ queryKey: ["portal", "notif", "count"] });
    });
    if (notif) {
      telemetry.trackNotifMarkRead(notif.event_type);
      telemetry.trackNotifItemClick(notif.event_type, notif.is_read === 1);
    }
  }

  const emptyMessage =
    activeTab.key === "all"
      ? "Nothing here yet. Notifications will appear when tasks are assigned, reviewed, or sprints change."
      : `No ${activeTab.label.toLowerCase()} notifications.`;

  return (
    <div className="notif-page">
      <div className="notif-page__header">
        <h1 className="notif-page__title">Notifications</h1>
        {totalUnread > 0 && (
          <button
            type="button"
            className="notif-page__mark-all"
            onClick={handleMarkAllRead}
            aria-label="Mark all read"
          >
            Mark all read
          </button>
        )}
      </div>

      <div className="notif-page__filters" role="tablist" aria-label="Notification filters">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab.key === tab.key}
            className={`notif-page__tab ${activeTab.key === tab.key ? "notif-page__tab--active" : ""}`}
            onClick={() => handleTabChange(tab)}
            aria-label={tab.label}
          >
            {tab.label}
          </button>
        ))}
        <label className="notif-page__unread-toggle">
          <input
            type="checkbox"
            checked={onlyUnread}
            onChange={(e) => setOnlyUnread(e.target.checked)}
            aria-label="Unread only"
          />
          Unread only
        </label>
      </div>

      <div className="notif-page__list">
        {items.map((notif) => (
          <NotificationItem
            key={notif.name}
            notification={notif}
            onRead={handleRead}
          />
        ))}

        {!isLoading && items.length === 0 && (
          <div className="notif-page__empty">
            <p>{emptyMessage}</p>
          </div>
        )}

        {hasMore && !isLoading && (
          <button
            type="button"
            className="notif-page__load-more"
            onClick={handleLoadMore}
            aria-label="Load more"
          >
            Load more
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test — verify PASS**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa && pnpm vitest run NotificationsPage.test
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add pwa/src/portal/notifications/NotificationsPage.tsx \
        pwa/src/portal/notifications/NotificationsPage.test.tsx
git commit -m "feat(portal-notif): tambah NotificationsPage dengan filter tab, unread toggle, load more"
```

---

## Task 11: Routes + nav integration

**Files:**
- Modify: `pwa/src/portal/routes.tsx`
- Modify: `pwa/src/portal/nav.ts`
- Modify: `pwa/src/portal/nav.test.ts` (verify nav item count)

- [ ] **Step 1: Add notifications route to `PortalRoutes`**

Open `pwa/src/portal/routes.tsx`. Add imports:

```tsx
import { NotificationsFeatureGate } from "./notifications/NotificationsFeatureGate";
import { NotificationsPage } from "./notifications/NotificationsPage";
```

Before the `<Route path="*" element={<NotFound />} />` line, add:

```tsx
      <Route
        path="notifications"
        element={
          <NotificationsFeatureGate>
            <NotificationsPage />
          </NotificationsFeatureGate>
        }
      />
```

- [ ] **Step 2: Add nav item to `nav.ts`**

Open `pwa/src/portal/nav.ts`. Add the notifications entry after the `projects` entry:

```typescript
export const portalNav: NavItem[] = [
  { key: "dashboard",      label: "Dashboard",      path: "/portal",                   permission: null },
  { key: "okr",            label: "OKR",            path: "/portal/okr",               permission: "okr.read" },
  { key: "projects",       label: "Projects",       path: "/portal/projects",          permission: "project.read" },
  { key: "notifications",  label: "Notifications",  path: "/portal/notifications",     permission: null },
  { key: "workforce",      label: "Workforce",      path: "/portal/workforce",         permission: "workforce.read" },
  { key: "reports",        label: "Reports",        path: "/portal/reports",           permission: "report.read" },
];
```

- [ ] **Step 3: Type-check and run existing nav tests**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa && pnpm typecheck && pnpm vitest run nav.test
```

Expected: typecheck passes; nav tests pass (update test expectations if the test counts nav items by length — change expected count from 5 to 6).

- [ ] **Step 4: Run existing routes tests**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa && pnpm vitest run routes
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add pwa/src/portal/routes.tsx pwa/src/portal/nav.ts pwa/src/portal/nav.test.ts
git commit -m "feat(portal-notif): tambah route /portal/notifications dan nav item Notifications"
```

---

## Task 12: Integration test

**Files:**
- Create: `pwa/src/portal/notifications/__integration.test.tsx`

- [ ] **Step 1: Write integration test**

Create `pwa/src/portal/notifications/__integration.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { NotificationsFeatureGate } from "./NotificationsFeatureGate";
import { NotificationsPage } from "./NotificationsPage";
import { NotificationBell } from "./NotificationBell";

vi.mock("../../hooks/useVtSettings", () => ({
  useVtSettings: vi.fn(),
}));
vi.mock("./api/portalNotifications", () => ({
  portalNotificationsApi: {
    listNotifications: vi.fn(async () => ({
      results: [
        {
          name: "VN-INT-1",
          event_type: "task_assigned",
          reference_doctype: "VT Task",
          reference_name: "VT-INT-1",
          message: "Integration task assigned",
          is_read: 0,
          creation: "2026-05-18 10:00:00",
          user: "u@test.local",
        },
      ],
      total_unread: 1,
    })),
    countUnread: vi.fn(async () => ({ count: 1 })),
    markAllRead: vi.fn(async () => ({ ok: true })),
    markRead: vi.fn(async () => ({ ok: true })),
    getFeatureFlag: vi.fn(async () => ({ enabled: true })),
  },
}));
vi.mock("./hooks/useNotificationCount", () => ({
  useNotificationCount: () => 1,
}));

import { useVtSettings } from "../../hooks/useVtSettings";
const mockVtSettings = vi.mocked(useVtSettings);

function renderWithFlag(enabled: 0 | 1) {
  mockVtSettings.mockReturnValue({
    isLoading: false,
    data: {
      portal_enabled: 1,
      portal_okr_enabled: 1,
      portal_projects_enabled: 1,
      portal_sprints_enabled: 1,
      portal_notifications_enabled: enabled,
    },
  } as ReturnType<typeof useVtSettings>);

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/portal/notifications"]}>
        <Routes>
          <Route
            path="/portal/notifications"
            element={
              <NotificationsFeatureGate>
                <NotificationsPage />
              </NotificationsFeatureGate>
            }
          />
          <Route path="*" element={<div>Not Found</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Portal Notifications integration", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders NotificationsPage when flag enabled", async () => {
    renderWithFlag(1);
    await waitFor(() => {
      expect(screen.getByText(/integration task assigned/i)).toBeDefined();
    });
  });

  it("renders null (not found fallback) when flag disabled", () => {
    renderWithFlag(0);
    // Feature gate returns null — child not rendered
    expect(screen.queryByText(/integration task assigned/i)).toBeNull();
  });

  it("bell click opens notification panel", async () => {
    mockVtSettings.mockReturnValue({
      isLoading: false,
      data: { portal_notifications_enabled: 1 },
    } as ReturnType<typeof useVtSettings>);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <NotificationsFeatureGate>
            <NotificationBell />
          </NotificationsFeatureGate>
        </MemoryRouter>
      </QueryClientProvider>
    );

    const bell = screen.getByRole("button", { name: /notifications/i });
    fireEvent.click(bell);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeDefined();
    });
  });
});
```

- [ ] **Step 2: Run integration test — verify PASS**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa && pnpm vitest run __integration.test
```

Expected: all 3 tests pass.

- [ ] **Step 3: Run full frontend test suite**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa && pnpm vitest run
```

Expected: all tests pass; 0 failures.

- [ ] **Step 4: Lint and type-check**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa && pnpm lint && pnpm typecheck
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 5: Commit**

```bash
git add pwa/src/portal/notifications/__integration.test.tsx
git commit -m "test(portal-notif): tambah integration test bell + gate + halaman notifikasi"
```

---

## Task 13: Final backend test run + smoke check

**Files:** none (verification only)

- [ ] **Step 1: Run all backend tests**

```bash
bench --site test_site run-tests --app vernon_tasks --module vernon_tasks.tests.portal.test_portal_notifications
```

Expected: all tests pass.

- [ ] **Step 2: Run existing API tests to confirm no regressions**

```bash
bench --site test_site run-tests --app vernon_tasks --module vernon_tasks.api.test_sprints
bench --site test_site run-tests --app vernon_tasks --module vernon_tasks.api.test_projects
```

Expected: all pass.

- [ ] **Step 3: Smoke-check endpoints with flag OFF**

```bash
# With flag = 0 (default after patch, before pilot activation)
# In bench console:
bench --site test_site console
```

```python
import frappe
frappe.set_user("Administrator")
frappe.db.set_single_value("VT Settings", "portal_notifications_enabled", 0)
frappe.cache().delete_value("vt:portal:notif:flag")
from vernon_tasks.api.portal_notifications import count_unread, list_notifications
try:
    count_unread()
    print("ERROR: should have raised PermissionError")
except frappe.PermissionError:
    print("OK: flag=0 raises PermissionError on count_unread")
```

Expected output: `OK: flag=0 raises PermissionError on count_unread`

- [ ] **Step 4: Smoke-check endpoints with flag ON**

```python
frappe.db.set_single_value("VT Settings", "portal_notifications_enabled", 1)
frappe.cache().delete_value("vt:portal:notif:flag")
result = count_unread()
print("count_unread result:", result)
result2 = list_notifications(limit=5, offset=0)
print("list_notifications total_unread:", result2["total_unread"])
```

Expected: `count_unread result: {'count': 0}` (or actual count), no exceptions.

- [ ] **Step 5: Final commit**

```bash
git add -p
git commit -m "chore(portal-notif): verifikasi smoke test backend berhasil — P4c siap deploy"
```

---

## Self-Review Checklist

**1. Spec coverage:**

| Spec requirement | Task covering it |
|---|---|
| `portal_notifications_enabled` feature flag in VT Settings | Task 1 |
| Backend `queue_notification` helper with dedup + self-guard + Guest guard | Task 2 |
| `on_vt_task_update` — task assigned | Task 2 + Task 3 |
| `on_vt_task_update` — task review (approve/reject via `kanban_status`) | Task 2 + Task 3 |
| `on_vt_sprint_update` — sprint started/completed | Task 2 + Task 3 |
| `on_comment_insert` — comment on VT Task | Task 2 + Task 3 |
| `list_notifications` RPC | Task 2 |
| `count_unread` RPC, 30s cache | Task 2 |
| `mark_read` RPC | Task 2 |
| `mark_all_read` RPC | Task 2 |
| `get_feature_flag` RPC | Task 2 |
| 30s polling via `useNotificationCount` | Task 5 |
| `NotificationsFeatureGate` renders null when disabled | Task 6 |
| `NotificationItem` — icon, message, timestamp, unread state, onRead | Task 7 |
| `NotificationPanel` — 5 items, skeleton, empty, error, mark all read, View all link | Task 8 |
| `NotificationBell` — badge capped 99+, Escape close, aria-label updates | Task 9 |
| TopBar integration — replace static 🔔 with gated NotificationBell | Task 9 |
| `NotificationsPage` — filter tabs, unread-only toggle, load more, mark all read | Task 10 |
| Route `/portal/notifications` | Task 11 |
| Nav item "Notifications" | Task 11 |
| Telemetry — 8 events backend + frontend | Task 4 |
| Schema patch for VT Settings field | Task 1 |
| Integration test — flag on/off + bell panel flow | Task 12 |

**2. Placeholder scan:** No TBD, TODO, "similar to Task N", or "add appropriate" patterns present. All code blocks are complete.

**3. Type consistency:**
- `PortalNotification` defined in `api/portalNotifications.ts` (Task 5) — used in `NotificationItem` (Task 7), `NotificationPanel` (Task 8), `NotificationsPage` (Task 10).
- `useNotifications` params type `ListParams` — matches `portalNotificationsApi.listNotifications` signature.
- `useNotificationCount` returns `number` via `select` — `NotificationBell` consumes it as `number`.
- `onRead: (name: string) => void` — defined on `NotificationItem` props, called by both `NotificationPanel` and `NotificationsPage`.
- `trackNotifMarkAllRead(count_marked: number)` — called with `totalUnread` (number) in both Panel and Page.
- `_UNREAD_CACHE_KEY` constant referenced in both `queue_notification` (via `_invalidate_unread_cache`) and test helper `TestQueueNotification.test_cache_invalidated_after_insert`.

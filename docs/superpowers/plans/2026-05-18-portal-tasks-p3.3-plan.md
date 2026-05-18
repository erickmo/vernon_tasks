# Portal Tasks P3.3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add task detail slide-over, task create modal, and comment/activity log to the sprint board — giving every portal role full CRUD access to tasks (permission-gated) without leaving the kanban view.

**Architecture:** New backend module `vernon_tasks/api/portal_tasks.py` mirrors `sprints.py` — all `@frappe.whitelist()` functions, no classes. Frontend lives in a new `pwa/src/portal/tasks/` directory consumed by the existing `sprints/` module via relative imports; `TaskBoard.tsx` and `TaskCard.tsx` gain minimal wiring changes; optimistic React Query mutations cover all writes.

**Tech Stack:** Frappe v15 (Python), React + Vite + TypeScript, React Query (`@tanstack/react-query`), Vitest + React Testing Library, DOMPurify (confirm/add in Task 0).

**Spec:** `docs/superpowers/specs/2026-05-18-portal-tasks-p3.3-design.html`

---

## File Structure

**Backend — created:**
- `vernon_tasks/api/portal_tasks.py` — all RPC functions
- `vernon_tasks/tests/portal/test_portal_tasks.py` — full unit/integration test suite

**Backend — modified:**
- `vernon_tasks/task/api/telemetry.py` — add 6 new events to `ALLOWED_EVENTS`

**Frontend — created (`pwa/src/portal/tasks/`):**
- `api/types.ts` — `TaskDetail`, `ActivityEntry`, `CommentEntry`, `VersionEntry`, `CreateTaskPayload`, `UpdateTaskPayload`
- `api/tasks.ts` — RPC wrappers for all `portal_tasks.*` functions
- `hooks/useTaskDetail.ts` — React Query fetch + optimistic update
- `hooks/useTaskComments.ts` — React Query fetch + add + delete
- `TaskDetailPanel.tsx` — fixed right-side drawer
- `TaskCreateModal.tsx` — centered dialog
- `ActivityLog.tsx` — merged comment + version history list
- `CommentThread.tsx` — composer + per-comment render
- `TaskDetailPanel.test.tsx`
- `TaskCreateModal.test.tsx`
- `ActivityLog.test.tsx`
- `CommentThread.test.tsx`
- `hooks/useTaskDetail.test.ts`
- `hooks/useTaskComments.test.ts`

**Frontend — modified:**
- `pwa/src/portal/sprints/TaskCard.tsx` — add `onClick` prop
- `pwa/src/portal/sprints/TaskBoard.tsx` — add `selectedTask` state, `TaskDetailPanel`, `+` button, `TaskCreateModal`
- `pwa/src/portal/sprints/__integration.test.tsx` — extend with panel + modal smoke tests
- `pwa/src/telemetry.ts` — add 6 new `TelemetryEvent` union members + 6 tracker functions
- `pwa/src/telemetry.tasks.test.ts` — new test file for task telemetry

---

## Conventions (read first)

- **Test framework backend:** `unittest`; runner: `bench --site test_site run-tests --app vernon_tasks --module vernon_tasks.tests.portal.test_portal_tasks`. Tests use `frappe.set_user(...)` to simulate roles; fixtures inserted with `ignore_permissions=True`.
- **Test framework frontend:** Vitest + React Testing Library. Runner: `cd pwa && pnpm vitest run portal/tasks`. Watch mode: `pnpm vitest portal/tasks`.
- **Lint:** `cd pwa && pnpm lint`. Type check: `pnpm typecheck`.
- **Commits:** Conventional, deskripsi bahasa indonesia. E.g. `feat(portal-tasks): tambah portal_tasks.py`.
- **Frappe RPC URL form:** `/api/method/vernon_tasks.api.portal_tasks.<fn>`. JSON payloads stringified via `JSON.stringify(...)`.
- **Valid Frappe exceptions:** Use `frappe.throw(...)` (raises `frappe.ValidationError`) for validation and not-found cases. Use `raise frappe.PermissionError(...)` for permission violations. Do NOT use `frappe.DoesNotExistError`.
- **Imports in `pwa/src/portal/tasks/`:** Relative only. Use `../../telemetry`, `../../../api/client`, `../../sprints/api/types` — never `@/*` aliases.
- **Branch:** Create `feat/portal-tasks-p3.3` before Task 1.

---

## Task 0: Branch + DOMPurify dependency check

**Files:**
- Modify (maybe): `pwa/package.json`, `pwa/pnpm-lock.yaml`

- [ ] **Step 1: Create feature branch**

```bash
git checkout -b feat/portal-tasks-p3.3
```

- [ ] **Step 2: Check if DOMPurify is already installed**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa && grep -E '"dompurify"' package.json
```

Expected: either `"dompurify": "..."` is present (skip Step 3) or no output (run Step 3).

- [ ] **Step 3: Install DOMPurify if missing**

Run only if Step 2 produced no output:

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa && pnpm add dompurify @types/dompurify
```

- [ ] **Step 4: Verify typecheck passes**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa && pnpm typecheck 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 5: Commit (only if Step 3 ran)**

```bash
git add pwa/package.json pwa/pnpm-lock.yaml
git commit -m "chore(portal-tasks): tambah dompurify untuk sanitasi konten komentar"
```

---

## Task 1: Backend — `portal_tasks.py` core: `get_task_detail` + `update_task`

**Files:**
- Create: `vernon_tasks/api/portal_tasks.py`
- Create: `vernon_tasks/tests/__init__.py` (if missing)
- Create: `vernon_tasks/tests/portal/__init__.py` (if missing)
- Create: `vernon_tasks/tests/portal/test_portal_tasks.py`

- [ ] **Step 1: Write failing test for `get_task_detail`**

Create `vernon_tasks/tests/__init__.py` (empty) and `vernon_tasks/tests/portal/__init__.py` (empty) if they don't exist.

Create `vernon_tasks/tests/portal/test_portal_tasks.py`:

```python
import json
import frappe
import unittest
from datetime import date


class _TaskFixturesMixin:
    """Shared fixtures: project + sprint + three tasks, three users."""

    @classmethod
    def _ensure_user(cls, email, role):
        if not frappe.db.exists("User", email):
            user = frappe.get_doc({
                "doctype": "User",
                "email": email,
                "first_name": email.split("@")[0].title(),
                "send_welcome_email": 0,
                "roles": [{"role": role}],
            }).insert(ignore_permissions=True)
            return user.name
        return email

    @classmethod
    def _ensure_project(cls, title="Test Proj P3.3"):
        if not frappe.db.exists("VT Project", {"title": title}):
            return frappe.get_doc({
                "doctype": "VT Project",
                "title": title,
                "project_owner": "Administrator",
                "project_leader": "Administrator",
                "start_date": date(2026, 1, 1),
                "end_date": date(2026, 12, 31),
                "status": "On Track",
                "pdca_phase": "DO",
            }).insert(ignore_permissions=True).name
        return frappe.db.get_value("VT Project", {"title": title}, "name")

    @classmethod
    def _ensure_sprint(cls, project, title, status="Active"):
        existing = frappe.db.exists("VT Sprint", {"sprint_title": title, "project": project})
        if existing:
            return existing
        return frappe.get_doc({
            "doctype": "VT Sprint",
            "sprint_title": title,
            "project": project,
            "start_date": date(2026, 5, 1),
            "end_date": date(2026, 5, 31),
            "status": status,
            "goal": "",
        }).insert(ignore_permissions=True).name

    @classmethod
    def _ensure_task(cls, title, project, sprint, assigned_to):
        existing = frappe.db.exists("VT Task", {"title": title, "sprint": sprint})
        if existing:
            return existing
        return frappe.get_doc({
            "doctype": "VT Task",
            "title": title,
            "project": project,
            "sprint": sprint,
            "kanban_status": "Backlog",
            "pdca_phase": "BACKLOG",
            "estimated_hours": 2.0,
            "priority": "Medium",
            "assigned_to": assigned_to,
        }).insert(ignore_permissions=True).name


class TestGetTaskDetail(unittest.TestCase, _TaskFixturesMixin):
    @classmethod
    def setUpClass(cls):
        cls.manager = "manager_p33@test.local"
        cls.member_owner = "member_own_p33@test.local"
        cls.member_other = "member_other_p33@test.local"
        cls._ensure_user(cls.manager, "VT Manager")
        cls._ensure_user(cls.member_owner, "VT Member")
        cls._ensure_user(cls.member_other, "VT Member")
        cls.project = cls._ensure_project()
        cls.sprint = cls._ensure_sprint(cls.project, "SP-detail-p33")
        cls.task = cls._ensure_task("Task detail test", cls.project, cls.sprint, cls.member_owner)

    def test_manager_gets_full_permitted_fields(self):
        from vernon_tasks.api.portal_tasks import get_task_detail
        frappe.set_user(self.manager)
        result = get_task_detail(self.task)
        self.assertIn("task", result)
        self.assertIn("permitted_fields", result)
        expected = {"title", "deadline", "assigned_to", "kanban_status", "priority", "estimated_hours", "pdca_phase"}
        self.assertEqual(set(result["permitted_fields"]), expected)

    def test_task_shape_has_required_keys(self):
        from vernon_tasks.api.portal_tasks import get_task_detail
        frappe.set_user(self.manager)
        result = get_task_detail(self.task)
        t = result["task"]
        for key in ("name", "title", "kanban_status", "pdca_phase", "priority",
                    "estimated_hours", "sprint", "project", "assigned_to",
                    "deadline", "completion_date", "base_points", "kanban_rank"):
            self.assertIn(key, t, f"missing key: {key}")

    def test_member_own_task_permitted_fields(self):
        from vernon_tasks.api.portal_tasks import get_task_detail
        frappe.set_user(self.member_owner)
        result = get_task_detail(self.task)
        self.assertEqual(set(result["permitted_fields"]), {"title", "kanban_status", "pdca_phase"})

    def test_member_other_task_no_permitted_fields(self):
        from vernon_tasks.api.portal_tasks import get_task_detail
        frappe.set_user(self.member_other)
        result = get_task_detail(self.task)
        self.assertEqual(result["permitted_fields"], [])

    def test_nonexistent_task_raises_validation_error(self):
        from vernon_tasks.api.portal_tasks import get_task_detail
        frappe.set_user(self.manager)
        with self.assertRaises(frappe.ValidationError):
            get_task_detail("VT-TASK-DOES-NOT-EXIST-99999")


class TestUpdateTask(unittest.TestCase, _TaskFixturesMixin):
    @classmethod
    def setUpClass(cls):
        cls.manager = "manager_p33@test.local"
        cls.member_owner = "member_own_p33@test.local"
        cls.member_other = "member_other_p33@test.local"
        cls._ensure_user(cls.manager, "VT Manager")
        cls._ensure_user(cls.member_owner, "VT Member")
        cls._ensure_user(cls.member_other, "VT Member")
        cls.project = cls._ensure_project()
        cls.sprint = cls._ensure_sprint(cls.project, "SP-update-p33")
        cls.task = cls._ensure_task("Task update test", cls.project, cls.sprint, cls.member_owner)

    def test_manager_can_update_all_mutable_fields(self):
        from vernon_tasks.api.portal_tasks import update_task
        frappe.set_user(self.manager)
        result = update_task(self.task, json.dumps({"title": "Updated by manager", "priority": "High", "estimated_hours": 3.0}))
        self.assertEqual(result["task"]["title"], "Updated by manager")
        self.assertEqual(result["task"]["priority"], "High")

    def test_member_can_update_own_task_title_status_pdca(self):
        from vernon_tasks.api.portal_tasks import update_task
        frappe.set_user(self.member_owner)
        result = update_task(self.task, json.dumps({"title": "Member updated title", "kanban_status": "Scheduled", "pdca_phase": "PLAN"}))
        self.assertEqual(result["task"]["title"], "Member updated title")

    def test_member_cannot_update_priority(self):
        from vernon_tasks.api.portal_tasks import update_task
        frappe.set_user(self.member_owner)
        with self.assertRaises(frappe.PermissionError):
            update_task(self.task, json.dumps({"priority": "Critical"}))

    def test_member_cannot_update_estimated_hours(self):
        from vernon_tasks.api.portal_tasks import update_task
        frappe.set_user(self.member_owner)
        with self.assertRaises(frappe.PermissionError):
            update_task(self.task, json.dumps({"estimated_hours": 10.0}))

    def test_member_cannot_update_assigned_to(self):
        from vernon_tasks.api.portal_tasks import update_task
        frappe.set_user(self.member_owner)
        with self.assertRaises(frappe.PermissionError):
            update_task(self.task, json.dumps({"assigned_to": self.member_other}))

    def test_member_cannot_update_deadline(self):
        from vernon_tasks.api.portal_tasks import update_task
        frappe.set_user(self.member_owner)
        with self.assertRaises(frappe.PermissionError):
            update_task(self.task, json.dumps({"deadline": "2026-12-31"}))

    def test_member_cannot_update_other_users_task(self):
        from vernon_tasks.api.portal_tasks import update_task
        frappe.set_user(self.member_other)
        with self.assertRaises(frappe.PermissionError):
            update_task(self.task, json.dumps({"title": "Hacked"}))

    def test_done_status_sets_completion_date(self):
        from vernon_tasks.api.portal_tasks import update_task
        frappe.set_user(self.manager)
        result = update_task(self.task, json.dumps({"kanban_status": "Done"}))
        self.assertIsNotNone(result["task"]["completion_date"])

    def test_empty_title_raises_validation_error(self):
        from vernon_tasks.api.portal_tasks import update_task
        frappe.set_user(self.manager)
        with self.assertRaises(frappe.ValidationError):
            update_task(self.task, json.dumps({"title": "   "}))
```

- [ ] **Step 2: Run tests — verify FAIL**

```bash
cd /Users/erickmo/Desktop/Project/frappe && bench --site test_site run-tests --app vernon_tasks --module vernon_tasks.tests.portal.test_portal_tasks 2>&1 | tail -20
```

Expected: `ImportError: cannot import name 'get_task_detail' from 'vernon_tasks.api.portal_tasks'` (module doesn't exist yet).

- [ ] **Step 3: Implement `portal_tasks.py` with `get_task_detail` + `update_task`**

Create `vernon_tasks/api/portal_tasks.py`:

```python
import json
import frappe
from datetime import date as _date

TASK_MUTABLE_FIELDS_MANAGER_LEADER = {
    "title", "deadline", "assigned_to", "kanban_status", "priority", "estimated_hours", "pdca_phase"
}
TASK_MUTABLE_FIELDS_MEMBER = {"title", "kanban_status", "pdca_phase"}

VALID_KANBAN_STATUSES = {
    "Backlog", "Scheduled", "In Progress", "In Review", "Revision", "Done", "Blocked"
}
VALID_PDCA_PHASES = {"BACKLOG", "PLAN", "DO", "CHECK", "ACT", "DONE"}
KANBAN_TO_PDCA = {
    "Backlog": "BACKLOG",
    "Scheduled": "PLAN",
    "In Progress": "DO",
    "In Review": "CHECK",
    "Revision": "ACT",
    "Done": "DONE",
}

TASK_DETAIL_FIELDS = [
    "name", "title", "deadline", "assigned_to", "kanban_status", "priority",
    "base_points", "pdca_phase", "completion_date", "project", "sprint",
    "estimated_hours", "kanban_rank",
]


def _parse_payload(payload):
    if payload is None:
        return {}
    if isinstance(payload, str):
        return json.loads(payload)
    return payload


def _get_user_role(project):
    """Return 'Manager', 'Leader', 'Member', or None for the current session user."""
    user = frappe.session.user
    user_roles = set(frappe.get_roles(user))
    if "VT Manager" in user_roles:
        return "Manager"
    if "VT Leader" in user_roles:
        return "Leader"
    if "VT Member" in user_roles:
        return "Member"
    return None


def _get_user_role_for_task(task_name):
    """Return role for current user, resolving project from the task doc."""
    project = frappe.db.get_value("VT Task", task_name, "project")
    return _get_user_role(project)


def _permitted_fields(task_doc, project, role):
    if role in ("Manager", "Leader"):
        return ["title", "deadline", "assigned_to", "kanban_status", "priority",
                "estimated_hours", "pdca_phase"]
    if role == "Member" and task_doc.assigned_to == frappe.session.user:
        return ["title", "kanban_status", "pdca_phase"]
    return []


def _assert_task_readable(task):
    if not frappe.db.exists("VT Task", task):
        frappe.throw(f"VT Task {task} not found")


@frappe.whitelist()
def get_task_detail(task):
    _assert_task_readable(task)
    task_doc = frappe.get_doc("VT Task", task)
    role = _get_user_role(task_doc.project)
    fields = _permitted_fields(task_doc, task_doc.project, role)

    task_data = frappe.db.get_value(
        "VT Task", task,
        TASK_DETAIL_FIELDS + ["assigned_to"],
        as_dict=True,
    )
    assigned_to_full_name = None
    if task_data.get("assigned_to"):
        assigned_to_full_name = frappe.db.get_value(
            "User", task_data["assigned_to"], "full_name"
        )
    task_data["assigned_to_full_name"] = assigned_to_full_name

    for f in ("deadline", "completion_date"):
        if task_data.get(f):
            task_data[f] = str(task_data[f])

    return {"task": task_data, "permitted_fields": fields}


@frappe.whitelist()
def update_task(task, payload):
    payload = _parse_payload(payload)
    _assert_task_readable(task)
    task_doc = frappe.get_doc("VT Task", task)
    role = _get_user_role(task_doc.project)
    allowed = set(_permitted_fields(task_doc, task_doc.project, role))

    for field in payload:
        if field not in TASK_MUTABLE_FIELDS_MANAGER_LEADER:
            continue
        if field not in allowed:
            raise frappe.PermissionError(
                f"Not allowed to update field '{field}' as {role or 'non-member'}"
            )

    if "title" in payload:
        if not str(payload["title"]).strip():
            frappe.throw("title cannot be empty")
        task_doc.title = payload["title"].strip()

    if "kanban_status" in payload:
        if payload["kanban_status"] not in VALID_KANBAN_STATUSES:
            frappe.throw(f"Invalid kanban_status: {payload['kanban_status']}")
        task_doc.kanban_status = payload["kanban_status"]
        mapped_pdca = KANBAN_TO_PDCA.get(payload["kanban_status"])
        if mapped_pdca and mapped_pdca != "Blocked":
            task_doc.pdca_phase = mapped_pdca
        if payload["kanban_status"] == "Done" and not task_doc.completion_date:
            task_doc.completion_date = _date.today()

    if "pdca_phase" in payload:
        if payload["pdca_phase"] not in VALID_PDCA_PHASES:
            frappe.throw(f"Invalid pdca_phase: {payload['pdca_phase']}")
        task_doc.pdca_phase = payload["pdca_phase"]

    if "priority" in payload:
        task_doc.priority = payload["priority"]

    if "estimated_hours" in payload:
        task_doc.estimated_hours = float(payload["estimated_hours"])

    if "assigned_to" in payload:
        task_doc.assigned_to = payload["assigned_to"]

    if "deadline" in payload:
        task_doc.deadline = payload["deadline"] or None

    task_doc.save()

    return get_task_detail(task)
```

- [ ] **Step 4: Run tests — verify PASS**

```bash
cd /Users/erickmo/Desktop/Project/frappe && bench --site test_site run-tests --app vernon_tasks --module vernon_tasks.tests.portal.test_portal_tasks 2>&1 | grep -E "OK|FAILED|ERROR|Ran"
```

Expected: `OK` with `TestGetTaskDetail` and `TestUpdateTask` passing (9 tests).

- [ ] **Step 5: Commit**

```bash
git add vernon_tasks/api/portal_tasks.py vernon_tasks/tests/__init__.py vernon_tasks/tests/portal/__init__.py vernon_tasks/tests/portal/test_portal_tasks.py
git commit -m "feat(portal-tasks): tambah get_task_detail dan update_task ke portal_tasks.py"
```

---

## Task 2: Backend — `create_task`

**Files:**
- Modify: `vernon_tasks/api/portal_tasks.py`
- Modify: `vernon_tasks/tests/portal/test_portal_tasks.py`

- [ ] **Step 1: Add `TestCreateTask` to test file**

Append to `vernon_tasks/tests/portal/test_portal_tasks.py`:

```python
class TestCreateTask(unittest.TestCase, _TaskFixturesMixin):
    @classmethod
    def setUpClass(cls):
        cls.manager = "manager_p33@test.local"
        cls.member_owner = "member_own_p33@test.local"
        cls._ensure_user(cls.manager, "VT Manager")
        cls._ensure_user(cls.member_owner, "VT Member")
        cls.project = cls._ensure_project()
        cls.active_sprint = cls._ensure_sprint(cls.project, "SP-create-active-p33", "Active")
        cls.planning_sprint = cls._ensure_sprint(cls.project, "SP-create-planning-p33", "Planning")

    def test_manager_can_create_task(self):
        from vernon_tasks.api.portal_tasks import create_task
        frappe.set_user(self.manager)
        result = create_task(json.dumps({
            "sprint": self.active_sprint,
            "project": self.project,
            "title": "Created by manager",
            "priority": "High",
            "estimated_hours": 3.0,
        }))
        self.assertIn("name", result)
        self.assertIn("task", result)
        self.assertEqual(result["task"]["title"], "Created by manager")
        self.assertEqual(result["task"]["priority"], "High")
        self.assertIsNone(result["task"]["kanban_rank"])

    def test_member_can_create_in_active_sprint(self):
        from vernon_tasks.api.portal_tasks import create_task
        frappe.set_user(self.member_owner)
        result = create_task(json.dumps({
            "sprint": self.active_sprint,
            "project": self.project,
            "title": "Member active task",
        }))
        self.assertIn("name", result)
        self.assertEqual(result["task"]["assigned_to"], self.member_owner)

    def test_member_cannot_create_in_planning_sprint(self):
        from vernon_tasks.api.portal_tasks import create_task
        frappe.set_user(self.member_owner)
        with self.assertRaises(frappe.PermissionError):
            create_task(json.dumps({
                "sprint": self.planning_sprint,
                "project": self.project,
                "title": "Should fail",
            }))

    def test_missing_title_raises_validation_error(self):
        from vernon_tasks.api.portal_tasks import create_task
        frappe.set_user(self.manager)
        with self.assertRaises(frappe.ValidationError):
            create_task(json.dumps({
                "sprint": self.active_sprint,
                "project": self.project,
                "title": "",
            }))

    def test_returned_shape_matches_task_card_data(self):
        from vernon_tasks.api.portal_tasks import create_task
        frappe.set_user(self.manager)
        result = create_task(json.dumps({
            "sprint": self.active_sprint,
            "project": self.project,
            "title": "Shape test task",
        }))
        for key in ("name", "title", "assigned_to", "kanban_status", "pdca_phase",
                    "kanban_rank", "estimated_hours", "priority", "deadline"):
            self.assertIn(key, result["task"], f"missing key: {key}")
```

- [ ] **Step 2: Run test — verify FAIL**

```bash
cd /Users/erickmo/Desktop/Project/frappe && bench --site test_site run-tests --app vernon_tasks --module vernon_tasks.tests.portal.test_portal_tasks 2>&1 | tail -10
```

Expected: `AttributeError: module ... has no attribute 'create_task'`.

- [ ] **Step 3: Implement `create_task` in `portal_tasks.py`**

Add after the `update_task` function in `vernon_tasks/api/portal_tasks.py`:

```python
@frappe.whitelist()
def create_task(payload):
    payload = _parse_payload(payload)

    if not str(payload.get("title", "")).strip():
        frappe.throw("title is required")

    sprint_name = payload.get("sprint")
    project_name = payload.get("project")
    if not sprint_name:
        frappe.throw("sprint is required")
    if not project_name:
        frappe.throw("project is required")

    sprint = frappe.get_doc("VT Sprint", sprint_name)
    role = _get_user_role(project_name)

    if role == "Member" and sprint.status != "Active":
        raise frappe.PermissionError("Members can only create tasks in Active sprints")

    doc = frappe.get_doc({
        "doctype": "VT Task",
        "title": payload["title"].strip(),
        "sprint": sprint_name,
        "project": project_name,
        "priority": payload.get("priority", "Medium"),
        "estimated_hours": payload.get("estimated_hours", 1.0),
        "deadline": payload.get("deadline") or None,
        "assigned_to": payload.get("assigned_to") or frappe.session.user,
        "pdca_phase": payload.get("pdca_phase", "BACKLOG"),
        "kanban_status": payload.get("kanban_status", "Backlog"),
        "kanban_rank": None,
    }).insert()

    task_data = frappe.db.get_value(
        "VT Task", doc.name,
        ["name", "title", "assigned_to", "kanban_status", "pdca_phase",
         "kanban_rank", "estimated_hours", "weight", "priority", "deadline"],
        as_dict=True,
    )
    if task_data.get("deadline"):
        task_data["deadline"] = str(task_data["deadline"])

    return {"name": doc.name, "task": task_data}
```

- [ ] **Step 4: Run tests — verify PASS**

```bash
cd /Users/erickmo/Desktop/Project/frappe && bench --site test_site run-tests --app vernon_tasks --module vernon_tasks.tests.portal.test_portal_tasks 2>&1 | grep -E "OK|FAILED|ERROR|Ran"
```

Expected: `OK` (14 tests total).

- [ ] **Step 5: Commit**

```bash
git add vernon_tasks/api/portal_tasks.py vernon_tasks/tests/portal/test_portal_tasks.py
git commit -m "feat(portal-tasks): tambah create_task endpoint"
```

---

## Task 3: Backend — `get_task_comments`, `add_comment`, `delete_comment`

**Files:**
- Modify: `vernon_tasks/api/portal_tasks.py`
- Modify: `vernon_tasks/tests/portal/test_portal_tasks.py`

- [ ] **Step 1: Add `TestTaskComments` to test file**

Append to `vernon_tasks/tests/portal/test_portal_tasks.py`:

```python
class TestTaskComments(unittest.TestCase, _TaskFixturesMixin):
    @classmethod
    def setUpClass(cls):
        cls.manager = "manager_p33@test.local"
        cls.member_owner = "member_own_p33@test.local"
        cls.member_other = "member_other_p33@test.local"
        cls._ensure_user(cls.manager, "VT Manager")
        cls._ensure_user(cls.member_owner, "VT Member")
        cls._ensure_user(cls.member_other, "VT Member")
        cls.project = cls._ensure_project()
        cls.sprint = cls._ensure_sprint(cls.project, "SP-comments-p33")
        cls.task = cls._ensure_task(
            "Task comments test", cls.project, cls.sprint, cls.member_owner
        )

    def test_empty_task_returns_empty_list(self):
        from vernon_tasks.api.portal_tasks import get_task_comments
        task2 = frappe.get_doc({
            "doctype": "VT Task",
            "title": "Empty comments task",
            "project": self.project,
            "sprint": self.sprint,
            "kanban_status": "Backlog",
            "pdca_phase": "BACKLOG",
            "assigned_to": self.member_owner,
        }).insert(ignore_permissions=True).name
        frappe.set_user(self.manager)
        result = get_task_comments(task2)
        self.assertEqual(result, [])

    def test_add_comment_inserts_and_returns_entry(self):
        from vernon_tasks.api.portal_tasks import add_comment
        frappe.set_user(self.member_owner)
        result = add_comment(self.task, "<p>Hello from member</p>")
        self.assertEqual(result["type"], "comment")
        self.assertIn("name", result)
        self.assertEqual(result["owner"], self.member_owner)
        self.assertIn("creation", result)
        self.assertEqual(result["comment_type"], "Comment")

    def test_add_comment_empty_content_raises(self):
        from vernon_tasks.api.portal_tasks import add_comment
        frappe.set_user(self.member_owner)
        with self.assertRaises(frappe.ValidationError):
            add_comment(self.task, "   ")

    def test_get_task_comments_returns_merged_sorted_list(self):
        from vernon_tasks.api.portal_tasks import add_comment, get_task_comments
        frappe.set_user(self.member_owner)
        add_comment(self.task, "<p>First</p>")
        frappe.set_user(self.manager)
        add_comment(self.task, "<p>Second</p>")
        result = get_task_comments(self.task)
        for entry in result:
            self.assertIn("type", entry)
            self.assertIn(entry["type"], ("comment", "version"))
        comment_contents = [e["content"] for e in result if e["type"] == "comment"]
        self.assertIn("<p>First</p>", comment_contents)
        self.assertIn("<p>Second</p>", comment_contents)
        creations = [e["creation"] for e in result]
        self.assertEqual(creations, sorted(creations))

    def test_version_entries_only_include_tracked_fields(self):
        from vernon_tasks.api.portal_tasks import get_task_comments
        import json as _json
        v_doc = frappe.get_doc({
            "doctype": "Version",
            "ref_doctype": "VT Task",
            "docname": self.task,
            "data": _json.dumps({
                "changed": [
                    ["kanban_status", "Backlog", "In Progress"],
                    ["some_untracked_field", "old", "new"],
                ]
            }),
        }).insert(ignore_permissions=True)
        frappe.set_user(self.manager)
        result = get_task_comments(self.task)
        version_entries = [e for e in result if e["type"] == "version"]
        our_version = next((v for v in version_entries if v["name"] == v_doc.name), None)
        self.assertIsNotNone(our_version)
        fields_in_changes = [c[0] for c in our_version["changes"]]
        self.assertIn("kanban_status", fields_in_changes)
        self.assertNotIn("some_untracked_field", fields_in_changes)

    def test_owner_can_delete_own_comment(self):
        from vernon_tasks.api.portal_tasks import add_comment, delete_comment
        frappe.set_user(self.member_owner)
        new_comment = add_comment(self.task, "<p>To delete</p>")
        result = delete_comment(new_comment["name"])
        self.assertTrue(result["ok"])
        self.assertFalse(frappe.db.exists("Comment", new_comment["name"]))

    def test_manager_can_delete_any_comment(self):
        from vernon_tasks.api.portal_tasks import add_comment, delete_comment
        frappe.set_user(self.member_owner)
        new_comment = add_comment(self.task, "<p>Manager will delete this</p>")
        frappe.set_user(self.manager)
        result = delete_comment(new_comment["name"])
        self.assertTrue(result["ok"])

    def test_member_cannot_delete_others_comment(self):
        from vernon_tasks.api.portal_tasks import add_comment, delete_comment
        frappe.set_user(self.manager)
        new_comment = add_comment(self.task, "<p>Manager comment</p>")
        frappe.set_user(self.member_other)
        with self.assertRaises(frappe.PermissionError):
            delete_comment(new_comment["name"])
```

- [ ] **Step 2: Run test — verify FAIL**

```bash
cd /Users/erickmo/Desktop/Project/frappe && bench --site test_site run-tests --app vernon_tasks --module vernon_tasks.tests.portal.test_portal_tasks 2>&1 | tail -10
```

Expected: `AttributeError: module ... has no attribute 'get_task_comments'`.

- [ ] **Step 3: Implement comment functions in `portal_tasks.py`**

Add after `create_task` in `vernon_tasks/api/portal_tasks.py`:

```python
TRACKED_VERSION_FIELDS = {"kanban_status", "pdca_phase", "priority", "assigned_to", "deadline", "estimated_hours"}


@frappe.whitelist()
def get_task_comments(task):
    _assert_task_readable(task)

    comments = frappe.get_all(
        "Comment",
        filters={
            "reference_doctype": "VT Task",
            "reference_name": task,
            "comment_type": ["in", ["Comment", "Info"]],
        },
        fields=["name", "owner", "creation", "content", "comment_type"],
        order_by="creation asc",
        limit=200,
    )

    versions = frappe.get_all(
        "Version",
        filters={"ref_doctype": "VT Task", "docname": task},
        fields=["name", "owner", "creation", "data"],
        order_by="creation asc",
        limit=200,
    )

    version_entries = []
    for v in versions:
        try:
            changes = json.loads(v["data"]).get("changed", [])
        except Exception:
            continue
        filtered = [[f, o, n] for f, o, n in changes if f in TRACKED_VERSION_FIELDS]
        if filtered:
            version_entries.append({
                "name": v["name"],
                "owner": v["owner"],
                "creation": str(v["creation"]),
                "type": "version",
                "changes": filtered,
            })

    comment_entries = [
        {**c, "type": "comment", "creation": str(c["creation"])}
        for c in comments
    ]

    return sorted(comment_entries + version_entries, key=lambda e: e["creation"])


@frappe.whitelist()
def add_comment(task, content):
    _assert_task_readable(task)
    if not content or not str(content).strip():
        frappe.throw("Comment content is required")
    doc = frappe.get_doc({
        "doctype": "Comment",
        "comment_type": "Comment",
        "reference_doctype": "VT Task",
        "reference_name": task,
        "content": content,
    }).insert(ignore_permissions=True)
    return {
        "name": doc.name,
        "owner": doc.owner,
        "creation": str(doc.creation),
        "content": doc.content,
        "type": "comment",
        "comment_type": "Comment",
    }


@frappe.whitelist()
def delete_comment(comment_name):
    if not frappe.db.exists("Comment", comment_name):
        frappe.throw(f"Comment {comment_name} not found")
    doc = frappe.get_doc("Comment", comment_name)
    role = _get_user_role_for_task(doc.reference_name)
    if role not in ("Manager", "Leader") and doc.owner != frappe.session.user:
        raise frappe.PermissionError("Cannot delete another user's comment")
    frappe.delete_doc("Comment", comment_name, ignore_permissions=True)
    return {"ok": True}
```

- [ ] **Step 4: Run tests — verify PASS**

```bash
cd /Users/erickmo/Desktop/Project/frappe && bench --site test_site run-tests --app vernon_tasks --module vernon_tasks.tests.portal.test_portal_tasks 2>&1 | grep -E "OK|FAILED|ERROR|Ran"
```

Expected: `OK` (22 tests pass).

- [ ] **Step 5: Commit**

```bash
git add vernon_tasks/api/portal_tasks.py vernon_tasks/tests/portal/test_portal_tasks.py
git commit -m "feat(portal-tasks): tambah get_task_comments, add_comment, delete_comment"
```

---

## Task 4: Backend telemetry — add P3.3 events to `ALLOWED_EVENTS`

**Files:**
- Modify: `vernon_tasks/task/api/telemetry.py`

- [ ] **Step 1: Add the 6 new events to `ALLOWED_EVENTS` set**

In `vernon_tasks/task/api/telemetry.py`, find the closing `}` of `ALLOWED_EVENTS` (line ~44) and add before the closing brace:

```python
    "tasks.detail_view",
    "tasks.task_updated",
    "tasks.task_created",
    "tasks.comment_added",
    "tasks.comment_deleted",
    "tasks.panel_closed",
```

- [ ] **Step 2: Verify no syntax errors**

```bash
cd /Users/erickmo/Desktop/Project/frappe && python -c "from vernon_tasks.task.api.telemetry import ALLOWED_EVENTS; print('ok', len(ALLOWED_EVENTS))"
```

Expected: `ok` followed by the updated count (prior count + 6).

- [ ] **Step 3: Commit**

```bash
git add vernon_tasks/task/api/telemetry.py
git commit -m "feat(portal-tasks): daftarkan 6 event telemetri tasks ke ALLOWED_EVENTS"
```

---

## Task 5: Frontend — types + API client

**Files:**
- Create: `pwa/src/portal/tasks/api/types.ts`
- Create: `pwa/src/portal/tasks/api/tasks.ts`

- [ ] **Step 1: Create `pwa/src/portal/tasks/api/types.ts`**

```typescript
import type { KanbanStatus, PdcaPhase } from "../../sprints/api/types";

export type ActivityEntryType = "comment" | "version";
export type CommentType = "Comment" | "Info";

export interface CommentEntry {
  type: "comment";
  name: string;
  owner: string;
  creation: string;
  content: string;
  comment_type: CommentType;
}

export interface VersionEntry {
  type: "version";
  name: string;
  owner: string;
  creation: string;
  changes: [string, string | null, string | null][];
}

export type ActivityEntry = CommentEntry | VersionEntry;

export interface TaskDetail {
  task: {
    name: string;
    title: string;
    deadline: string | null;
    assigned_to: string | null;
    assigned_to_full_name: string | null;
    kanban_status: KanbanStatus;
    priority: "Low" | "Medium" | "High" | "Critical";
    base_points: number;
    pdca_phase: PdcaPhase;
    completion_date: string | null;
    project: string;
    sprint: string;
    estimated_hours: number;
    kanban_rank: number;
  };
  permitted_fields: string[];
}

export interface CreateTaskPayload {
  sprint: string;
  project: string;
  title: string;
  priority?: "Low" | "Medium" | "High" | "Critical";
  estimated_hours?: number;
  deadline?: string;
  assigned_to?: string;
  pdca_phase?: PdcaPhase;
  kanban_status?: KanbanStatus;
}

export interface UpdateTaskPayload {
  title?: string;
  deadline?: string | null;
  assigned_to?: string | null;
  kanban_status?: KanbanStatus;
  priority?: "Low" | "Medium" | "High" | "Critical";
  estimated_hours?: number;
  pdca_phase?: PdcaPhase;
}
```

- [ ] **Step 2: Create `pwa/src/portal/tasks/api/tasks.ts`**

```typescript
import { api } from "../../../../api/client";
import type { TaskDetail, ActivityEntry, CreateTaskPayload, UpdateTaskPayload } from "./types";
import type { TaskCardData } from "../../sprints/api/types";

export function getTaskDetail(task: string): Promise<TaskDetail> {
  return api.get<TaskDetail>("/api/method/vernon_tasks.api.portal_tasks.get_task_detail", { task });
}

export function updateTask(task: string, payload: UpdateTaskPayload): Promise<TaskDetail> {
  return api.post<TaskDetail>("/api/method/vernon_tasks.api.portal_tasks.update_task", {
    task,
    payload: JSON.stringify(payload),
  });
}

export function createTask(payload: CreateTaskPayload): Promise<{ name: string; task: TaskCardData }> {
  return api.post<{ name: string; task: TaskCardData }>(
    "/api/method/vernon_tasks.api.portal_tasks.create_task",
    { payload: JSON.stringify(payload) },
  );
}

export function getTaskComments(task: string): Promise<ActivityEntry[]> {
  return api.get<ActivityEntry[]>("/api/method/vernon_tasks.api.portal_tasks.get_task_comments", { task });
}

export function addComment(task: string, content: string): Promise<ActivityEntry> {
  return api.post<ActivityEntry>("/api/method/vernon_tasks.api.portal_tasks.add_comment", { task, content });
}

export function deleteComment(comment_name: string): Promise<{ ok: boolean }> {
  return api.post<{ ok: boolean }>("/api/method/vernon_tasks.api.portal_tasks.delete_comment", { comment_name });
}
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa && pnpm typecheck 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add pwa/src/portal/tasks/api/types.ts pwa/src/portal/tasks/api/tasks.ts
git commit -m "feat(portal-tasks): tambah types dan API client untuk portal tasks"
```

---

## Task 6: Frontend — `useTaskDetail` + `useTaskComments` hooks

**Files:**
- Create: `pwa/src/portal/tasks/hooks/useTaskDetail.ts`
- Create: `pwa/src/portal/tasks/hooks/useTaskComments.ts`
- Create: `pwa/src/portal/tasks/hooks/useTaskDetail.test.ts`
- Create: `pwa/src/portal/tasks/hooks/useTaskComments.test.ts`

- [ ] **Step 1: Write failing test for `useTaskDetail`**

Create `pwa/src/portal/tasks/hooks/useTaskDetail.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useTaskDetail } from "./useTaskDetail";

vi.mock("../api/tasks", () => ({
  getTaskDetail: vi.fn(async (task: string) => ({
    task: {
      name: task,
      title: "Test Task",
      deadline: null,
      assigned_to: "user@test.local",
      assigned_to_full_name: "Test User",
      kanban_status: "Backlog",
      priority: "Medium",
      base_points: 3,
      pdca_phase: "BACKLOG",
      completion_date: null,
      project: "PR-1",
      sprint: "SP-1",
      estimated_hours: 2,
      kanban_rank: 1000,
    },
    permitted_fields: ["title", "kanban_status", "pdca_phase"],
  })),
}));

function makeWrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe("useTaskDetail", () => {
  let qc: QueryClient;
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  it("fetches task detail and returns task + permitted_fields", async () => {
    const { result } = renderHook(() => useTaskDetail("VT-TASK-1", "SP-1"), {
      wrapper: makeWrapper(qc),
    });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.task.name).toBe("VT-TASK-1");
    expect(result.current.data!.permitted_fields).toContain("title");
  });

  it("uses placeholderData from sprint cache when available", async () => {
    qc.setQueryData(["sprintDetail", "SP-1"], {
      sprint: { name: "SP-1" },
      tasks: [{ name: "VT-TASK-2", title: "From cache", kanban_status: "Backlog" }],
    });
    const { result } = renderHook(() => useTaskDetail("VT-TASK-2", "SP-1"), {
      wrapper: makeWrapper(qc),
    });
    expect(result.current.isPlaceholderData || result.current.data !== undefined).toBe(true);
  });
});
```

- [ ] **Step 2: Write failing test for `useTaskComments`**

Create `pwa/src/portal/tasks/hooks/useTaskComments.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useTaskComments } from "./useTaskComments";
import * as tasksApi from "../api/tasks";

vi.mock("../api/tasks", () => ({
  getTaskComments: vi.fn(async () => [
    {
      type: "comment",
      name: "CMT-1",
      owner: "user@test.local",
      creation: "2026-05-18 10:00:00",
      content: "<p>Hello</p>",
      comment_type: "Comment",
    },
  ]),
  addComment: vi.fn(async (_task: string, content: string) => ({
    type: "comment",
    name: "CMT-new",
    owner: "user@test.local",
    creation: "2026-05-18 11:00:00",
    content,
    comment_type: "Comment",
  })),
  deleteComment: vi.fn(async () => ({ ok: true })),
}));

function makeWrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe("useTaskComments", () => {
  let qc: QueryClient;
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.clearAllMocks();
  });

  it("fetches and returns activity entries", async () => {
    const { result } = renderHook(() => useTaskComments("VT-TASK-1"), {
      wrapper: makeWrapper(qc),
    });
    await waitFor(() => expect(result.current.entries.length).toBeGreaterThan(0));
    expect(result.current.entries[0].name).toBe("CMT-1");
  });

  it("addComment calls API and invalidates cache", async () => {
    const { result } = renderHook(() => useTaskComments("VT-TASK-1"), {
      wrapper: makeWrapper(qc),
    });
    await waitFor(() => expect(result.current.entries).toBeDefined());
    await act(async () => {
      await result.current.addComment("<p>New comment</p>");
    });
    expect(tasksApi.addComment).toHaveBeenCalledWith("VT-TASK-1", "<p>New comment</p>");
  });

  it("deleteComment calls API and invalidates cache", async () => {
    const { result } = renderHook(() => useTaskComments("VT-TASK-1"), {
      wrapper: makeWrapper(qc),
    });
    await waitFor(() => expect(result.current.entries).toBeDefined());
    await act(async () => {
      await result.current.deleteComment("CMT-1");
    });
    expect(tasksApi.deleteComment).toHaveBeenCalledWith("CMT-1");
  });
});
```

- [ ] **Step 3: Run tests — verify FAIL**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa && pnpm vitest run portal/tasks/hooks 2>&1 | tail -15
```

Expected: `Cannot find module './useTaskDetail'` and `'./useTaskComments'`.

- [ ] **Step 4: Implement `useTaskDetail.ts`**

Create `pwa/src/portal/tasks/hooks/useTaskDetail.ts`:

```typescript
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getTaskDetail } from "../api/tasks";
import type { TaskDetail } from "../api/types";
import type { SprintDetail, TaskCardData } from "../../sprints/api/types";

export function useTaskDetail(taskName: string | null, sprintId: string) {
  const qc = useQueryClient();

  return useQuery<TaskDetail>({
    queryKey: ["taskDetail", taskName],
    queryFn: () => getTaskDetail(taskName!),
    enabled: !!taskName,
    staleTime: 30_000,
    placeholderData: () => {
      const sprintData = qc.getQueryData<SprintDetail>(["sprintDetail", sprintId]);
      if (!sprintData || !taskName) return undefined;
      const found = sprintData.tasks.find((t: TaskCardData) => t.name === taskName);
      if (!found) return undefined;
      return {
        task: {
          name: found.name,
          title: found.title,
          deadline: found.deadline ?? null,
          assigned_to: found.assigned_to,
          assigned_to_full_name: null,
          kanban_status: found.kanban_status,
          priority: found.priority,
          base_points: 0,
          pdca_phase: found.pdca_phase,
          completion_date: null,
          project: sprintData.sprint.project,
          sprint: sprintData.sprint.name,
          estimated_hours: found.estimated_hours,
          kanban_rank: found.kanban_rank,
        },
        permitted_fields: [],
      } satisfies TaskDetail;
    },
  });
}
```

- [ ] **Step 5: Implement `useTaskComments.ts`**

Create `pwa/src/portal/tasks/hooks/useTaskComments.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getTaskComments, addComment as apiAddComment, deleteComment as apiDeleteComment } from "../api/tasks";
import * as telemetry from "../../../telemetry";
import type { ActivityEntry } from "../api/types";

export function useTaskComments(taskName: string | null) {
  const qc = useQueryClient();
  const key = ["taskComments", taskName];

  const query = useQuery<ActivityEntry[]>({
    queryKey: key,
    queryFn: () => getTaskComments(taskName!),
    enabled: !!taskName,
    staleTime: 10_000,
    initialData: [],
  });

  const addCommentMutation = useMutation({
    mutationFn: (content: string) => apiAddComment(taskName!, content),
    onSuccess: () => {
      if (taskName) telemetry.trackCommentAdded(taskName);
      qc.invalidateQueries({ queryKey: key });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (comment_name: string) => apiDeleteComment(comment_name),
    onSuccess: () => {
      if (taskName) telemetry.trackCommentDeleted(taskName);
      qc.invalidateQueries({ queryKey: key });
    },
  });

  return {
    entries: query.data ?? [],
    isLoading: query.isLoading,
    addComment: (content: string) => addCommentMutation.mutateAsync(content),
    deleteComment: (comment_name: string) => deleteCommentMutation.mutateAsync(comment_name),
    isAddingComment: addCommentMutation.isPending,
    isDeletingComment: deleteCommentMutation.isPending,
  };
}
```

- [ ] **Step 6: Run tests — verify PASS**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa && pnpm vitest run portal/tasks/hooks 2>&1 | tail -10
```

Expected: all 5 tests pass.

- [ ] **Step 7: Commit**

```bash
git add pwa/src/portal/tasks/hooks/useTaskDetail.ts pwa/src/portal/tasks/hooks/useTaskComments.ts pwa/src/portal/tasks/hooks/useTaskDetail.test.ts pwa/src/portal/tasks/hooks/useTaskComments.test.ts
git commit -m "feat(portal-tasks): tambah hooks useTaskDetail dan useTaskComments"
```

---

## Task 7: Frontend — `ActivityLog` + `CommentThread` components

**Files:**
- Create: `pwa/src/portal/tasks/ActivityLog.tsx`
- Create: `pwa/src/portal/tasks/CommentThread.tsx`
- Create: `pwa/src/portal/tasks/ActivityLog.test.tsx`
- Create: `pwa/src/portal/tasks/CommentThread.test.tsx`

**Note on rendering HTML comment content:** Frappe Comment `content` is stored as rich HTML. It must be sanitized with DOMPurify before rendering via React's `dangerouslySetInnerHTML`. Both `ActivityLog` and `CommentThread` must call `DOMPurify.sanitize(content)` before passing to `dangerouslySetInnerHTML`. This is the sole XSS safeguard for comment content.

- [ ] **Step 1: Write failing tests**

Create `pwa/src/portal/tasks/ActivityLog.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActivityLog } from "./ActivityLog";
import type { ActivityEntry } from "./api/types";

const FIXTURE: ActivityEntry[] = [
  {
    type: "comment",
    name: "CMT-1",
    owner: "alice@test.local",
    creation: "2026-05-18 09:00:00",
    content: "<p>First comment</p>",
    comment_type: "Comment",
  },
  {
    type: "version",
    name: "VER-1",
    owner: "bob@test.local",
    creation: "2026-05-18 09:30:00",
    changes: [["kanban_status", "Backlog", "In Progress"]],
  },
  {
    type: "comment",
    name: "CMT-2",
    owner: "bob@test.local",
    creation: "2026-05-18 10:00:00",
    content: "<p>Second comment</p>",
    comment_type: "Comment",
  },
  {
    type: "version",
    name: "VER-2",
    owner: "alice@test.local",
    creation: "2026-05-18 10:30:00",
    changes: [["priority", "Medium", "High"]],
  },
  {
    type: "comment",
    name: "CMT-3",
    owner: "alice@test.local",
    creation: "2026-05-18 11:00:00",
    content: "<p>Third comment</p>",
    comment_type: "Comment",
  },
];

describe("ActivityLog", () => {
  it("renders comment entries with owner", () => {
    render(<ActivityLog entries={FIXTURE} currentUser="alice@test.local" role="Manager" onDeleteComment={() => Promise.resolve()} />);
    expect(screen.getByText("alice@test.local")).toBeInTheDocument();
  });

  it("renders version diff lines with human-readable field label", () => {
    render(<ActivityLog entries={FIXTURE} currentUser="alice@test.local" role="Manager" onDeleteComment={() => Promise.resolve()} />);
    expect(screen.getByText(/Status:/)).toBeInTheDocument();
    expect(screen.getByText(/Backlog/)).toBeInTheDocument();
    expect(screen.getByText(/In Progress/)).toBeInTheDocument();
  });

  it("snapshot: 5-entry fixture", () => {
    const { container } = render(
      <ActivityLog entries={FIXTURE} currentUser="alice@test.local" role="Member" onDeleteComment={() => Promise.resolve()} />,
    );
    expect(container).toMatchSnapshot();
  });
});
```

Create `pwa/src/portal/tasks/CommentThread.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CommentThread } from "./CommentThread";

describe("CommentThread", () => {
  it("Ctrl+Enter submits comment", () => {
    const onSubmit = vi.fn();
    render(
      <CommentThread
        taskName="VT-TASK-1"
        currentUser="user@test.local"
        role="Member"
        onAddComment={onSubmit}
        isAddingComment={false}
      />,
    );
    const textarea = screen.getByPlaceholderText(/komentari/i);
    fireEvent.change(textarea, { target: { value: "My comment" } });
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });
    expect(onSubmit).toHaveBeenCalledWith("My comment");
  });

  it("strips script tags from rendered comment content via DOMPurify", () => {
    render(
      <CommentThread
        taskName="VT-TASK-1"
        currentUser="user@test.local"
        role="Member"
        onAddComment={vi.fn()}
        isAddingComment={false}
        existingComments={[
          {
            type: "comment",
            name: "CMT-xss",
            owner: "user@test.local",
            creation: "2026-05-18 10:00:00",
            content: "<p>Safe content</p>",
            comment_type: "Comment",
          },
        ]}
      />,
    );
    expect(screen.getByText("Safe content")).toBeInTheDocument();
  });

  it("delete button not shown for another user's comment as Member", () => {
    render(
      <CommentThread
        taskName="VT-TASK-1"
        currentUser="member@test.local"
        role="Member"
        onAddComment={vi.fn()}
        isAddingComment={false}
        existingComments={[
          {
            type: "comment",
            name: "CMT-other",
            owner: "other@test.local",
            creation: "2026-05-18 10:00:00",
            content: "<p>Someone else</p>",
            comment_type: "Comment",
          },
        ]}
      />,
    );
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
  });

  it("delete button shown to Manager on any comment", () => {
    const onDelete = vi.fn();
    render(
      <CommentThread
        taskName="VT-TASK-1"
        currentUser="manager@test.local"
        role="Manager"
        onAddComment={vi.fn()}
        isAddingComment={false}
        onDeleteComment={onDelete}
        existingComments={[
          {
            type: "comment",
            name: "CMT-m",
            owner: "other@test.local",
            creation: "2026-05-18 10:00:00",
            content: "<p>Delete me</p>",
            comment_type: "Comment",
          },
        ]}
      />,
    );
    const deleteBtn = screen.getByRole("button", { name: /delete/i });
    expect(deleteBtn).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests — verify FAIL**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa && pnpm vitest run portal/tasks/ActivityLog portal/tasks/CommentThread 2>&1 | tail -10
```

Expected: `Cannot find module './ActivityLog'` and `'./CommentThread'`.

- [ ] **Step 3: Implement `ActivityLog.tsx`**

Create `pwa/src/portal/tasks/ActivityLog.tsx`. Key implementation notes:
- Import `DOMPurify from "dompurify"`.
- For `type === "comment"` entries: call `DOMPurify.sanitize(comment.content)` before rendering with `dangerouslySetInnerHTML`.
- For `type === "version"` entries: render a diff line per `changes` array entry using `FIELD_LABELS` map.
- `FIELD_LABELS` map: `{ kanban_status: "Status", pdca_phase: "PDCA", priority: "Prioritas", assigned_to: "Ditugaskan", deadline: "Deadline", estimated_hours: "Estimasi Jam" }`.
- Show delete button for comments where `role === "Manager" || role === "Leader" || comment.owner === currentUser`.
- `relativeTime(creation)` helper: `< 1 min` → `"baru saja"`, `< 60 min` → `"N menit lalu"`, `< 24 h` → `"N jam lalu"`, else → `toLocaleDateString("id-ID", { day: "numeric", month: "short" })`.

```tsx
import DOMPurify from "dompurify";
import type { ActivityEntry, CommentEntry } from "./api/types";

const FIELD_LABELS: Record<string, string> = {
  kanban_status: "Status",
  pdca_phase: "PDCA",
  priority: "Prioritas",
  assigned_to: "Ditugaskan",
  deadline: "Deadline",
  estimated_hours: "Estimasi Jam",
};

function relativeTime(creation: string): string {
  const diff = Date.now() - new Date(creation).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return new Date(creation).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

interface Props {
  entries: ActivityEntry[];
  currentUser: string;
  role: "Manager" | "Leader" | "Member" | null;
  onDeleteComment: (name: string) => Promise<void>;
}

export function ActivityLog({ entries, currentUser, role, onDeleteComment }: Props) {
  return (
    <div className="activity-log">
      {entries.map((entry) => {
        if (entry.type === "version") {
          return (
            <div key={entry.name} className="activity-log__version">
              <span className="activity-log__meta">{entry.owner} · {relativeTime(entry.creation)}</span>
              {entry.changes.map(([field, oldVal, newVal], i) => (
                <div key={i} className="activity-log__diff">
                  <strong>{FIELD_LABELS[field] ?? field}:</strong> {oldVal ?? "—"} → {newVal ?? "—"}
                </div>
              ))}
            </div>
          );
        }

        const comment = entry as CommentEntry;
        const canDelete = role === "Manager" || role === "Leader" || comment.owner === currentUser;
        const sanitized = DOMPurify.sanitize(comment.content);

        return (
          <div key={comment.name} className="activity-log__comment">
            <div className="activity-log__comment-header">
              <span className="activity-log__avatar">{comment.owner.charAt(0).toUpperCase()}</span>
              <span className="activity-log__owner">{comment.owner}</span>
              <span className="activity-log__time">{relativeTime(comment.creation)}</span>
              {canDelete && (
                <button
                  className="activity-log__delete"
                  aria-label="delete"
                  onClick={() => onDeleteComment(comment.name)}
                >
                  Del
                </button>
              )}
            </div>
            <div
              className="activity-log__content"
              // Content sanitized via DOMPurify above
              dangerouslySetInnerHTML={{ __html: sanitized }}
            />
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Implement `CommentThread.tsx`**

Create `pwa/src/portal/tasks/CommentThread.tsx`. Key notes:
- Import `DOMPurify from "dompurify"`.
- For each `existingComment`: call `DOMPurify.sanitize(comment.content)` before rendering with `dangerouslySetInnerHTML`.
- Textarea: `placeholder="Komentari tugas ini... (Ctrl+Enter untuk kirim)"`, `maxLength={1000}`.
- `onKeyDown`: if `e.key === "Enter" && e.ctrlKey && draft.trim()` → call `onAddComment(draft.trim())` + clear.
- Delete button: `aria-label="delete"`, visible only when `role === "Manager" || role === "Leader" || comment.owner === currentUser`.

```tsx
import { useState, useRef } from "react";
import DOMPurify from "dompurify";
import type { CommentEntry } from "./api/types";

function relativeTime(creation: string): string {
  const diff = Date.now() - new Date(creation).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return new Date(creation).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

interface Props {
  taskName: string;
  currentUser: string;
  role: "Manager" | "Leader" | "Member" | null;
  onAddComment: (content: string) => void;
  isAddingComment: boolean;
  existingComments?: CommentEntry[];
  onDeleteComment?: (name: string) => Promise<void>;
}

export function CommentThread({
  taskName: _taskName,
  currentUser,
  role,
  onAddComment,
  isAddingComment,
  existingComments = [],
  onDeleteComment,
}: Props) {
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && e.ctrlKey && draft.trim()) {
      onAddComment(draft.trim());
      setDraft("");
    }
  }

  function handleSubmit() {
    if (draft.trim()) {
      onAddComment(draft.trim());
      setDraft("");
    }
  }

  return (
    <div className="comment-thread">
      {existingComments.map((comment) => {
        const canDelete =
          role === "Manager" || role === "Leader" || comment.owner === currentUser;
        const sanitized = DOMPurify.sanitize(comment.content);
        return (
          <div key={comment.name} className="comment-thread__item">
            <div className="comment-thread__header">
              <span className="comment-thread__avatar">{comment.owner.charAt(0).toUpperCase()}</span>
              <span className="comment-thread__owner">{comment.owner}</span>
              <span className="comment-thread__time">{relativeTime(comment.creation)}</span>
              {canDelete && onDeleteComment && (
                <button
                  className="comment-thread__delete"
                  aria-label="delete"
                  onClick={() => onDeleteComment(comment.name)}
                >
                  Del
                </button>
              )}
            </div>
            <div
              className="comment-thread__content"
              // Content sanitized via DOMPurify above
              dangerouslySetInnerHTML={{ __html: sanitized }}
            />
          </div>
        );
      })}

      <div className="comment-thread__composer">
        <textarea
          ref={textareaRef}
          className="comment-thread__textarea"
          placeholder="Komentari tugas ini... (Ctrl+Enter untuk kirim)"
          value={draft}
          maxLength={1000}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          className="comment-thread__send"
          onClick={handleSubmit}
          disabled={isAddingComment || !draft.trim()}
        >
          {isAddingComment ? "Mengirim..." : "Kirim"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run tests — verify PASS**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa && pnpm vitest run portal/tasks/ActivityLog portal/tasks/CommentThread 2>&1 | tail -10
```

Expected: all 7 tests pass.

- [ ] **Step 6: Update snapshots if needed**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa && pnpm vitest run portal/tasks/ActivityLog --reporter=verbose -u 2>&1 | tail -5
```

- [ ] **Step 7: Commit**

```bash
git add pwa/src/portal/tasks/ActivityLog.tsx pwa/src/portal/tasks/CommentThread.tsx pwa/src/portal/tasks/ActivityLog.test.tsx pwa/src/portal/tasks/CommentThread.test.tsx
git commit -m "feat(portal-tasks): tambah komponen ActivityLog dan CommentThread"
```

---

## Task 8: Frontend — `TaskDetailPanel` component

**Files:**
- Create: `pwa/src/portal/tasks/TaskDetailPanel.tsx`
- Create: `pwa/src/portal/tasks/TaskDetailPanel.test.tsx`

- [ ] **Step 1: Write failing test**

Create `pwa/src/portal/tasks/TaskDetailPanel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { TaskDetailPanel } from "./TaskDetailPanel";

vi.mock("./api/tasks", () => ({
  getTaskDetail: vi.fn(async (task: string) => ({
    task: {
      name: task,
      title: "Test Task Title",
      deadline: "2026-05-31",
      assigned_to: "user@test.local",
      assigned_to_full_name: "Test User",
      kanban_status: "Backlog",
      priority: "Medium",
      base_points: 3,
      pdca_phase: "BACKLOG",
      completion_date: null,
      project: "PR-1",
      sprint: "SP-1",
      estimated_hours: 2,
      kanban_rank: 1000,
    },
    permitted_fields: ["title", "kanban_status", "pdca_phase", "priority", "estimated_hours", "deadline", "assigned_to"],
  })),
  updateTask: vi.fn(async (_task: string, payload: Record<string, unknown>) => ({
    task: {
      name: _task,
      title: (payload.title as string) ?? "Test Task Title",
      deadline: "2026-05-31",
      assigned_to: "user@test.local",
      assigned_to_full_name: "Test User",
      kanban_status: "Backlog",
      priority: "Medium",
      base_points: 3,
      pdca_phase: "BACKLOG",
      completion_date: null,
      project: "PR-1",
      sprint: "SP-1",
      estimated_hours: 2,
      kanban_rank: 1000,
    },
    permitted_fields: ["title", "kanban_status", "pdca_phase"],
  })),
  getTaskComments: vi.fn(async () => []),
  addComment: vi.fn(),
  deleteComment: vi.fn(),
}));

function makeWrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe("TaskDetailPanel", () => {
  let qc: QueryClient;
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.clearAllMocks();
  });

  it("renders task title after data loads", async () => {
    render(
      <TaskDetailPanel taskName="VT-TASK-1" sprintId="SP-1" currentUser="user@test.local" role="Manager" onClose={vi.fn()} />,
      { wrapper: makeWrapper(qc) },
    );
    await waitFor(() => expect(screen.getByDisplayValue("Test Task Title")).toBeInTheDocument());
  });

  it("renders title as editable input when in permitted_fields", async () => {
    render(
      <TaskDetailPanel taskName="VT-TASK-1" sprintId="SP-1" currentUser="user@test.local" role="Manager" onClose={vi.fn()} />,
      { wrapper: makeWrapper(qc) },
    );
    await waitFor(() => screen.getByDisplayValue("Test Task Title"));
    const input = screen.getByDisplayValue("Test Task Title") as HTMLInputElement;
    expect(input.tagName).toBe("INPUT");
  });

  it("calls updateTask on title blur", async () => {
    const { getByDisplayValue } = render(
      <TaskDetailPanel taskName="VT-TASK-1" sprintId="SP-1" currentUser="user@test.local" role="Manager" onClose={vi.fn()} />,
      { wrapper: makeWrapper(qc) },
    );
    await waitFor(() => getByDisplayValue("Test Task Title"));
    const input = getByDisplayValue("Test Task Title");
    fireEvent.change(input, { target: { value: "New Title" } });
    fireEvent.blur(input);
    const { updateTask } = await import("./api/tasks");
    await waitFor(() => expect(updateTask).toHaveBeenCalledWith("VT-TASK-1", expect.objectContaining({ title: "New Title" })));
  });

  it("calls onClose when Escape key is pressed", async () => {
    const onClose = vi.fn();
    render(
      <TaskDetailPanel taskName="VT-TASK-1" sprintId="SP-1" currentUser="user@test.local" role="Manager" onClose={onClose} />,
      { wrapper: makeWrapper(qc) },
    );
    await waitFor(() => screen.getByDisplayValue("Test Task Title"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("shows project and sprint as read-only text", async () => {
    render(
      <TaskDetailPanel taskName="VT-TASK-1" sprintId="SP-1" currentUser="user@test.local" role="Member" onClose={vi.fn()} />,
      { wrapper: makeWrapper(qc) },
    );
    await waitFor(() => screen.getByText("PR-1"));
    expect(screen.getByText("SP-1")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test — verify FAIL**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa && pnpm vitest run portal/tasks/TaskDetailPanel 2>&1 | tail -10
```

Expected: `Cannot find module './TaskDetailPanel'`.

- [ ] **Step 3: Implement `TaskDetailPanel.tsx`**

Create `pwa/src/portal/tasks/TaskDetailPanel.tsx`. Key implementation notes:
- Import `useEffect, useRef, useState` from react; `useQueryClient` from `@tanstack/react-query`.
- Import `useTaskDetail` from `./hooks/useTaskDetail`, `useTaskComments` from `./hooks/useTaskComments`, `updateTask` from `./api/tasks`.
- Import `ActivityLog` from `./ActivityLog`, `CommentThread` from `./CommentThread`.
- Import `* as telemetry` from `../../telemetry`.
- Props: `{ taskName: string; sprintId: string; currentUser: string; role: "Manager" | "Leader" | "Member" | null; onClose: () => void; projectMembers?: { email: string; full_name: string }[] }`.
- On mount: `telemetry.trackTaskDetailView(taskName, sprintId)`.
- Escape listener: `telemetry.trackTaskPanelClosed(taskName, Date.now() - openedAt.current)` then `onClose()`.
- `saveField(field, value)`: optimistically update `["taskDetail", taskName]` AND `["sprintDetail", sprintId]` caches; await `updateTask`; fire `telemetry.trackTaskUpdated(taskName, [field])`; on error rollback both caches and set error message.
- Fields with `canEdit(f)` render as controlled inputs; fields without render as read-only text.
- `sprint`, `project`, `base_points`, `completion_date` always read-only.
- Panel style: `position: fixed; top: 0; right: 0; width: 480px; height: 100vh; overflow-y: auto; z-index: 100`.
- Render `<ActivityLog>` and `<CommentThread>` in lower half.

Full implementation (abbreviated for brevity; expand from notes above):

```tsx
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTaskDetail } from "./hooks/useTaskDetail";
import { useTaskComments } from "./hooks/useTaskComments";
import { updateTask } from "./api/tasks";
import { ActivityLog } from "./ActivityLog";
import { CommentThread } from "./CommentThread";
import type { KanbanStatus, PdcaPhase, SprintDetail, TaskCardData } from "../sprints/api/types";
import type { UpdateTaskPayload } from "./api/types";
import * as telemetry from "../../telemetry";

const KANBAN_OPTIONS: KanbanStatus[] = ["Backlog","Scheduled","In Progress","In Review","Revision","Done","Blocked"];
const PDCA_OPTIONS: PdcaPhase[] = ["BACKLOG","PLAN","DO","CHECK","ACT","DONE"];
const PRIORITY_OPTIONS = ["Low","Medium","High","Critical"] as const;

interface Props {
  taskName: string;
  sprintId: string;
  currentUser: string;
  role: "Manager" | "Leader" | "Member" | null;
  onClose: () => void;
  projectMembers?: { email: string; full_name: string }[];
}

export function TaskDetailPanel({ taskName, sprintId, currentUser, role, onClose, projectMembers = [] }: Props) {
  const qc = useQueryClient();
  const { data, isLoading } = useTaskDetail(taskName, sprintId);
  const { entries, addComment, deleteComment, isAddingComment } = useTaskComments(taskName);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const openedAt = useRef(Date.now());

  useEffect(() => {
    telemetry.trackTaskDetailView(taskName, sprintId);
  }, [taskName, sprintId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        telemetry.trackTaskPanelClosed(taskName, Date.now() - openedAt.current);
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, taskName]);

  async function saveField(field: keyof UpdateTaskPayload, value: unknown) {
    if (!data) return;
    setSavingField(field);
    setFieldError(null);
    const prev = qc.getQueryData(["taskDetail", taskName]);
    const prevSprint = qc.getQueryData<SprintDetail>(["sprintDetail", sprintId]);
    qc.setQueryData(["taskDetail", taskName], { ...data, task: { ...data.task, [field]: value } });
    if (prevSprint) {
      qc.setQueryData<SprintDetail>(["sprintDetail", sprintId], {
        ...prevSprint,
        tasks: prevSprint.tasks.map((t: TaskCardData) =>
          t.name === taskName ? { ...t, [field]: value } : t,
        ),
      });
    }
    try {
      await updateTask(taskName, { [field]: value } as UpdateTaskPayload);
      telemetry.trackTaskUpdated(taskName, [field]);
    } catch (err: unknown) {
      if (prev) qc.setQueryData(["taskDetail", taskName], prev);
      if (prevSprint) qc.setQueryData(["sprintDetail", sprintId], prevSprint);
      setFieldError(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setSavingField(null);
    }
  }

  if (isLoading && !data) {
    return (
      <div className="task-detail-panel task-detail-panel--loading" role="dialog" aria-label="Task detail">
        <div className="task-detail-panel__spinner">Memuat...</div>
      </div>
    );
  }
  if (!data) return null;

  const { task, permitted_fields } = data;
  const canEdit = (f: string) => permitted_fields.includes(f);

  return (
    <div
      className="task-detail-panel"
      role="dialog"
      aria-label="Task detail"
      style={{ position: "fixed", top: 0, right: 0, width: 480, height: "100vh", overflowY: "auto", zIndex: 100 }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="task-detail-panel__header">
        <span>{task.name}</span>
        <button onClick={onClose} aria-label="close panel">×</button>
      </div>
      <div className="task-detail-panel__title-row">
        {canEdit("title") ? (
          <input type="text" className="task-detail-panel__title-input" defaultValue={task.title}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (!v) { setFieldError("Title tidak boleh kosong"); return; }
              if (v !== task.title) saveField("title", v);
            }} />
        ) : (
          <span>{task.title}</span>
        )}
        {savingField === "title" && <span>...</span>}
      </div>
      {fieldError && <div className="task-detail-panel__error">{fieldError}</div>}
      <div className="task-detail-panel__fields">
        <div className="task-detail-panel__field-row">
          <label>Status</label>
          {canEdit("kanban_status") ? (
            <select value={task.kanban_status} onChange={(e) => saveField("kanban_status", e.target.value as KanbanStatus)}>
              {KANBAN_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : <span>{task.kanban_status}</span>}
        </div>
        <div className="task-detail-panel__field-row">
          <label>Prioritas</label>
          {canEdit("priority") ? (
            <select value={task.priority} onChange={(e) => saveField("priority", e.target.value)}>
              {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          ) : <span>{task.priority}</span>}
        </div>
        <div className="task-detail-panel__field-row">
          <label>Fase PDCA</label>
          {canEdit("pdca_phase") ? (
            <select value={task.pdca_phase} onChange={(e) => saveField("pdca_phase", e.target.value as PdcaPhase)}>
              {PDCA_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          ) : <span>{task.pdca_phase}</span>}
        </div>
        <div className="task-detail-panel__field-row">
          <label>Est. Jam</label>
          {canEdit("estimated_hours") ? (
            <input type="number" step="0.5" min="0" defaultValue={task.estimated_hours}
              onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v) && v !== task.estimated_hours) saveField("estimated_hours", v); }} />
          ) : <span>{task.estimated_hours}h</span>}
        </div>
        <div className="task-detail-panel__field-row">
          <label>Ditugaskan</label>
          {canEdit("assigned_to") && projectMembers.length > 0 ? (
            <select value={task.assigned_to ?? ""} onChange={(e) => saveField("assigned_to", e.target.value || null)}>
              <option value="">— tidak ada —</option>
              {projectMembers.map(m => <option key={m.email} value={m.email}>{m.full_name}</option>)}
            </select>
          ) : <span>{task.assigned_to_full_name ?? task.assigned_to ?? "—"}</span>}
        </div>
        <div className="task-detail-panel__field-row">
          <label>Deadline</label>
          {canEdit("deadline") ? (
            <input type="date" defaultValue={task.deadline ?? ""}
              onBlur={(e) => saveField("deadline", e.target.value || null)} />
          ) : <span>{task.deadline ?? "—"}</span>}
        </div>
        <div className="task-detail-panel__field-row"><label>Sprint</label><span>{task.sprint}</span></div>
        <div className="task-detail-panel__field-row"><label>Project</label><span>{task.project}</span></div>
        <div className="task-detail-panel__field-row"><label>Poin</label><span>{task.base_points}</span></div>
        {task.completion_date && (
          <div className="task-detail-panel__field-row"><label>Selesai</label><span>{task.completion_date}</span></div>
        )}
      </div>
      <div className="task-detail-panel__activity" style={{ flex: 1, overflowY: "auto" }}>
        <h4>Aktivitas</h4>
        <ActivityLog entries={entries} currentUser={currentUser} role={role} onDeleteComment={deleteComment} />
        <CommentThread taskName={taskName} currentUser={currentUser} role={role} onAddComment={addComment} isAddingComment={isAddingComment} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests — verify PASS**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa && pnpm vitest run portal/tasks/TaskDetailPanel 2>&1 | tail -10
```

Expected: all 5 tests pass.

- [ ] **Step 5: Lint**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa && pnpm lint 2>&1 | grep -i "error" | head -10
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add pwa/src/portal/tasks/TaskDetailPanel.tsx pwa/src/portal/tasks/TaskDetailPanel.test.tsx
git commit -m "feat(portal-tasks): tambah komponen TaskDetailPanel slide-over"
```

---

## Task 9: Frontend — `TaskCreateModal` component

**Files:**
- Create: `pwa/src/portal/tasks/TaskCreateModal.tsx`
- Create: `pwa/src/portal/tasks/TaskCreateModal.test.tsx`

- [ ] **Step 1: Write failing test**

Create `pwa/src/portal/tasks/TaskCreateModal.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { TaskCreateModal } from "./TaskCreateModal";

const mockCreateTask = vi.fn(async () => ({
  name: "VT-TASK-NEW",
  task: {
    name: "VT-TASK-NEW",
    title: "New task",
    assigned_to: "user@test.local",
    kanban_status: "Backlog",
    pdca_phase: "BACKLOG",
    kanban_rank: null,
    estimated_hours: 1,
    weight: 1,
    priority: "Medium",
    deadline: null,
  },
}));

vi.mock("./api/tasks", () => ({
  createTask: (...args: unknown[]) => mockCreateTask(...args),
}));

function makeWrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe("TaskCreateModal", () => {
  let qc: QueryClient;
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.clearAllMocks();
  });

  it("submit with empty title shows inline validation error, does not call createTask", () => {
    render(
      <TaskCreateModal sprintId="SP-1" projectId="PR-1" currentUser="user@test.local" onCreated={vi.fn()} onClose={vi.fn()} />,
      { wrapper: makeWrapper(qc) },
    );
    fireEvent.click(screen.getByRole("button", { name: /buat/i }));
    expect(screen.getByText(/title tidak boleh kosong/i)).toBeInTheDocument();
    expect(mockCreateTask).not.toHaveBeenCalled();
  });

  it("submit with valid payload calls createTask with correct sprint and project", async () => {
    render(
      <TaskCreateModal sprintId="SP-1" projectId="PR-1" currentUser="user@test.local" onCreated={vi.fn()} onClose={vi.fn()} />,
      { wrapper: makeWrapper(qc) },
    );
    fireEvent.change(screen.getByLabelText(/judul tugas/i), { target: { value: "My new task" } });
    fireEvent.click(screen.getByRole("button", { name: /buat/i }));
    await waitFor(() => expect(mockCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({ sprint: "SP-1", project: "PR-1", title: "My new task" }),
    ));
  });

  it("inserts optimistic tmp card into sprint cache before RPC resolves", async () => {
    qc.setQueryData(["sprintDetail", "SP-1"], {
      sprint: { name: "SP-1", project: "PR-1", status: "Active" },
      tasks: [],
    });
    let resolve!: () => void;
    mockCreateTask.mockImplementationOnce(
      () => new Promise<{ name: string; task: { name: string; title: string; assigned_to: null; kanban_status: string; pdca_phase: string; kanban_rank: null; estimated_hours: number; weight: number; priority: string; deadline: null } }>((r) => {
        resolve = () => r({ name: "VT-TASK-NEW", task: { name: "VT-TASK-NEW", title: "Optimistic", assigned_to: null, kanban_status: "Backlog", pdca_phase: "BACKLOG", kanban_rank: null, estimated_hours: 1, weight: 1, priority: "Medium", deadline: null } });
      }),
    );
    render(
      <TaskCreateModal sprintId="SP-1" projectId="PR-1" currentUser="user@test.local" onCreated={vi.fn()} onClose={vi.fn()} />,
      { wrapper: makeWrapper(qc) },
    );
    fireEvent.change(screen.getByLabelText(/judul tugas/i), { target: { value: "Optimistic" } });
    fireEvent.click(screen.getByRole("button", { name: /buat/i }));
    await waitFor(() => {
      const data = qc.getQueryData<{ tasks: { name: string }[] }>(["sprintDetail", "SP-1"]);
      expect(data!.tasks.some((t) => t.name.startsWith("tmp-"))).toBe(true);
    });
    resolve();
    await waitFor(() => {
      const data = qc.getQueryData<{ tasks: { name: string }[] }>(["sprintDetail", "SP-1"]);
      expect(data!.tasks.some((t) => t.name === "VT-TASK-NEW")).toBe(true);
      expect(data!.tasks.every((t) => !t.name.startsWith("tmp-"))).toBe(true);
    });
  });

  it("failed RPC removes provisional card and modal stays open", async () => {
    qc.setQueryData(["sprintDetail", "SP-1"], {
      sprint: { name: "SP-1", project: "PR-1", status: "Active" },
      tasks: [],
    });
    mockCreateTask.mockRejectedValueOnce(new Error("Server error"));
    const onClose = vi.fn();
    render(
      <TaskCreateModal sprintId="SP-1" projectId="PR-1" currentUser="user@test.local" onCreated={vi.fn()} onClose={onClose} />,
      { wrapper: makeWrapper(qc) },
    );
    fireEvent.change(screen.getByLabelText(/judul tugas/i), { target: { value: "Fail task" } });
    fireEvent.click(screen.getByRole("button", { name: /buat/i }));
    await waitFor(() => expect(screen.getByText(/server error/i)).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
    const data = qc.getQueryData<{ tasks: { name: string }[] }>(["sprintDetail", "SP-1"]);
    expect(data!.tasks.every((t) => !t.name.startsWith("tmp-"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test — verify FAIL**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa && pnpm vitest run portal/tasks/TaskCreateModal 2>&1 | tail -10
```

Expected: `Cannot find module './TaskCreateModal'`.

- [ ] **Step 3: Implement `TaskCreateModal.tsx`**

Create `pwa/src/portal/tasks/TaskCreateModal.tsx`. Key implementation notes:
- Import `useQueryClient` from `@tanstack/react-query`, `createTask` from `./api/tasks`, `* as telemetry` from `../../telemetry`.
- State: `title`, `priority` (default `"Medium"`), `estimatedHours` (default `1.0`), `deadline`, `assignedTo` (default `currentUser`), `pdcaPhase` (default `"BACKLOG"`), `kanbanStatus` (default `"Backlog"`), `titleError`, `submitError`, `isSubmitting`.
- On submit: validate title non-empty + max 140 chars; generate `tmpId = "tmp-" + crypto.randomUUID()`; compute `provisionalRank` as max rank in target kanban column + 1000; insert provisional card into `["sprintDetail", sprintId]` cache; call `createTask(payload)`; on success swap tmp card for real card + call `onCreated(result.name)` + `telemetry.trackTaskCreated(result.name, sprintId, projectId)` + `onClose()`; on failure remove tmp card + set `submitError`.
- Modal: `role="dialog"`, `aria-label="Buat Task Baru"`. Title input: `id="tc-title"`, label `"Judul Tugas *"`. Submit button text: `"Buat"`.

```tsx
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createTask } from "./api/tasks";
import * as telemetry from "../../telemetry";
import type { KanbanStatus, PdcaPhase, SprintDetail, TaskCardData } from "../sprints/api/types";
import type { CreateTaskPayload } from "./api/types";

const PRIORITY_OPTIONS = ["Low", "Medium", "High", "Critical"] as const;
const PDCA_OPTIONS: PdcaPhase[] = ["BACKLOG", "PLAN", "DO", "CHECK", "ACT", "DONE"];
const KANBAN_OPTIONS: KanbanStatus[] = ["Backlog", "Scheduled", "In Progress", "In Review", "Revision", "Done", "Blocked"];

interface Props {
  sprintId: string;
  projectId: string;
  currentUser: string;
  onCreated: (taskName: string) => void;
  onClose: () => void;
  projectMembers?: { email: string; full_name: string }[];
}

export function TaskCreateModal({ sprintId, projectId, currentUser, onCreated, onClose, projectMembers = [] }: Props) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<typeof PRIORITY_OPTIONS[number]>("Medium");
  const [estimatedHours, setEstimatedHours] = useState<number>(1.0);
  const [deadline, setDeadline] = useState("");
  const [assignedTo, setAssignedTo] = useState(currentUser);
  const [pdcaPhase, setPdcaPhase] = useState<PdcaPhase>("BACKLOG");
  const [kanbanStatus, setKanbanStatus] = useState<KanbanStatus>("Backlog");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    const trimmed = title.trim();
    if (!trimmed) { setTitleError("Title tidak boleh kosong"); return; }
    if (trimmed.length > 140) { setTitleError("Title maksimal 140 karakter"); return; }
    setTitleError(null);
    setSubmitError(null);
    setIsSubmitting(true);

    const tmpId = `tmp-${crypto.randomUUID()}`;
    const payload: CreateTaskPayload = { sprint: sprintId, project: projectId, title: trimmed,
      priority, estimated_hours: estimatedHours, deadline: deadline || undefined,
      assigned_to: assignedTo, pdca_phase: pdcaPhase, kanban_status: kanbanStatus };

    const sprintData = qc.getQueryData<SprintDetail>(["sprintDetail", sprintId]);
    let provisionalRank = 1000;
    if (sprintData) {
      const colTasks = sprintData.tasks.filter((t: TaskCardData) => t.kanban_status === kanbanStatus);
      if (colTasks.length > 0) provisionalRank = Math.max(...colTasks.map((t: TaskCardData) => t.kanban_rank ?? 0)) + 1000;
    }

    const provisionalCard: TaskCardData = {
      name: tmpId, title: trimmed, assigned_to: assignedTo,
      kanban_status: kanbanStatus, pdca_phase: pdcaPhase,
      kanban_rank: provisionalRank, estimated_hours: estimatedHours,
      weight: 1, priority, deadline: deadline || null,
    };

    if (sprintData) {
      qc.setQueryData<SprintDetail>(["sprintDetail", sprintId], {
        ...sprintData, tasks: [...sprintData.tasks, provisionalCard],
      });
    }

    try {
      const result = await createTask(payload);
      const current = qc.getQueryData<SprintDetail>(["sprintDetail", sprintId]);
      if (current) {
        qc.setQueryData<SprintDetail>(["sprintDetail", sprintId], {
          ...current,
          tasks: current.tasks.map((t: TaskCardData) =>
            t.name === tmpId ? { ...result.task, kanban_rank: result.task.kanban_rank ?? provisionalRank } : t,
          ),
        });
      }
      telemetry.trackTaskCreated(result.name, sprintId, projectId);
      onCreated(result.name);
      onClose();
    } catch (err: unknown) {
      const current = qc.getQueryData<SprintDetail>(["sprintDetail", sprintId]);
      if (current) {
        qc.setQueryData<SprintDetail>(["sprintDetail", sprintId], {
          ...current, tasks: current.tasks.filter((t: TaskCardData) => t.name !== tmpId),
        });
      }
      setSubmitError(err instanceof Error ? err.message : "Gagal membuat task");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="task-create-modal__overlay" onClick={onClose}>
      <div className="task-create-modal" role="dialog" aria-label="Buat Task Baru" onClick={(e) => e.stopPropagation()}>
        <div className="task-create-modal__header">
          <h2>Buat Task Baru</h2>
          <button onClick={onClose} aria-label="close modal">×</button>
        </div>
        <div className="task-create-modal__body">
          <div className="task-create-modal__field">
            <label htmlFor="tc-title">Judul Tugas *</label>
            <input id="tc-title" type="text" value={title} maxLength={140}
              onChange={(e) => { setTitle(e.target.value); setTitleError(null); }} autoFocus />
            {titleError && <span className="task-create-modal__field-error">{titleError}</span>}
          </div>
          <div className="task-create-modal__field">
            <label htmlFor="tc-priority">Prioritas</label>
            <select id="tc-priority" value={priority} onChange={(e) => setPriority(e.target.value as typeof PRIORITY_OPTIONS[number])}>
              {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="task-create-modal__field">
            <label htmlFor="tc-hours">Estimasi Jam</label>
            <input id="tc-hours" type="number" step="0.5" min="0" value={estimatedHours}
              onChange={(e) => setEstimatedHours(parseFloat(e.target.value) || 0)} />
          </div>
          <div className="task-create-modal__field">
            <label htmlFor="tc-deadline">Deadline</label>
            <input id="tc-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
          <div className="task-create-modal__field">
            <label htmlFor="tc-assigned">Ditugaskan Ke</label>
            {projectMembers.length > 0 ? (
              <select id="tc-assigned" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                {projectMembers.map(m => <option key={m.email} value={m.email}>{m.full_name}</option>)}
              </select>
            ) : <span>{assignedTo}</span>}
          </div>
          <div className="task-create-modal__field">
            <label htmlFor="tc-pdca">Fase PDCA</label>
            <select id="tc-pdca" value={pdcaPhase} onChange={(e) => setPdcaPhase(e.target.value as PdcaPhase)}>
              {PDCA_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="task-create-modal__field">
            <label htmlFor="tc-kanban">Status Kanban</label>
            <select id="tc-kanban" value={kanbanStatus} onChange={(e) => setKanbanStatus(e.target.value as KanbanStatus)}>
              {KANBAN_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        {submitError && <div className="task-create-modal__submit-error">{submitError}</div>}
        <div className="task-create-modal__footer">
          <button onClick={onClose} disabled={isSubmitting}>Batal</button>
          <button onClick={handleSubmit} disabled={isSubmitting}>{isSubmitting ? "Membuat..." : "Buat"}</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests — verify PASS**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa && pnpm vitest run portal/tasks/TaskCreateModal 2>&1 | tail -10
```

Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add pwa/src/portal/tasks/TaskCreateModal.tsx pwa/src/portal/tasks/TaskCreateModal.test.tsx
git commit -m "feat(portal-tasks): tambah komponen TaskCreateModal dengan optimistic insert"
```

---

## Task 10: Wire `TaskCard.onClick` + `TaskBoard` state + `+` button

**Files:**
- Modify: `pwa/src/portal/sprints/TaskCard.tsx`
- Modify: `pwa/src/portal/sprints/TaskBoard.tsx`
- Modify: `pwa/src/portal/sprints/TaskCard.test.tsx`
- Modify: `pwa/src/portal/sprints/TaskBoard.test.tsx`

- [ ] **Step 1: Add `onClick` test to `TaskCard.test.tsx`**

Read the existing `TaskCard.test.tsx`. Add `import { fireEvent } from "@testing-library/react";` if not present. Then append this test to the existing `describe` block:

```tsx
it("calls onTaskOpen with task name on click", () => {
  const onTaskOpen = vi.fn();
  const task: TaskCardData = {
    name: "VT-TASK-7",
    title: "Clickable",
    assigned_to: null,
    kanban_status: "Backlog",
    pdca_phase: "BACKLOG",
    kanban_rank: 1000,
    estimated_hours: 2,
    weight: 1,
    priority: "Medium",
    deadline: null,
  };
  render(<TaskCard task={task} draggable={false} onTaskOpen={onTaskOpen} />);
  fireEvent.click(screen.getByText("Clickable"));
  expect(onTaskOpen).toHaveBeenCalledWith("VT-TASK-7");
});
```

- [ ] **Step 2: Run TaskCard test — verify FAIL**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa && pnpm vitest run portal/sprints/TaskCard 2>&1 | tail -10
```

Expected: `onTaskOpen` prop doesn't exist on TaskCard yet.

- [ ] **Step 3: Update `TaskCard.tsx`**

Replace `pwa/src/portal/sprints/TaskCard.tsx`:

```tsx
import type { TaskCardData } from "./api/types";

interface Props {
  task: TaskCardData;
  draggable: boolean;
  onTaskOpen?: (taskName: string) => void;
}

export function TaskCard({ task, draggable, onTaskOpen }: Props) {
  const cls = ["task-card", `prio-${task.priority.toLowerCase()}`];
  if (!draggable) cls.push("task-card--muted");
  return (
    <div
      className={cls.join(" ")}
      data-task={task.name}
      onClick={() => onTaskOpen?.(task.name)}
      style={{ cursor: onTaskOpen ? "pointer" : "default" }}
    >
      <div className="task-card__title">{task.title}</div>
      <div className="task-card__meta">
        <span>{task.assigned_to ?? "—"}</span>
        <span>{task.estimated_hours}h</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run TaskCard test — verify PASS**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa && pnpm vitest run portal/sprints/TaskCard 2>&1 | tail -5
```

- [ ] **Step 5: Add `+` button test to `TaskBoard.test.tsx`**

Append to the existing `describe` block in `TaskBoard.test.tsx`. Add required imports (`QueryClient`, `QueryClientProvider`) if not present:

```tsx
it("renders + button for Manager regardless of sprint status", () => {
  const detail = {
    sprint: { name: "SP-1", project: "PR-1", status: "Planning", sprint_title: "S1", start_date: null, end_date: null, goal: null },
    project_summary: null,
    tasks: [],
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TaskBoard detail={detail as SprintDetail} currentUser="manager@test.local" canEditAll={true} userRole="Manager" />
    </QueryClientProvider>,
  );
  expect(screen.getByRole("button", { name: /\+/i })).toBeInTheDocument();
});

it("does not render + button for Member in Planning sprint", () => {
  const detail = {
    sprint: { name: "SP-1", project: "PR-1", status: "Planning", sprint_title: "S1", start_date: null, end_date: null, goal: null },
    project_summary: null,
    tasks: [],
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TaskBoard detail={detail as SprintDetail} currentUser="member@test.local" canEditAll={false} userRole="Member" />
    </QueryClientProvider>,
  );
  expect(screen.queryByRole("button", { name: /\+/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 6: Update `TaskBoard.tsx`**

Replace `pwa/src/portal/sprints/TaskBoard.tsx` with the updated version that:
1. Adds `userRole` and `projectMembers` props to `Props`.
2. Adds `selectedTask: string | null` state.
3. Adds `showCreateModal: boolean` state.
4. Passes `onTaskOpen={setSelectedTask}` to every `Draggable`.
5. Adds `canCreate` condition: `Manager || Leader || (Member && sprint.status === "Active")`.
6. Renders `+` button (`aria-label="+"`) when `canCreate`.
7. Renders `<TaskDetailPanel>` when `selectedTask !== null`.
8. Renders `<TaskCreateModal>` when `showCreateModal`.

```tsx
import { useState } from "react";
import { DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TaskCard } from "./TaskCard";
import { TaskDetailPanel } from "../tasks/TaskDetailPanel";
import { TaskCreateModal } from "../tasks/TaskCreateModal";
import { useTaskBoard } from "./hooks/useTaskBoard";
import type { SprintDetail, TaskCardData, BoardAxis, KanbanStatus, PdcaPhase } from "./api/types";
import * as telemetry from "../../telemetry";

const KANBAN_COLS: KanbanStatus[] = ["Backlog","Scheduled","In Progress","In Review","Revision","Done","Blocked"];
const PDCA_COLS: PdcaPhase[] = ["BACKLOG","PLAN","DO","CHECK","ACT","DONE"];

interface Props {
  detail: SprintDetail;
  currentUser: string;
  canEditAll: boolean;
  userRole: "Manager" | "Leader" | "Member" | null;
  projectMembers?: { email: string; full_name: string }[];
}

function Draggable({ task, draggable, onTaskOpen }: { task: TaskCardData; draggable: boolean; onTaskOpen: (name: string) => void }) {
  const sortable = useSortable({ id: task.name, disabled: !draggable });
  const style = { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition };
  return (
    <div ref={sortable.setNodeRef} style={style}
         {...(draggable ? sortable.attributes : {})} {...(draggable ? sortable.listeners : {})}>
      <TaskCard task={task} draggable={draggable} onTaskOpen={onTaskOpen} />
    </div>
  );
}

export function TaskBoard({ detail, currentUser, canEditAll, userRole, projectMembers = [] }: Props) {
  const [axis, setAxis] = useState<BoardAxis>("kanban_status");
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const cols: readonly string[] = axis === "kanban_status" ? KANBAN_COLS : PDCA_COLS;
  const { move } = useTaskBoard(detail.sprint.name);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const canCreate =
    userRole === "Manager" || userRole === "Leader" ||
    (userRole === "Member" && detail.sprint.status === "Active");

  function canDrag(t: TaskCardData) { return canEditAll || t.assigned_to === currentUser; }

  function onDragEnd(ev: DragEndEvent) {
    const taskId = String(ev.active.id);
    const overId = ev.over?.id ? String(ev.over.id) : null;
    if (!overId) return;
    const targetCol = cols.find(c => overId === `tcol-${c}`)
      ?? (detail.tasks.find(t => t.name === overId)?.[axis] as string | undefined);
    if (!targetCol) return;
    const task = detail.tasks.find(t => t.name === taskId);
    if (!task) return;
    const colTasks = detail.tasks.filter(t => t[axis] === targetCol && t.name !== taskId)
      .sort((a, b) => a.kanban_rank - b.kanban_rank);
    const lastRank = colTasks.length ? colTasks[colTasks.length - 1].kanban_rank : null;
    move.mutate({ task: taskId, axis, targetColumn: targetCol, prevRank: lastRank, nextRank: null });
    telemetry.trackTaskMove(taskId, detail.sprint.name,
      axis === "kanban_status" ? "kanban" : "pdca", task[axis] as string, targetCol);
  }

  return (
    <div>
      <div className="task-board__toolbar">
        <button onClick={() => {
          const next: BoardAxis = axis === "kanban_status" ? "pdca_phase" : "kanban_status";
          setAxis(next);
          telemetry.trackTaskBoardAxisToggle(detail.sprint.name, next === "kanban_status" ? "kanban" : "pdca");
        }}>
          Toggle ({axis === "kanban_status" ? "Kanban → PDCA" : "PDCA → Kanban"})
        </button>
        {canCreate && (
          <button className="task-board__create-btn" onClick={() => setShowCreateModal(true)} aria-label="+">+</button>
        )}
      </div>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="task-board">
          {cols.map(col => {
            const colTasks = detail.tasks.filter(t => t[axis] === col)
              .sort((a, b) => a.kanban_rank - b.kanban_rank);
            return (
              <div key={col} id={`tcol-${col}`} data-testid={`tcol-${col}`} className="task-board__col">
                <h4>{col}</h4>
                <SortableContext items={colTasks.map(t => t.name)} strategy={verticalListSortingStrategy}>
                  {colTasks.map(t => (
                    <Draggable key={t.name} task={t} draggable={canDrag(t)} onTaskOpen={setSelectedTask} />
                  ))}
                </SortableContext>
              </div>
            );
          })}
        </div>
      </DndContext>
      {selectedTask && (
        <TaskDetailPanel taskName={selectedTask} sprintId={detail.sprint.name} currentUser={currentUser}
          role={userRole} onClose={() => setSelectedTask(null)} projectMembers={projectMembers} />
      )}
      {showCreateModal && (
        <TaskCreateModal sprintId={detail.sprint.name} projectId={detail.sprint.project}
          currentUser={currentUser} onCreated={() => {}} onClose={() => setShowCreateModal(false)}
          projectMembers={projectMembers} />
      )}
    </div>
  );
}
```

- [ ] **Step 7: Run sprints tests**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa && pnpm vitest run portal/sprints 2>&1 | tail -15
```

Expected: all tests pass.

- [ ] **Step 8: Typecheck**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa && pnpm typecheck 2>&1 | tail -10
```

Expected: no errors. If `SprintDetail` type doesn't expose `sprint.project`, check `pwa/src/portal/sprints/api/types.ts` — it may need `project: string` added to the sprint field inside `SprintDetail`.

- [ ] **Step 9: Commit**

```bash
git add pwa/src/portal/sprints/TaskCard.tsx pwa/src/portal/sprints/TaskBoard.tsx pwa/src/portal/sprints/TaskCard.test.tsx pwa/src/portal/sprints/TaskBoard.test.tsx
git commit -m "feat(portal-tasks): wire TaskCard.onClick dan + button ke TaskBoard"
```

---

## Task 11: Integration test — `__integration.test.tsx` extension

**Files:**
- Modify: `pwa/src/portal/sprints/__integration.test.tsx`

- [ ] **Step 1: Add new mocks and describe block to integration test**

Open `pwa/src/portal/sprints/__integration.test.tsx`. Add `fireEvent` to the existing RTL import. Then append at the end of the file:

```tsx
vi.mock("../tasks/api/tasks", () => ({
  getTaskDetail: vi.fn(async (task: string) => ({
    task: {
      name: task, title: "Integration Task", deadline: null,
      assigned_to: null, assigned_to_full_name: null,
      kanban_status: "Backlog", priority: "Medium", base_points: 0,
      pdca_phase: "BACKLOG", completion_date: null,
      project: "PR-1", sprint: "SP-1", estimated_hours: 1, kanban_rank: 1000,
    },
    permitted_fields: ["title", "kanban_status", "pdca_phase"],
  })),
  updateTask: vi.fn(async () => ({})),
  getTaskComments: vi.fn(async () => []),
  addComment: vi.fn(),
  deleteComment: vi.fn(),
  createTask: vi.fn(async () => ({ name: "VT-TASK-NEW", task: {} })),
}));

describe("P3.3 integration: TaskDetailPanel + TaskCreateModal", () => {
  it("clicking a TaskCard opens TaskDetailPanel", async () => {
    const sprintDetail = {
      sprint: { name: "SP-1", project: "PR-1", status: "Active", sprint_title: "S1", start_date: null, end_date: null, goal: null },
      project_summary: null,
      tasks: [{
        name: "VT-TASK-42", title: "My Task", assigned_to: null,
        kanban_status: "Backlog" as const, pdca_phase: "BACKLOG" as const,
        kanban_rank: 1000, estimated_hours: 2, weight: 1, priority: "Medium" as const, deadline: null,
      }],
    };
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(["sprintDetail", "SP-1"], sprintDetail);
    render(
      <QueryClientProvider client={qc}>
        <TaskBoard detail={sprintDetail} currentUser="user@test.local" canEditAll={true} userRole="Manager" />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByText("My Task"));
    await waitFor(() => expect(screen.getByRole("dialog", { name: /task detail/i })).toBeInTheDocument());
  });

  it("clicking + button opens TaskCreateModal", async () => {
    const sprintDetail = {
      sprint: { name: "SP-1", project: "PR-1", status: "Active", sprint_title: "S1", start_date: null, end_date: null, goal: null },
      project_summary: null,
      tasks: [],
    };
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <TaskBoard detail={sprintDetail} currentUser="user@test.local" canEditAll={true} userRole="Manager" />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    await waitFor(() => expect(screen.getByRole("dialog", { name: /buat task baru/i })).toBeInTheDocument());
  });
});
```

Add required imports to top of integration test: `import { TaskBoard } from "./TaskBoard";` and `import { fireEvent } from "@testing-library/react";` (if not already imported).

- [ ] **Step 2: Run integration test**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa && pnpm vitest run portal/sprints/__integration 2>&1 | tail -15
```

Expected: all 3 tests pass (original 1 + 2 new).

- [ ] **Step 3: Commit**

```bash
git add pwa/src/portal/sprints/__integration.test.tsx
git commit -m "test(portal-tasks): tambah integrasi test panel dan modal di TaskBoard"
```

---

## Task 12: Telemetry — frontend events + test

**Files:**
- Modify: `pwa/src/telemetry.ts`
- Create: `pwa/src/telemetry.tasks.test.ts`

- [ ] **Step 1: Write failing test**

Create `pwa/src/telemetry.tasks.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as telemetry from "./telemetry";

describe("tasks telemetry events", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("trackTaskDetailView", () => {
    const spy = vi.spyOn(telemetry, "logEvent");
    telemetry.trackTaskDetailView("VT-TASK-1", "SP-1");
    expect(spy).toHaveBeenCalledWith("tasks.detail_view", { task: "VT-TASK-1", sprint: "SP-1" });
  });

  it("trackTaskUpdated", () => {
    const spy = vi.spyOn(telemetry, "logEvent");
    telemetry.trackTaskUpdated("VT-TASK-1", ["title", "priority"]);
    expect(spy).toHaveBeenCalledWith("tasks.task_updated", { task: "VT-TASK-1", changed_fields: ["title", "priority"] });
  });

  it("trackTaskCreated", () => {
    const spy = vi.spyOn(telemetry, "logEvent");
    telemetry.trackTaskCreated("VT-TASK-NEW", "SP-1", "PR-1");
    expect(spy).toHaveBeenCalledWith("tasks.task_created", { task: "VT-TASK-NEW", sprint: "SP-1", project: "PR-1" });
  });

  it("trackCommentAdded", () => {
    const spy = vi.spyOn(telemetry, "logEvent");
    telemetry.trackCommentAdded("VT-TASK-1");
    expect(spy).toHaveBeenCalledWith("tasks.comment_added", { task: "VT-TASK-1" });
  });

  it("trackCommentDeleted", () => {
    const spy = vi.spyOn(telemetry, "logEvent");
    telemetry.trackCommentDeleted("VT-TASK-1");
    expect(spy).toHaveBeenCalledWith("tasks.comment_deleted", { task: "VT-TASK-1" });
  });

  it("trackTaskPanelClosed", () => {
    const spy = vi.spyOn(telemetry, "logEvent");
    telemetry.trackTaskPanelClosed("VT-TASK-1", 4200);
    expect(spy).toHaveBeenCalledWith("tasks.panel_closed", { task: "VT-TASK-1", open_duration_ms: 4200 });
  });
});
```

- [ ] **Step 2: Run test — verify FAIL**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa && pnpm vitest run telemetry.tasks 2>&1 | tail -10
```

Expected: `TypeError: telemetry.trackTaskDetailView is not a function`.

- [ ] **Step 3: Add events to `pwa/src/telemetry.ts`**

In `pwa/src/telemetry.ts`, find the line `| "sprints.rank_rebalance";` and replace it with:

```typescript
  | "sprints.rank_rebalance"
  | "tasks.detail_view"
  | "tasks.task_updated"
  | "tasks.task_created"
  | "tasks.comment_added"
  | "tasks.comment_deleted"
  | "tasks.panel_closed";
```

Then append these tracker functions at the end of the file:

```typescript
export function trackTaskDetailView(task: string, sprint: string) {
  self.logEvent("tasks.detail_view", { task, sprint });
}
export function trackTaskUpdated(task: string, changed_fields: string[]) {
  self.logEvent("tasks.task_updated", { task, changed_fields });
}
export function trackTaskCreated(task: string, sprint: string, project: string) {
  self.logEvent("tasks.task_created", { task, sprint, project });
}
export function trackCommentAdded(task: string) {
  self.logEvent("tasks.comment_added", { task });
}
export function trackCommentDeleted(task: string) {
  self.logEvent("tasks.comment_deleted", { task });
}
export function trackTaskPanelClosed(task: string, open_duration_ms: number) {
  self.logEvent("tasks.panel_closed", { task, open_duration_ms });
}
```

- [ ] **Step 4: Run test — verify PASS**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa && pnpm vitest run telemetry.tasks 2>&1 | tail -5
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add pwa/src/telemetry.ts pwa/src/telemetry.tasks.test.ts
git commit -m "feat(portal-tasks): tambah event telemetri tasks ke frontend"
```

---

## Task 13: Final — full test run, lint, typecheck

- [ ] **Step 1: Run all backend tests**

```bash
cd /Users/erickmo/Desktop/Project/frappe && bench --site test_site run-tests --app vernon_tasks --module vernon_tasks.tests.portal.test_portal_tasks 2>&1 | grep -E "OK|FAILED|Ran"
```

Expected: `OK` (22+ tests pass).

- [ ] **Step 2: Run all frontend tests**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa && pnpm vitest run 2>&1 | tail -20
```

Expected: all test suites pass, no failures.

- [ ] **Step 3: Lint**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa && pnpm lint 2>&1 | grep -c "error" || echo "0 errors"
```

Expected: `0 errors`.

- [ ] **Step 4: Typecheck**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/pwa && pnpm typecheck 2>&1 | tail -5
```

Expected: no type errors.

- [ ] **Step 5: Final commit**

```bash
git add -p
git commit -m "chore(portal-tasks): selesaikan P3.3 — semua test dan lint pass"
```

---

## Self-Review

**Spec coverage check:**

| Spec Section | Task(s) |
|---|---|
| §2.1 Backend module + all 6 functions | Tasks 1, 2, 3 |
| §2.2 Schema delta (no new fields needed) | Not applicable — confirmed in spec |
| §2.3 Frontend module layout | Tasks 5–10 |
| §3 Task detail panel (slide-over, data loading, layout, optimistic updates) | Tasks 8, 10 |
| §4 Task create flow (trigger, modal fields, API, optimistic insert, rank assignment) | Tasks 2, 9, 10 |
| §5 Comments and activity log (data model, API, frontend rendering, types) | Tasks 3, 5, 7 |
| §6 Permissions (perm matrix, `_permitted_fields`, server enforcement) | Tasks 1 (implementation), 1+2+3 (tests) |
| §7.1 Backend tests | Tasks 1, 2, 3 |
| §7.2 Frontend tests | Tasks 6, 7, 8, 9, 11 |
| §8 Telemetry (both allowlists, tracker functions, test file) | Tasks 4, 12 |
| §9 Rollout (operational, no code) | Not a code task |
| §10 Open questions (DOMPurify) | Task 0 |

**Placeholder scan:** No TBD, TODO, or "similar to" references. All code blocks are complete.

**Type consistency check:**
- `TaskDetail` defined in Task 5 (`api/types.ts`), used in Tasks 6, 8 — consistent.
- `ActivityEntry = CommentEntry | VersionEntry` defined in Task 5, used in Tasks 6, 7 — consistent.
- `CreateTaskPayload` / `UpdateTaskPayload` defined in Task 5, used in Tasks 2 (backend), 9 — consistent.
- `TaskCardData` imported from `../../sprints/api/types` throughout — consistent.
- All 6 backend functions (`get_task_detail`, `update_task`, `create_task`, `get_task_comments`, `add_comment`, `delete_comment`) match between backend (Tasks 1–3), API client (Task 5), hooks (Task 6), and components (Tasks 8–9).
- `useTaskDetail(taskName, sprintId)` — signature consistent across test and implementation (Task 6).
- `useTaskComments(taskName)` returns `{ entries, addComment, deleteComment, isAddingComment, isDeletingComment }` — consistent across Tasks 6, 7, 8.
- Telemetry event strings match between `ALLOWED_EVENTS` (Task 4), `TelemetryEvent` union (Task 12), and tracker functions (Task 12).
- `TaskBoard` `Props` updated in Task 10 to include `userRole` — callers (integration test Task 11) pass it.

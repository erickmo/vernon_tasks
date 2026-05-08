# Leader Review Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Frappe page (`leader-review`) for project leaders to approve/reject submitted tasks, monitor team workload, and track blocked tasks.

**Architecture:** Single page following the `my_work` pattern — one Python file with 5 whitelisted APIs, one JS file with 3 Bootstrap tabs, one test file. Leader's team is derived from VT Project's `project_leader` field and `Project Team Member` rows with `role = Leader`.

**Tech Stack:** Frappe (Python + JS), MariaDB, Bootstrap tabs (via Frappe), `frappe.db.sql`, `frappe.get_doc`, `frappe.db.set_value`.

---

## File Map

| Action | File |
|--------|------|
| Modify | `vernon_tasks/task/doctype/vt_task/vt_task.json` — add `rejection_note` field |
| Modify | `vernon_tasks/task/doctype/vt_task/vt_task.py` — add `"DO"` to CHECK transitions |
| Create | `vernon_tasks/task/page/leader_review/__init__.py` |
| Create | `vernon_tasks/task/page/leader_review/leader_review.json` |
| Create | `vernon_tasks/task/page/leader_review/leader_review.py` |
| Create | `vernon_tasks/task/page/leader_review/test_leader_review.py` |
| Create | `vernon_tasks/task/page/leader_review/leader_review.js` |
| Modify | `vernon_tasks/workspace/my_projects/my_projects.json` — add Leader Review shortcut |

---

## Task 1: Add `rejection_note` field to VT Task schema

**Files:**
- Modify: `vernon_tasks/task/doctype/vt_task/vt_task.json`
- Modify: `vernon_tasks/task/doctype/vt_task/vt_task.py`

- [ ] **Step 1: Add `rejection_note` field to `vt_task.json`**

Open `vernon_tasks/task/doctype/vt_task/vt_task.json`. Find the `override_reason` field entry (index ~23 in the `fields` array). Insert the new field **after** `override_reason`:

```json
{
  "fieldname": "rejection_note",
  "fieldtype": "Small Text",
  "label": "Rejection Note",
  "read_only": 1,
  "in_list_view": 0,
  "in_standard_filter": 0
}
```

- [ ] **Step 2: Allow CHECK → DO transition in `vt_task.py`**

In `vernon_tasks/task/doctype/vt_task/vt_task.py`, find `VALID_PDCA_TRANSITIONS` and change the `"CHECK"` entry:

```python
# Before:
"CHECK": ["ACT", "DONE"],

# After:
"CHECK": ["ACT", "DONE", "DO"],
```

- [ ] **Step 3: Run existing VT Task tests to confirm no regressions**

```bash
cd /path/to/frappe-bench
bench --site <site> run-tests --app vernon_tasks --module vernon_tasks.task.doctype.vt_task.test_vt_task
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add vernon_tasks/task/doctype/vt_task/vt_task.json
git add vernon_tasks/task/doctype/vt_task/vt_task.py
git commit -m "feat(schema): add rejection_note field to VT Task + allow CHECK→DO transition"
```

---

## Task 2: Create page skeleton

**Files:**
- Create: `vernon_tasks/task/page/leader_review/__init__.py`
- Create: `vernon_tasks/task/page/leader_review/leader_review.json`

- [ ] **Step 1: Create `__init__.py`**

Create empty file at `vernon_tasks/task/page/leader_review/__init__.py` (zero bytes).

- [ ] **Step 2: Create `leader_review.json`**

Create `vernon_tasks/task/page/leader_review/leader_review.json`:

```json
{
 "creation": "2026-05-08 00:00:00.000000",
 "doctype": "Page",
 "module": "Task",
 "name": "leader-review",
 "page_name": "leader-review",
 "roles": [
  {"role": "VT Leader"},
  {"role": "VT Manager"}
 ],
 "title": "Leader Review"
}
```

- [ ] **Step 3: Commit**

```bash
git add vernon_tasks/task/page/leader_review/
git commit -m "feat(page/leader_review): add page skeleton"
```

---

## Task 3: Read APIs — get_review_queue, get_team_workload, get_team_blocked_tasks

**Files:**
- Create: `vernon_tasks/task/page/leader_review/leader_review.py`
- Create: `vernon_tasks/task/page/leader_review/test_leader_review.py`

### 3a: Write failing tests for read APIs

- [ ] **Step 1: Create test file with fixtures and read API tests**

Create `vernon_tasks/task/page/leader_review/test_leader_review.py`:

```python
import frappe
import unittest
from frappe.utils import today, add_days

PROJ_NAME = "TEST-LR-PRJ"
PROJ2_NAME = "TEST-LR-PRJ2"
LEADER_USER = "Administrator"
MEMBER_USER = "test-member@example.com"


def _ensure_user(email):
    if not frappe.db.exists("User", email):
        frappe.get_doc({
            "doctype": "User",
            "email": email,
            "first_name": "Test",
            "last_name": "Member",
            "send_welcome_email": 0,
        }).insert(ignore_permissions=True)
    return email


def _make_project(name, leader, members=None):
    if frappe.db.exists("VT Project", name):
        frappe.delete_doc("VT Project", name, force=True)
    doc = frappe.get_doc({
        "doctype": "VT Project",
        "name": name,
        "title": f"Project {name}",
        "project_leader": leader,
        "start_date": today(),
        "end_date": add_days(today(), 30),
        "pdca_phase": "DO",
        "team_members": [
            {"user": m, "role": "Member"} for m in (members or [])
        ],
    })
    doc.insert(ignore_permissions=True)
    return doc


def _make_task(name, assigned_to, project, pdca_phase="PLAN", kanban_status="Scheduled",
               priority="Medium", estimated_hours=3.0, deadline_offset=5):
    if frappe.db.exists("VT Task", name):
        frappe.delete_doc("VT Task", name, force=True)
    return frappe.get_doc({
        "doctype": "VT Task",
        "name": name,
        "title": f"Task {name}",
        "project": project,
        "assigned_to": assigned_to,
        "pdca_phase": pdca_phase,
        "kanban_status": kanban_status,
        "priority": priority,
        "estimated_hours": estimated_hours,
        "start_date": today(),
        "deadline": add_days(today(), deadline_offset),
        "weight": 3.0,
    }).insert(ignore_permissions=True)


class TestLeaderReviewReadAPIs(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        frappe.set_user("Administrator")
        _ensure_user(MEMBER_USER)
        _make_project(PROJ_NAME, LEADER_USER, members=[MEMBER_USER])
        _make_project(PROJ2_NAME, "Guest", members=[])

    @classmethod
    def tearDownClass(cls):
        for name in [PROJ_NAME, PROJ2_NAME]:
            if frappe.db.exists("VT Project", name):
                frappe.delete_doc("VT Project", name, force=True)
        frappe.db.commit()

    def setUp(self):
        frappe.set_user("Administrator")

    def tearDown(self):
        for t in ["LR-T1", "LR-T2", "LR-T3", "LR-T4", "LR-BLOCKER", "LR-BLOCKED"]:
            if frappe.db.exists("VT Task", t):
                frappe.delete_doc("VT Task", t, force=True)
        frappe.db.commit()

    # --- get_review_queue ---

    def test_get_review_queue_returns_check_tasks_in_leader_projects(self):
        _make_task("LR-T1", MEMBER_USER, PROJ_NAME, pdca_phase="CHECK", kanban_status="In Review")

        from vernon_tasks.task.page.leader_review.leader_review import get_review_queue
        result = get_review_queue()
        names = [r["name"] for r in result]
        self.assertIn("LR-T1", names)

    def test_get_review_queue_excludes_tasks_in_other_projects(self):
        _make_task("LR-T2", MEMBER_USER, PROJ2_NAME, pdca_phase="CHECK", kanban_status="In Review")

        from vernon_tasks.task.page.leader_review.leader_review import get_review_queue
        result = get_review_queue()
        names = [r["name"] for r in result]
        self.assertNotIn("LR-T2", names)

    def test_get_review_queue_excludes_non_check_tasks(self):
        _make_task("LR-T3", MEMBER_USER, PROJ_NAME, pdca_phase="DO", kanban_status="In Progress")

        from vernon_tasks.task.page.leader_review.leader_review import get_review_queue
        result = get_review_queue()
        names = [r["name"] for r in result]
        self.assertNotIn("LR-T3", names)

    # --- get_team_workload ---

    def test_get_team_workload_sums_estimated_hours_per_member(self):
        _make_task("LR-T1", MEMBER_USER, PROJ_NAME, pdca_phase="DO", estimated_hours=4.0)
        _make_task("LR-T2", MEMBER_USER, PROJ_NAME, pdca_phase="CHECK", estimated_hours=3.0)

        from vernon_tasks.task.page.leader_review.leader_review import get_team_workload
        result = get_team_workload()
        member_row = next((r for r in result if r["assigned_to"] == MEMBER_USER), None)
        self.assertIsNotNone(member_row)
        self.assertAlmostEqual(member_row["total_hours"], 7.0, places=1)

    def test_get_team_workload_excludes_done_and_backlog(self):
        _make_task("LR-T1", MEMBER_USER, PROJ_NAME, pdca_phase="BACKLOG", estimated_hours=10.0)

        from vernon_tasks.task.page.leader_review.leader_review import get_team_workload
        result = get_team_workload()
        member_row = next((r for r in result if r["assigned_to"] == MEMBER_USER), None)
        if member_row:
            self.assertAlmostEqual(member_row["total_hours"], 0.0, places=1)

    # --- get_team_blocked_tasks ---

    def test_get_team_blocked_tasks_returns_blocked_member_tasks(self):
        _make_task("LR-BLOCKER", LEADER_USER, PROJ_NAME, pdca_phase="DO")
        frappe.get_doc({
            "doctype": "VT Task",
            "name": "LR-BLOCKED",
            "title": "Blocked Task",
            "project": PROJ_NAME,
            "assigned_to": MEMBER_USER,
            "pdca_phase": "PLAN",
            "kanban_status": "Scheduled",
            "priority": "High",
            "estimated_hours": 2.0,
            "start_date": today(),
            "deadline": add_days(today(), 3),
            "weight": 2.0,
            "dependencies": [{"blocked_by": "LR-BLOCKER", "dependency_type": "Finish-to-Start"}],
        }).insert(ignore_permissions=True)

        from vernon_tasks.task.page.leader_review.leader_review import get_team_blocked_tasks
        result = get_team_blocked_tasks()
        names = [r["name"] for r in result]
        self.assertIn("LR-BLOCKED", names)
        row = next(r for r in result if r["name"] == "LR-BLOCKED")
        self.assertEqual(row["blocker_name"], "LR-BLOCKER")
        self.assertIn("days_blocked", row)

    def test_get_team_blocked_tasks_excludes_other_project_tasks(self):
        # Tasks in PROJ2_NAME (not led by LEADER_USER) should not appear
        _make_task("LR-T4", MEMBER_USER, PROJ2_NAME, pdca_phase="PLAN")

        from vernon_tasks.task.page.leader_review.leader_review import get_team_blocked_tasks
        result = get_team_blocked_tasks()
        names = [r["name"] for r in result]
        self.assertNotIn("LR-T4", names)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bench --site <site> run-tests --app vernon_tasks --module vernon_tasks.task.page.leader_review.test_leader_review
```

Expected: `ImportError: cannot import name 'get_review_queue'` or `ModuleNotFoundError`.

- [ ] **Step 3: Create `leader_review.py` with read APIs**

Create `vernon_tasks/task/page/leader_review/leader_review.py`:

```python
import frappe
from frappe.utils import today


def _leader_project_names(user: str) -> list:
    rows = frappe.db.sql("""
        SELECT p.name FROM `tabVT Project` p
        WHERE p.project_leader = %(user)s
        UNION
        SELECT ptm.parent FROM `tabProject Team Member` ptm
        WHERE ptm.user = %(user)s AND ptm.role = 'Leader'
    """, {"user": user}, as_dict=True)
    return [r.name for r in rows]


def _is_leader_of_project(user: str, project: str) -> bool:
    proj_leader = frappe.db.get_value("VT Project", project, "project_leader")
    if proj_leader == user:
        return True
    return bool(frappe.db.exists(
        "Project Team Member",
        {"parent": project, "user": user, "role": "Leader"},
    ))


@frappe.whitelist()
def get_review_queue() -> list:
    user = frappe.session.user
    projects = _leader_project_names(user)
    if not projects:
        return []
    placeholders = ", ".join(["%s"] * len(projects))
    return frappe.db.sql(f"""
        SELECT t.name, t.title, t.project, t.priority, t.deadline,
               t.assigned_to, t.pdca_phase, t.kanban_status,
               t.estimated_hours, t.review_scheduled_date
        FROM `tabVT Task` t
        WHERE t.pdca_phase = 'CHECK'
          AND t.project IN ({placeholders})
        ORDER BY
            FIELD(t.priority, 'Critical', 'High', 'Medium', 'Low'),
            t.deadline ASC
    """, projects, as_dict=True)


@frappe.whitelist()
def get_team_workload() -> list:
    user = frappe.session.user
    projects = _leader_project_names(user)
    if not projects:
        return []
    placeholders = ", ".join(["%s"] * len(projects))
    rows = frappe.db.sql(f"""
        SELECT t.assigned_to, COALESCE(SUM(t.estimated_hours), 0) AS total_hours
        FROM `tabVT Task` t
        WHERE t.pdca_phase NOT IN ('DONE', 'BACKLOG')
          AND t.project IN ({placeholders})
          AND t.assigned_to IS NOT NULL
          AND t.assigned_to != ''
        GROUP BY t.assigned_to
        ORDER BY total_hours DESC
    """, projects, as_dict=True)
    capacity = frappe.db.get_single_value("VT Settings", "default_daily_target_hours") or 8.0
    for r in rows:
        r["capacity"] = float(capacity)
        r["overloaded"] = r["total_hours"] > float(capacity)
    return rows


@frappe.whitelist()
def get_team_blocked_tasks() -> list:
    user = frappe.session.user
    projects = _leader_project_names(user)
    if not projects:
        return []
    placeholders = ", ".join(["%s"] * len(projects))
    return frappe.db.sql(f"""
        SELECT
            t.name, t.title, t.project, t.priority, t.deadline,
            t.assigned_to, t.pdca_phase, t.kanban_status,
            td.blocked_by AS blocker_name,
            bt.title AS blocker_title,
            bt.assigned_to AS blocker_assignee,
            DATEDIFF(CURDATE(), t.start_date) AS days_blocked
        FROM `tabVT Task` t
        INNER JOIN `tabTask Dependency` td ON td.parent = t.name
        INNER JOIN `tabVT Task` bt ON bt.name = td.blocked_by
        WHERE t.pdca_phase NOT IN ('DONE')
          AND bt.pdca_phase != 'DONE'
          AND t.project IN ({placeholders})
        ORDER BY days_blocked DESC
    """, projects, as_dict=True)
```

- [ ] **Step 4: Run read API tests**

```bash
bench --site <site> run-tests --app vernon_tasks --module vernon_tasks.task.page.leader_review.test_leader_review
```

Expected: all `TestLeaderReviewReadAPIs` tests pass.

- [ ] **Step 5: Commit**

```bash
git add vernon_tasks/task/page/leader_review/leader_review.py
git add vernon_tasks/task/page/leader_review/test_leader_review.py
git commit -m "feat(page/leader_review): add read APIs + tests (review queue, workload, blocked)"
```

---

## Task 4: Write APIs — approve_task, reject_task

**Files:**
- Modify: `vernon_tasks/task/page/leader_review/leader_review.py`
- Modify: `vernon_tasks/task/page/leader_review/test_leader_review.py`

### 4a: Write failing tests for write APIs

- [ ] **Step 1: Append write API test class to `test_leader_review.py`**

Add this class at the bottom of `test_leader_review.py`:

```python
class TestLeaderReviewWriteAPIs(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        frappe.set_user("Administrator")
        _ensure_user(MEMBER_USER)
        _make_project(PROJ_NAME, LEADER_USER, members=[MEMBER_USER])
        _make_project(PROJ2_NAME, "Guest", members=[])

    @classmethod
    def tearDownClass(cls):
        for name in [PROJ_NAME, PROJ2_NAME]:
            if frappe.db.exists("VT Project", name):
                frappe.delete_doc("VT Project", name, force=True)
        frappe.db.commit()

    def setUp(self):
        frappe.set_user("Administrator")

    def tearDown(self):
        for t in ["LR-W1", "LR-W2", "LR-W3", "LR-W4"]:
            if frappe.db.exists("VT Task", t):
                frappe.delete_doc("VT Task", t, force=True, ignore_permissions=True)
        frappe.db.commit()

    # --- approve_task ---

    def test_approve_task_sets_done(self):
        _make_task("LR-W1", MEMBER_USER, PROJ_NAME, pdca_phase="CHECK", kanban_status="In Review")

        from vernon_tasks.task.page.leader_review.leader_review import approve_task
        result = approve_task("LR-W1")
        self.assertEqual(result["status"], "ok")

        phase = frappe.db.get_value("VT Task", "LR-W1", "pdca_phase")
        self.assertEqual(phase, "DONE")

    def test_approve_task_wrong_phase_raises_validation_error(self):
        _make_task("LR-W2", MEMBER_USER, PROJ_NAME, pdca_phase="DO", kanban_status="In Progress")

        from vernon_tasks.task.page.leader_review.leader_review import approve_task
        with self.assertRaises(frappe.ValidationError):
            approve_task("LR-W2")

    def test_approve_task_unauthorized_raises_permission_error(self):
        _make_task("LR-W3", MEMBER_USER, PROJ2_NAME, pdca_phase="CHECK", kanban_status="In Review")

        from vernon_tasks.task.page.leader_review.leader_review import approve_task
        with self.assertRaises(frappe.PermissionError):
            approve_task("LR-W3")

    # --- reject_task ---

    def test_reject_task_sets_do_and_saves_rejection_note(self):
        _make_task("LR-W1", MEMBER_USER, PROJ_NAME, pdca_phase="CHECK", kanban_status="In Review")

        from vernon_tasks.task.page.leader_review.leader_review import reject_task
        result = reject_task("LR-W1", "Output tidak lengkap, perlu revisi bagian A")
        self.assertEqual(result["status"], "ok")

        phase, note = frappe.db.get_value("VT Task", "LR-W1", ["pdca_phase", "rejection_note"])
        self.assertEqual(phase, "DO")
        self.assertEqual(note, "Output tidak lengkap, perlu revisi bagian A")

    def test_reject_task_empty_reason_raises_validation_error(self):
        _make_task("LR-W2", MEMBER_USER, PROJ_NAME, pdca_phase="CHECK", kanban_status="In Review")

        from vernon_tasks.task.page.leader_review.leader_review import reject_task
        with self.assertRaises(frappe.ValidationError):
            reject_task("LR-W2", "")

    def test_reject_task_whitespace_reason_raises_validation_error(self):
        _make_task("LR-W3", MEMBER_USER, PROJ_NAME, pdca_phase="CHECK", kanban_status="In Review")

        from vernon_tasks.task.page.leader_review.leader_review import reject_task
        with self.assertRaises(frappe.ValidationError):
            reject_task("LR-W3", "   ")

    def test_reject_task_unauthorized_raises_permission_error(self):
        _make_task("LR-W4", MEMBER_USER, PROJ2_NAME, pdca_phase="CHECK", kanban_status="In Review")

        from vernon_tasks.task.page.leader_review.leader_review import reject_task
        with self.assertRaises(frappe.PermissionError):
            reject_task("LR-W4", "some reason")
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bench --site <site> run-tests --app vernon_tasks --module vernon_tasks.task.page.leader_review.test_leader_review
```

Expected: `TestLeaderReviewWriteAPIs` tests fail with `ImportError` for `approve_task`.

- [ ] **Step 3: Add `approve_task` and `reject_task` to `leader_review.py`**

Append to the bottom of `vernon_tasks/task/page/leader_review/leader_review.py`:

```python
@frappe.whitelist()
def approve_task(task_name: str) -> dict:
    user = frappe.session.user
    doc = frappe.get_doc("VT Task", task_name)
    if doc.pdca_phase != "CHECK":
        frappe.throw(
            f"Task must be In Review to approve (current: {doc.kanban_status})",
            frappe.ValidationError,
        )
    if not _is_leader_of_project(user, doc.project):
        frappe.throw("Not authorized to approve this task", frappe.PermissionError)
    doc.pdca_phase = "DONE"
    doc.save(ignore_permissions=True)
    doc.submit()
    return {"status": "ok"}


@frappe.whitelist()
def reject_task(task_name: str, reason: str) -> dict:
    user = frappe.session.user
    if not reason or not reason.strip():
        frappe.throw("Rejection reason is required", frappe.ValidationError)
    doc = frappe.get_doc("VT Task", task_name)
    if doc.pdca_phase != "CHECK":
        frappe.throw(
            f"Task must be In Review to reject (current: {doc.kanban_status})",
            frappe.ValidationError,
        )
    if not _is_leader_of_project(user, doc.project):
        frappe.throw("Not authorized to reject this task", frappe.PermissionError)
    frappe.db.set_value("VT Task", task_name, {
        "pdca_phase": "DO",
        "kanban_status": "In Progress",
        "rejection_note": reason.strip(),
    })
    return {"status": "ok"}
```

**Note on `approve_task`:** `doc.save()` triggers `_validate_pdca_transition` (CHECK → DONE is valid) and `_sync_kanban_status` (sets `kanban_status = Done`). Then `doc.submit()` triggers `on_submit` which sets `completion_date`, then `calculate_points` fires via the `on_submit` hook in `hooks.py`.

**Note on `reject_task`:** Uses `frappe.db.set_value` to bypass `_validate_pdca_transition` because CHECK → DO is not a forward PDCA transition — it is a leader override. This is consistent with the pattern in `my_work.py`.

- [ ] **Step 4: Run all leader_review tests**

```bash
bench --site <site> run-tests --app vernon_tasks --module vernon_tasks.task.page.leader_review.test_leader_review
```

Expected: all 13 tests pass.

- [ ] **Step 5: Commit**

```bash
git add vernon_tasks/task/page/leader_review/leader_review.py
git add vernon_tasks/task/page/leader_review/test_leader_review.py
git commit -m "feat(page/leader_review): add approve_task + reject_task APIs + tests"
```

---

## Task 5: Build `leader_review.js` — 3-tab UI

**Files:**
- Create: `vernon_tasks/task/page/leader_review/leader_review.js`

- [ ] **Step 1: Create `leader_review.js`**

Create `vernon_tasks/task/page/leader_review/leader_review.js`:

```javascript
frappe.pages["leader-review"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: "Leader Review",
        single_column: true,
    });

    page.add_button(__("Refresh"), () => render_active_tab(), { icon: "refresh" });

    const container = $('<div class="lr-container" style="padding: 0 20px 40px;"></div>')
        .appendTo(page.main);

    // ── helpers ──────────────────────────────────────────────────────────────

    const PRIORITY_COLOR = { Critical: "red", High: "red", Medium: "orange", Low: "blue" };
    const KANBAN_COLOR = {
        "Backlog": "gray", "Scheduled": "blue", "In Progress": "yellow",
        "In Review": "purple", "Revision": "orange", "Done": "green",
    };

    const esc = (s) => frappe.utils.escape_html(String(s || ""));

    function task_link(name, title) {
        return `<a href="/app/vt-task/${esc(name)}" target="_blank">${esc(title)}</a>`;
    }

    function status_pill(label) {
        return `<span class="indicator-pill ${KANBAN_COLOR[label] || "gray"}">${esc(label)}</span>`;
    }

    function priority_pill(p) {
        return `<span class="indicator-pill ${PRIORITY_COLOR[p] || "gray"}">${esc(p)}</span>`;
    }

    function fmt_deadline(d) {
        if (!d) return "—";
        const diff = frappe.datetime.get_diff(d, frappe.datetime.get_today());
        if (diff < 0) return `<span style="color:var(--red-500)">Overdue ${Math.abs(diff)}d</span>`;
        if (diff === 0) return `<span style="color:var(--orange-500)">Today</span>`;
        return `+${diff}d`;
    }

    function empty_state(msg) {
        return `<p class="text-muted" style="padding:12px 0;">${esc(msg)}</p>`;
    }

    function workload_bar(hours, capacity) {
        const pct = Math.min(100, Math.round((hours / capacity) * 100));
        const color = pct >= 100 ? "var(--red-500)" : pct >= 80 ? "var(--orange-500)" : "var(--green-500)";
        return `
            <div style="display:flex; align-items:center; gap:8px;">
                <div style="flex:1; background:var(--gray-200); border-radius:4px; height:8px;">
                    <div style="width:${pct}%; background:${color}; border-radius:4px; height:8px;"></div>
                </div>
                <span style="font-size:11px; color:${color};">${hours.toFixed(1)}h / ${capacity}h${pct >= 100 ? " ⚠" : ""}</span>
            </div>`;
    }

    // ── tabs ─────────────────────────────────────────────────────────────────

    const TABS = [
        { id: "review-queue", label: "Review Queue" },
        { id: "team-workload", label: "Team Workload" },
        { id: "team-blocked", label: "Blocked Tasks" },
    ];

    let activeTab = "review-queue";

    const tabNav = $('<ul class="nav nav-tabs" style="margin: 16px 0 0;"></ul>').appendTo(container);
    const tabContent = $('<div class="tab-content" style="margin-top:0;"></div>').appendTo(container);

    TABS.forEach(({ id, label }) => {
        $(`<li class="nav-item">
            <a class="nav-link${id === activeTab ? " active" : ""}" data-tab="${id}" href="#">
                ${esc(label)} <span class="badge badge-secondary" id="${id}-count" style="margin-left:4px;">0</span>
            </a>
        </li>`).appendTo(tabNav);

        $(`<div class="tab-pane frappe-card" id="${id}-pane"
            style="padding:16px; display:${id === activeTab ? "block" : "none"}; margin-top:0; border-top:none; border-radius:0 0 4px 4px;">
            <div id="${id}-body"></div>
        </div>`).appendTo(tabContent);
    });

    tabNav.on("click", ".nav-link", function (e) {
        e.preventDefault();
        activeTab = $(this).data("tab");
        tabNav.find(".nav-link").removeClass("active");
        $(this).addClass("active");
        tabContent.find(".tab-pane").hide();
        $(`#${activeTab}-pane`).show();
        render_active_tab();
    });

    // ── Tab 1: Review Queue ───────────────────────────────────────────────────

    function render_review_queue() {
        frappe.call({
            method: "vernon_tasks.task.page.leader_review.leader_review.get_review_queue",
            callback(r) {
                const data = r.message || [];
                $("#review-queue-count").text(data.length);
                if (!data.length) {
                    $("#review-queue-body").html(empty_state("No tasks pending review."));
                    return;
                }
                const rows = data.map(t => `
                    <tr>
                        <td>${task_link(t.name, t.title)}</td>
                        <td>${esc(t.project) || "—"}</td>
                        <td>${esc(t.assigned_to) || "—"}</td>
                        <td>${priority_pill(t.priority)}</td>
                        <td>${fmt_deadline(t.deadline)}</td>
                        <td style="white-space:nowrap;">
                            <button class="btn btn-xs btn-success btn-approve" data-task="${esc(t.name)}">Approve</button>
                            <button class="btn btn-xs btn-danger btn-reject" data-task="${esc(t.name)}" style="margin-left:4px;">Reject</button>
                        </td>
                    </tr>
                `).join("");
                $("#review-queue-body").html(`
                    <table class="table table-sm" style="margin:0;">
                        <thead><tr>
                            <th>Task</th><th>Project</th><th>Assignee</th>
                            <th>Priority</th><th>Deadline</th><th></th>
                        </tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                `);
            },
        });
    }

    // ── Tab 2: Team Workload ──────────────────────────────────────────────────

    function render_team_workload() {
        frappe.call({
            method: "vernon_tasks.task.page.leader_review.leader_review.get_team_workload",
            callback(r) {
                const data = r.message || [];
                $("#team-workload-count").text(data.length);
                if (!data.length) {
                    $("#team-workload-body").html(empty_state("No active team members."));
                    return;
                }
                const rows = data.map(m => `
                    <tr>
                        <td>${esc(m.assigned_to)}</td>
                        <td>${workload_bar(m.total_hours, m.capacity)}</td>
                    </tr>
                `).join("");
                $("#team-workload-body").html(`
                    <table class="table table-sm" style="margin:0;">
                        <thead><tr><th>Member</th><th>Load</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                `);
            },
        });
    }

    // ── Tab 3: Blocked Tasks ──────────────────────────────────────────────────

    function render_team_blocked() {
        frappe.call({
            method: "vernon_tasks.task.page.leader_review.leader_review.get_team_blocked_tasks",
            callback(r) {
                const data = r.message || [];
                $("#team-blocked-count").text(data.length);
                if (!data.length) {
                    $("#team-blocked-body").html(empty_state("No blocked tasks."));
                    return;
                }
                const rows = data.map(t => `
                    <tr>
                        <td>${task_link(t.name, t.title)}</td>
                        <td>${esc(t.assigned_to) || "—"}</td>
                        <td>${task_link(t.blocker_name, t.blocker_title)}</td>
                        <td>${esc(t.blocker_assignee) || "—"}</td>
                        <td>${t.days_blocked || 0}d</td>
                    </tr>
                `).join("");
                $("#team-blocked-body").html(`
                    <table class="table table-sm" style="margin:0;">
                        <thead><tr>
                            <th>Blocked Task</th><th>Member</th>
                            <th>Blocked By</th><th>Blocker Owner</th><th>Days</th>
                        </tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                `);
            },
        });
    }

    // ── Action handlers ───────────────────────────────────────────────────────

    $(document).on("click", ".btn-approve", function () {
        const task_name = $(this).data("task");
        frappe.confirm(
            `Approve task <b>${esc(task_name)}</b>? This will mark it as DONE and calculate points.`,
            () => {
                frappe.call({
                    method: "vernon_tasks.task.page.leader_review.leader_review.approve_task",
                    args: { task_name },
                    callback(r) {
                        if (r.message && r.message.status === "ok") {
                            frappe.show_alert({ message: "Task approved", indicator: "green" });
                            render_review_queue();
                        }
                    },
                    error(r) {
                        frappe.msgprint(r.message || "Approval failed");
                    },
                });
            }
        );
    });

    $(document).on("click", ".btn-reject", function () {
        const task_name = $(this).data("task");
        frappe.prompt(
            {
                label: "Rejection Reason",
                fieldname: "reason",
                fieldtype: "Small Text",
                reqd: 1,
            },
            ({ reason }) => {
                frappe.call({
                    method: "vernon_tasks.task.page.leader_review.leader_review.reject_task",
                    args: { task_name, reason },
                    callback(r) {
                        if (r.message && r.message.status === "ok") {
                            frappe.show_alert({ message: "Task sent back for revision", indicator: "orange" });
                            render_review_queue();
                        }
                    },
                    error(r) {
                        frappe.msgprint(r.message || "Rejection failed");
                    },
                });
            },
            "Reject Task",
            "Reject"
        );
    });

    // ── Routing ───────────────────────────────────────────────────────────────

    function render_active_tab() {
        if (activeTab === "review-queue") render_review_queue();
        else if (activeTab === "team-workload") render_team_workload();
        else if (activeTab === "team-blocked") render_team_blocked();
    }

    render_review_queue();
};
```

- [ ] **Step 2: Commit**

```bash
git add vernon_tasks/task/page/leader_review/leader_review.js
git commit -m "feat(page/leader_review): add 3-tab JS UI with approve/reject handlers"
```

---

## Task 6: Add Leader Review shortcut to Leader Workspace

**Files:**
- Modify: `vernon_tasks/workspace/my_projects/my_projects.json`

- [ ] **Step 1: Add shortcut to `my_projects.json`**

Open `vernon_tasks/workspace/my_projects/my_projects.json`. Find the `"shortcuts"` array and add this entry as the **first** item:

```json
{"color": "Blue", "icon": "check-circle", "label": "Leader Review", "link_to": "leader-review", "type": "Page"}
```

- [ ] **Step 2: Commit**

```bash
git add vernon_tasks/workspace/my_projects/my_projects.json
git commit -m "feat(workspace): add Leader Review shortcut to Leader workspace"
```

---

## Task 7: Final verification

- [ ] **Step 1: Run full test suite for the app**

```bash
bench --site <site> run-tests --app vernon_tasks
```

Expected: all tests pass, zero failures.

- [ ] **Step 2: Reload the app in the site**

```bash
bench --site <site> migrate
bench build --app vernon_tasks
```

- [ ] **Step 3: Verify the page loads**

Open browser → navigate to `/app/leader-review`. Confirm:
- Page loads with 3 tabs
- Review Queue tab shows CHECK-phase tasks for your projects
- Team Workload tab shows member load bars
- Blocked Tasks tab shows blocked member tasks
- Approve button opens confirm dialog
- Reject button opens reason prompt

- [ ] **Step 4: Final commit (if any fixes needed)**

```bash
git add -p
git commit -m "fix(page/leader_review): <describe fix>"
```

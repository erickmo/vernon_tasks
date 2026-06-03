# Merge "My Work" into vt-home — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fold the standalone `my-work` desk Page into `vt-home` as a third "Tugas Saya" tab, then retire the `/app/my-work` route entirely.

**Architecture:** The five whitelisted functions move from the page controller into the existing `task/api/my_work.py` module. The doer UI is extracted into a shared global asset `public/js/vt_focus_panel.js` (`window.vt_render_focus_panel`) that `vt_home.js` lazy-renders into a new tab panel. A migration patch removes the orphaned `Page` doc + navbar row on existing installs.

**Tech Stack:** Frappe Framework (Python whitelisted methods + desk Page JS), Frappe test runner (unittest), `bench migrate` patches.

**Spec:** `docs/superpowers/specs/2026-06-03-merge-my-work-into-vt-home-design.html`

**Run context:** bench runs in Docker. Test command prefix:
`docker exec frappe-backend-1 bench --site task.localhost run-tests --module <module.path>`

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `task/api/my_work.py` | Home for all "my work" whitelisted APIs | **modify** — append 5 funcs |
| `task/api/test_my_work_focus.py` | Tests for the 5 moved funcs | **new** (retargeted copy of page test) |
| `public/js/vt_focus_panel.js` | Renders My Day / ToDo / Blocked + actions | **new** |
| `hooks.py` | Asset registration | **modify** — add asset to `app_include_js` |
| `task/page/vt_home/vt_home.js` | vt-home render layer | **modify** — add 3rd tab + lazy render |
| `setup_website.py` | Fresh-install navbar seed | **modify** — drop "My Work" item |
| `workspace/my_tasks/my_tasks.json` | My Tasks workspace | **modify** — drop my-work shortcut |
| `task/workspace/vernon_tasks/vernon_tasks.json` | Vernon Tasks workspace | **modify** — drop my-work link |
| `public/js/vt_navbar.js` | Navbar active-route matching | **modify** — comment only |
| `patches/v1_x/retire_my_work_page.py` + `patches.txt` | Existing-install migration | **new** |
| `tests/test_retire_my_work_patch.py` | Patch behavior + idempotency | **new** |
| `tests/test_focus_panel_wiring.py` | Asserts tab + asset wiring present | **new** |
| `task/page/my_work/` | Old page directory | **delete** (last) |

---

## Task 1: Move the 5 functions to `task/api/my_work.py` (TDD)

**Files:**
- Create: `task/api/test_my_work_focus.py` (copy of `task/page/my_work/test_my_work.py`, retargeted imports)
- Modify: `task/api/my_work.py` (append 5 functions)

- [ ] **Step 1: Create the retargeted test file**

Copy the page test verbatim, then rewrite every import path. The page test imports
`from vernon_tasks.task.page.my_work.my_work import <fn>` in 10 places — all become
`from vernon_tasks.task.api.my_work import <fn>`.

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/vernon_tasks
cp task/page/my_work/test_my_work.py task/api/test_my_work_focus.py
# retarget all import paths (page controller -> api module)
perl -0pi -e 's/vernon_tasks\.task\.page\.my_work\.my_work/vernon_tasks.task.api.my_work/g' task/api/test_my_work_focus.py
# rename the TestCase class so it does not clash with the api/test_my_work.py suite
perl -0pi -e 's/class TestMyWork\b/class TestMyWorkFocus/g' task/api/test_my_work_focus.py
grep -n "import" task/api/test_my_work_focus.py | grep my_work
```
Expected: all matching lines now read `from vernon_tasks.task.api.my_work import ...`.

> Note: if the page test's class is not literally named `TestMyWork`, open the file
> and rename whatever class it declares to a `*Focus` name so two suites do not collide.

- [ ] **Step 2: Run the new test — verify it FAILS**

Run:
```bash
docker exec frappe-backend-1 bench --site task.localhost run-tests \
  --module vernon_tasks.task.api.test_my_work_focus
```
Expected: FAIL — `ImportError: cannot import name 'get_my_day' from 'vernon_tasks.task.api.my_work'`
(the functions do not exist there yet).

- [ ] **Step 3: Append the 5 functions to `task/api/my_work.py`**

`task/api/my_work.py` already imports `frappe` and `from frappe.utils import today, add_days` —
no new imports needed. Append at end of file (functions are moved verbatim from the page
controller; behavior unchanged; docstrings retained):

```python


@frappe.whitelist()
def get_my_day() -> list:
    """
    Retrieve today's scheduled tasks for the current user.

    Returns tasks assigned to the current user with schedule entries for today,
    excluding completed tasks (pdca_phase = 'DONE').

    Ordered by priority (High, Medium, Low) and deadline.
    Moved from the retired my-work desk Page (now the vt-home "Tugas Saya" tab).
    """
    user = frappe.session.user
    return frappe.db.sql("""
        SELECT
            t.name, t.title, t.project, t.priority,
            t.pdca_phase, t.kanban_status,
            se.allocated_minutes
        FROM `tabVT Task` t
        INNER JOIN `tabTask Schedule Entry` se ON se.parent = t.name
        WHERE t.assigned_to = %(user)s
          AND se.date = %(date)s
          AND t.pdca_phase NOT IN ('DONE')
        ORDER BY
            FIELD(t.priority, 'High', 'Medium', 'Low'),
            t.deadline ASC
    """, {"user": user, "date": today()}, as_dict=True)


@frappe.whitelist()
def get_what_to_do_today() -> list:
    """
    Retrieve prioritized tasks for today based on PDCA phase and priority.

    Returns high-priority unfinished tasks that should be worked on today.
    Moved from the retired my-work desk Page.
    """
    user = frappe.session.user
    cutoff = add_days(today(), 3)
    return frappe.db.sql("""
        SELECT t.name, t.title, t.project, t.priority, t.deadline,
               t.pdca_phase, t.kanban_status
        FROM `tabVT Task` t
        WHERE t.assigned_to = %(user)s
          AND t.deadline <= %(cutoff)s
          AND t.pdca_phase NOT IN ('DONE', 'ACT')
          AND NOT EXISTS (
              SELECT 1 FROM `tabTask Dependency` td
              INNER JOIN `tabVT Task` bt ON bt.name = td.blocked_by
              WHERE td.parent = t.name AND bt.pdca_phase != 'DONE'
          )
        ORDER BY
            FIELD(t.priority, 'High', 'Medium', 'Low'),
            t.deadline ASC
    """, {"user": user, "cutoff": cutoff}, as_dict=True)


@frappe.whitelist()
def get_my_blocked_tasks() -> list:
    """
    Retrieve tasks that are currently blocked due to dependencies.

    Returns tasks where blockers are not yet completed.
    Moved from the retired my-work desk Page.
    """
    user = frappe.session.user
    return frappe.db.sql("""
        SELECT
            t.name, t.title, t.project, t.priority, t.deadline,
            t.pdca_phase, t.kanban_status,
            td.blocked_by AS blocker_name,
            bt.title AS blocker_title,
            bt.assigned_to AS blocker_assignee,
            DATEDIFF(CURDATE(), t.start_date) AS days_blocked
        FROM `tabVT Task` t
        INNER JOIN `tabTask Dependency` td ON td.parent = t.name
        INNER JOIN `tabVT Task` bt ON bt.name = td.blocked_by
        WHERE t.assigned_to = %(user)s
          AND t.pdca_phase NOT IN ('DONE')
          AND bt.pdca_phase != 'DONE'
        ORDER BY days_blocked DESC
    """, {"user": user}, as_dict=True)


@frappe.whitelist()
def start_task(task: str) -> dict:
    """
    Transition a task to 'In Progress' status.

    Args:
        task: Task name (ID)

    Returns:
        dict: {"status": "ok"} on success.
    Moved from the retired my-work desk Page.
    """
    user = frappe.session.user
    doc = frappe.db.get_value(
        "VT Task", task,
        ["assigned_to", "pdca_phase", "kanban_status", "title"],
        as_dict=True,
    )
    if not doc:
        frappe.throw(f"Task {task} not found", frappe.DoesNotExistError)
    if doc.assigned_to != user:
        frappe.throw("Not authorized to act on this task", frappe.PermissionError)
    if doc.pdca_phase not in ("BACKLOG", "PLAN"):
        frappe.throw(
            f"Task must be Backlog or Scheduled to start (current: {doc.kanban_status})",
            frappe.ValidationError,
        )
    blocker = frappe.db.sql("""
        SELECT bt.title FROM `tabTask Dependency` td
        INNER JOIN `tabVT Task` bt ON bt.name = td.blocked_by
        WHERE td.parent = %(task)s AND bt.pdca_phase != 'DONE'
        LIMIT 1
    """, {"task": task}, as_dict=True)
    if blocker:
        frappe.throw(
            f"Task is blocked by: {blocker[0].title}",
            frappe.ValidationError,
        )
    frappe.db.set_value("VT Task", task, {
        "pdca_phase": "DO",
        "kanban_status": "In Progress",
    })
    return {"status": "ok"}


@frappe.whitelist()
def submit_for_review(task: str) -> dict:
    """
    Submit a task for peer/manager review.

    Args:
        task: Task name (ID)

    Returns:
        dict: {"status": "ok"} on success.
    Moved from the retired my-work desk Page.
    """
    user = frappe.session.user
    doc = frappe.db.get_value(
        "VT Task", task,
        ["assigned_to", "pdca_phase", "kanban_status"],
        as_dict=True,
    )
    if not doc:
        frappe.throw(f"Task {task} not found", frappe.DoesNotExistError)
    if doc.assigned_to != user:
        frappe.throw("Not authorized to act on this task", frappe.PermissionError)
    if doc.pdca_phase != "DO":
        frappe.throw(
            f"Task must be In Progress to submit for review (current: {doc.kanban_status})",
            frappe.ValidationError,
        )
    frappe.db.set_value("VT Task", task, {
        "pdca_phase": "CHECK",
        "kanban_status": "In Review",
    })
    return {"status": "ok"}
```

- [ ] **Step 4: Run the new test — verify it PASSES**

Run:
```bash
docker exec frappe-backend-1 bench --site task.localhost run-tests \
  --module vernon_tasks.task.api.test_my_work_focus
```
Expected: PASS (10 tests). If MandatoryError on `brand`/`project_owner` appears in fixtures,
that is pre-existing test debt unrelated to this change (see project memory).

- [ ] **Step 5: Commit**

```bash
git add task/api/my_work.py task/api/test_my_work_focus.py
git commit -m "refactor(my-work): pindah 5 API my-work ke task/api/my_work.py"
```

---

## Task 2: Extract the focus panel asset `vt_focus_panel.js`

**Files:**
- Create: `public/js/vt_focus_panel.js`
- Modify: `hooks.py` (`app_include_js`)

- [ ] **Step 1: Create `public/js/vt_focus_panel.js`**

Self-contained global asset. Calls the API module from Task 1. Selectors and the click
handler are scoped to the panel root (the asset loads on every desk page, so global
`$(document).on(...)` binding from the old page would double-fire — bind to root instead).

```javascript
/* vt_focus_panel.js — shared "Tugas Saya" focus panel for vt-home.
   Exposes window.vt_render_focus_panel(wrapper): renders My Day /
   What To Do Today / My Blocked Tasks with Start / Submit-for-Review
   actions into the given jQuery element. Presentation only — calls
   whitelisted APIs in vernon_tasks.task.api.my_work. Extracted from the
   retired my-work desk Page so vt_home.js stays lean. */
(function () {
    const MW_API = "vernon_tasks.task.api.my_work";

    const PRIORITY_COLOR = { High: "red", Medium: "orange", Low: "blue" };
    const KANBAN_COLOR = {
        "Backlog": "gray", "Scheduled": "blue", "In Progress": "yellow",
        "In Review": "purple", "Revision": "orange", "Done": "green",
    };

    const esc = (s) => frappe.utils.escape_html(String(s || ""));

    function status_pill(label) {
        const color = KANBAN_COLOR[label] || "gray";
        return `<span class="indicator-pill ${color}">${esc(label)}</span>`;
    }

    function fmt_deadline(d) {
        if (!d) return "—";
        const diff = frappe.datetime.get_diff(d, frappe.datetime.get_today());
        if (diff < 0) return `<span style="color:var(--red-500)">Overdue ${Math.abs(diff)}d</span>`;
        if (diff === 0) return `<span style="color:var(--orange-500)">Today</span>`;
        return `+${diff}d`;
    }

    function task_link(name, title) {
        return `<a href="/app/vt-task/${esc(name)}" target="_blank">${esc(title)}</a>`;
    }

    function make_section(container, id, title) {
        $(`
            <div class="frappe-card" style="margin-top:20px; padding:16px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <h5 style="margin:0;">${esc(title)} <span class="badge badge-secondary" id="${id}-count">0</span></h5>
                </div>
                <div id="${id}-body"></div>
            </div>
        `).appendTo(container);
    }

    function empty_state(msg) {
        return `<p class="text-muted" style="padding:12px 0;">${esc(msg)}</p>`;
    }

    function action_btn(task_name, kanban_status) {
        if (["Backlog", "Scheduled"].includes(kanban_status)) {
            return `<button class="btn btn-xs btn-primary btn-start" data-task="${esc(task_name)}">Start</button>`;
        }
        if (kanban_status === "In Progress") {
            return `<button class="btn btn-xs btn-warning btn-submit" data-task="${esc(task_name)}">Submit for Review</button>`;
        }
        return "—";
    }

    function render_my_day(root) {
        frappe.call({
            method: `${MW_API}.get_my_day`,
            callback(r) {
                const data = r.message || [];
                root.find("#my-day-count").text(data.length);
                if (!data.length) {
                    root.find("#my-day-body").html(empty_state("No tasks scheduled today."));
                    return;
                }
                const rows = data.map((t) => `
                    <tr>
                        <td>${task_link(t.name, t.title)}</td>
                        <td>${esc(t.project) || "—"}</td>
                        <td>${t.allocated_minutes ? t.allocated_minutes + "m" : "—"}</td>
                        <td>${status_pill(t.kanban_status)}</td>
                        <td>${action_btn(t.name, t.kanban_status)}</td>
                    </tr>`).join("");
                root.find("#my-day-body").html(`
                    <table class="table table-sm" style="margin:0;">
                        <thead><tr><th>Task</th><th>Project</th><th>Hours</th><th>Status</th><th></th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>`);
            },
        });
    }

    function render_what_to_do_today(root) {
        frappe.call({
            method: `${MW_API}.get_what_to_do_today`,
            callback(r) {
                const data = r.message || [];
                root.find("#wtdt-count").text(data.length);
                if (!data.length) {
                    root.find("#wtdt-body").html(empty_state("Nothing due soon."));
                    return;
                }
                const rows = data.map((t) => `
                    <tr>
                        <td>${task_link(t.name, t.title)}</td>
                        <td>${esc(t.project) || "—"}</td>
                        <td>${fmt_deadline(t.deadline)}</td>
                        <td><span class="indicator-pill ${PRIORITY_COLOR[t.priority] || "gray"}">${esc(t.priority)}</span></td>
                        <td>${action_btn(t.name, t.kanban_status)}</td>
                    </tr>`).join("");
                root.find("#wtdt-body").html(`
                    <table class="table table-sm" style="margin:0;">
                        <thead><tr><th>Task</th><th>Project</th><th>Deadline</th><th>Priority</th><th></th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>`);
            },
        });
    }

    function render_blocked(root) {
        frappe.call({
            method: `${MW_API}.get_my_blocked_tasks`,
            callback(r) {
                const data = r.message || [];
                root.find("#blocked-count").text(data.length);
                if (!data.length) {
                    root.find("#blocked-body").html(empty_state("No blocked tasks."));
                    return;
                }
                const rows = data.map((t) => `
                    <tr>
                        <td>${task_link(t.name, t.title)}</td>
                        <td>${task_link(t.blocker_name, t.blocker_title)}</td>
                        <td>${esc(t.blocker_assignee) || "—"}</td>
                        <td>${t.days_blocked || 0}d</td>
                    </tr>`).join("");
                root.find("#blocked-body").html(`
                    <table class="table table-sm" style="margin:0;">
                        <thead><tr><th>Task</th><th>Blocked By</th><th>Assignee</th><th>Days</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>`);
            },
        });
    }

    function call_action(root, method, task_name) {
        frappe.call({
            method,
            args: { task: task_name },
            callback(r) {
                if (r.message && r.message.status === "ok") {
                    frappe.show_alert({ message: "Done", indicator: "green" });
                    render_focus(root);
                }
            },
            error(r) {
                frappe.msgprint((r && r.message) || "Action failed");
            },
        });
    }

    function bind_actions(root) {
        root.off("click.vtfocus");
        root.on("click.vtfocus", ".btn-start", function () {
            call_action(root, `${MW_API}.start_task`, $(this).data("task"));
        });
        root.on("click.vtfocus", ".btn-submit", function () {
            call_action(root, `${MW_API}.submit_for_review`, $(this).data("task"));
        });
    }

    function render_focus(root) {
        root.empty();
        const container = $('<div class="my-work-container" style="padding: 0 20px 40px 0;"></div>').appendTo(root);
        make_section(container, "my-day", "My Day");
        make_section(container, "wtdt", "What To Do Today");
        make_section(container, "blocked", "My Blocked Tasks");
        render_my_day(container);
        render_what_to_do_today(container);
        render_blocked(container);
        bind_actions(container);
    }

    // Public entry point: render the focus panel into `wrapper` (DOM node or jQuery).
    window.vt_render_focus_panel = function (wrapper) {
        render_focus($(wrapper));
    };
})();
```

- [ ] **Step 2: Register the asset in `hooks.py`**

Modify the `app_include_js` list (currently lines 11-17) to add the new asset:

```python
app_include_js = [
    "/assets/vernon_tasks/js/page_nav.js",
    "/assets/vernon_tasks/js/vt_empty.js",
    "/assets/vernon_tasks/js/vt_navbar.js",
    "/assets/vernon_tasks/js/vt_project_redirect.js",
    "/assets/vernon_tasks/js/vt_page_style.js",
    "/assets/vernon_tasks/js/vt_focus_panel.js",
]
```

- [ ] **Step 3: Build assets**

Run:
```bash
docker exec frappe-backend-1 bench build --app vernon_tasks
```
Expected: build succeeds, bundles `vt_focus_panel.js`.

- [ ] **Step 4: Commit**

```bash
git add public/js/vt_focus_panel.js hooks.py
git commit -m "feat(vt-home): ekstrak panel Tugas Saya ke vt_focus_panel.js"
```

---

## Task 3: Add the "Tugas Saya" tab to `vt_home.js`

**Files:**
- Modify: `task/page/vt_home/vt_home.js` (lines 36-83)
- Test: `tests/test_focus_panel_wiring.py` (new)

- [ ] **Step 1: Write the wiring test — verify it FAILS**

Create `tests/test_focus_panel_wiring.py`:

```python
"""Guard: the Tugas Saya tab + focus-panel asset stay wired into vt-home.

There is no JS DOM test harness in this app, so this is a source-level wiring
guard — it fails loudly if a refactor drops the tab button, the lazy render
call, or the asset registration. PRD: merge-my-work-into-vt-home.
"""
import os
import unittest

import vernon_tasks

_APP_DIR = os.path.dirname(vernon_tasks.__file__)


def _read(rel_path: str) -> str:
    with open(os.path.join(_APP_DIR, rel_path), encoding="utf-8") as fh:
        return fh.read()


class TestFocusPanelWiring(unittest.TestCase):
    def test_vt_home_has_tugas_saya_tab(self):  # PRD: merge-my-work-into-vt-home
        js = _read("task/page/vt_home/vt_home.js")
        self.assertIn('data-tab="tugas-saya"', js)
        self.assertIn('data-panel="tugas-saya"', js)
        self.assertIn("vt_render_focus_panel", js)

    def test_focus_asset_registered(self):  # PRD: merge-my-work-into-vt-home
        hooks = _read("hooks.py")
        self.assertIn("js/vt_focus_panel.js", hooks)
```

Run:
```bash
docker exec frappe-backend-1 bench --site task.localhost run-tests \
  --module vernon_tasks.tests.test_focus_panel_wiring
```
Expected: `test_vt_home_has_tugas_saya_tab` FAILS (tab not added yet);
`test_focus_asset_registered` PASSES (added in Task 2).

- [ ] **Step 2: Add the lazy-state flag**

In `vt_home.js`, find (line 36-37):

```javascript
// Module-scoped lazy state for the Tim tab (reset on every Refresh).
let team_loaded = false;
```

Replace with:

```javascript
// Module-scoped lazy state for the lazy tabs (reset on every Refresh).
let team_loaded = false;
let focus_loaded = false;
```

- [ ] **Step 3: Add the tab button + panel in `build_tabs`**

In `build_tabs` (lines 56-65), replace the template string with the 3-tab version
(new button + panel inserted between Beranda and Tim):

```javascript
    const el = $(`
        <div>
            <div class="vh-tabs">
                <button class="vh-tab active" data-tab="beranda">Beranda</button>
                <button class="vh-tab" data-tab="tugas-saya">Tugas Saya</button>
                <button class="vh-tab" data-tab="tim" style="display:none;">Tim</button>
            </div>
            <div class="vh-panel vt-home" data-panel="beranda"></div>
            <div class="vh-panel vt-home" data-panel="tugas-saya" style="display:none;"></div>
            <div class="vh-panel vt-home" data-panel="tim" style="display:none;"></div>
        </div>
    `);
```

- [ ] **Step 4: Wire lazy render on tab click**

In the same `build_tabs`, find the click handler tail (line 73):

```javascript
        if (tab === "tim") render_team_tab();
```

Replace with:

```javascript
        if (tab === "tugas-saya") render_focus_tab();
        if (tab === "tim") render_team_tab();
```

- [ ] **Step 5: Reset the flag in `render_all`**

In `render_all` (lines 78-83), find:

```javascript
    team_loaded = false;
    probe_team_tab(tabs);
```

Replace with:

```javascript
    team_loaded = false;
    focus_loaded = false;
    probe_team_tab(tabs);
```

- [ ] **Step 6: Add the `render_focus_tab` function**

Immediately after `render_all` (after its closing `}` near line 83), add:

```javascript

// Lazy: render the Tugas Saya focus panel once per render_all cycle. The panel
// markup lives in the shared vt_focus_panel.js asset (window.vt_render_focus_panel).
function render_focus_tab() {
    if (focus_loaded) return;
    focus_loaded = true;
    const panel = $('.vh-panel[data-panel="tugas-saya"]');
    if (typeof window.vt_render_focus_panel === "function") {
        window.vt_render_focus_panel(panel);
    } else {
        panel.html('<div class="vh-empty">Panel tidak tersedia.</div>');
    }
}
```

- [ ] **Step 7: Run the wiring test — verify it PASSES**

Run:
```bash
docker exec frappe-backend-1 bench build --app vernon_tasks && \
docker exec frappe-backend-1 bench --site task.localhost run-tests \
  --module vernon_tasks.tests.test_focus_panel_wiring
```
Expected: both tests PASS.

- [ ] **Step 8: Manual smoke (browser)**

Open `/app/vt-home`. Confirm: three tabs `Beranda | Tugas Saya | Tim` (Tim hidden unless
eligible). Click **Tugas Saya** → My Day / What To Do Today / My Blocked Tasks render.
Click **Start** on a Backlog task → alert "Done", panel refreshes, task moves to In Progress.
Click **Submit for Review** on an In Progress task → moves to In Review.

- [ ] **Step 9: Commit**

```bash
git add task/page/vt_home/vt_home.js tests/test_focus_panel_wiring.py
git commit -m "feat(vt-home): tambah tab Tugas Saya (lazy render panel fokus)"
```

---

## Task 4: Retire the navbar seed + workspace references

**Files:**
- Modify: `setup_website.py` (line ~299)
- Modify: `workspace/my_tasks/my_tasks.json` (shortcut block ~106-113)
- Modify: `task/workspace/vernon_tasks/vernon_tasks.json` (link block ~256-267)
- Modify: `public/js/vt_navbar.js` (comment line ~158)

- [ ] **Step 1: Remove the "My Work" navbar seed item**

In `setup_website.py`, delete this line from `_NAVBAR_ITEMS`:

```python
    dict(label="My Work",        route="/app/my-work",        icon="check-circle",  is_group=0, parent_group="",       role_restriction="",          enabled=1),
```

(Leave the surrounding `# ── Personal ...` comment; Analytics/Scorecard remain.)

- [ ] **Step 2: Remove the My Work shortcut from `my_tasks.json`**

Delete this object from the `"shortcuts"` array (the comma of the preceding/following
element must stay valid JSON — remove the whole `{ ... }` and one separating comma):

```json
    {
      "color": "Blue",
      "icon": "book-open",
      "label": "My Work",
      "link_to": "my-work",
      "type": "Page"
    },
```

- [ ] **Step 3: Remove the My Work link from `vernon_tasks.json`**

Delete this object from the `"links"` array (it sits after the `"User Reports"` Card Break,
whose `link_count` is already `0` — no counter to adjust):

```json
  {
   "dependencies": "",
   "hidden": 0,
   "is_query_report": 0,
   "label": "My Work",
   "link_count": 0,
   "link_to": "my-work",
   "link_type": "Page",
   "onboard": 1,
   "type": "Link"
  },
```

- [ ] **Step 4: Validate JSON still parses**

Run:
```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/vernon_tasks
python3 -c "import json; json.load(open('workspace/my_tasks/my_tasks.json')); json.load(open('task/workspace/vernon_tasks/vernon_tasks.json')); print('json ok')"
```
Expected: `json ok` (no `JSONDecodeError` — confirms no dangling/again commas).

- [ ] **Step 5: Update the stale comment in `vt_navbar.js`**

Find (line ~157-158):

```javascript
/* A route is "under" a nav item when it equals it or is a sub-path of it,
   so /app/my-work/123 still highlights the /app/my-work item. */
```

Replace the example with a live route:

```javascript
/* A route is "under" a nav item when it equals it or is a sub-path of it,
   so /app/vt-projects/123 still highlights the /app/vt-projects item. */
```

- [ ] **Step 6: Commit**

```bash
git add setup_website.py workspace/my_tasks/my_tasks.json task/workspace/vernon_tasks/vernon_tasks.json public/js/vt_navbar.js
git commit -m "chore(nav): hapus referensi my-work dari seed navbar & workspace"
```

---

## Task 5: Migration patch for existing installs (TDD)

**Files:**
- Test: `tests/test_retire_my_work_patch.py` (new)
- Create: `patches/v1_x/retire_my_work_page.py`
- Modify: `patches.txt`

- [ ] **Step 1: Write the patch test — verify it FAILS**

Create `tests/test_retire_my_work_patch.py`:

```python
"""Patch test: retire_my_work_page removes the orphaned Page + navbar row,
leaves vt-home intact, and is idempotent. PRD: merge-my-work-into-vt-home.
"""
import frappe
import unittest

_PATCH = "vernon_tasks.patches.v1_x.retire_my_work_page"
_PAGE = "my-work"
_ROUTE = "/app/my-work"
_VT_SETTINGS = "VT Settings"


def _run_patch():
    frappe.get_attr(_PATCH + ".execute")()


def _navbar_routes():
    doc = frappe.get_single(_VT_SETTINGS)
    return [(r.route or "") for r in doc.get("navbar_items") or []]


def _seed_old_install():
    """Recreate the pre-merge state: a my-work Page doc + a navbar row."""
    if not frappe.db.exists("Page", _PAGE):
        frappe.get_doc({
            "doctype": "Page",
            "name": _PAGE,
            "page_name": _PAGE,
            "title": "My Work",
            "module": "Task",
        }).insert(ignore_permissions=True)
    if _ROUTE not in _navbar_routes():
        settings = frappe.get_single(_VT_SETTINGS)
        settings.append("navbar_items", {
            "label": "My Work",
            "route": _ROUTE,
            "icon": "check-circle",
            "is_group": 0,
            "parent_group": "",
            "enabled": 1,
        })
        settings.save(ignore_permissions=True)


class TestRetireMyWorkPatch(unittest.TestCase):
    def test_removes_page_and_navbar_idempotently(self):  # PRD: merge-my-work-into-vt-home
        _seed_old_install()
        self.assertTrue(frappe.db.exists("Page", _PAGE))
        self.assertIn(_ROUTE, _navbar_routes())

        _run_patch()

        # Page + navbar row gone; vt-home untouched.
        self.assertFalse(frappe.db.exists("Page", _PAGE))
        self.assertNotIn(_ROUTE, _navbar_routes())
        self.assertTrue(frappe.db.exists("Page", "vt-home"))

        # Re-run: no error, still gone.
        _run_patch()
        self.assertFalse(frappe.db.exists("Page", _PAGE))
        self.assertNotIn(_ROUTE, _navbar_routes())
```

Run:
```bash
docker exec frappe-backend-1 bench --site task.localhost run-tests \
  --module vernon_tasks.tests.test_retire_my_work_patch
```
Expected: FAIL — `ModuleNotFoundError: vernon_tasks.patches.v1_x.retire_my_work_page`.

- [ ] **Step 2: Write the patch**

Create `patches/v1_x/retire_my_work_page.py`:

```python
"""Retire the standalone "my-work" desk Page (merged into vt-home).

The My Work page (My Day / What To Do Today / My Blocked Tasks + Start /
Submit-for-Review actions) became the "Tugas Saya" tab inside vt-home, and the
standalone /app/my-work route is removed. Two records outlive a code/dir delete
on an existing install and must be migrated once on `bench migrate`:

  1. The `Page` doc named "my-work" — standard pages are NOT auto-deleted when
     their app directory is removed.
  2. The VT Settings.navbar_items child row routing to /app/my-work — the seed
     (_NAVBAR_ITEMS) only governs fresh installs (ensure_navbar_seeded runs only
     when the navbar is empty).

Idempotent: a re-run finds the Page already gone and no /app/my-work navbar row,
so nothing changes and no save is issued.
"""
import frappe

_MY_WORK_PAGE = "my-work"
_MY_WORK_ROUTE = "/app/my-work"
_VT_SETTINGS = "VT Settings"
_NAVBAR_FIELD = "navbar_items"


def _drop_page() -> None:
    """Delete the orphaned standard Page doc if it still exists."""
    if frappe.db.exists("Page", _MY_WORK_PAGE):
        frappe.delete_doc("Page", _MY_WORK_PAGE, ignore_permissions=True, force=True)


def _drop_navbar_row() -> None:
    """Remove the VT Settings navbar row pointing at /app/my-work, preserving order."""
    doc = frappe.get_single(_VT_SETTINGS)
    survivors = []
    changed = False
    for row in doc.get(_NAVBAR_FIELD) or []:
        if (row.route or "") == _MY_WORK_ROUTE:
            changed = True
            continue
        survivors.append(row)
    if changed:
        doc.set(_NAVBAR_FIELD, survivors)
        doc.save(ignore_permissions=True)


def execute():
    _drop_page()
    _drop_navbar_row()
    frappe.db.commit()
```

- [ ] **Step 3: Register the patch in `patches.txt`**

Append after the last `v1_x` entry (`...promote_brand_nav_toplevel`):

```
vernon_tasks.patches.v1_x.retire_my_work_page
```

- [ ] **Step 4: Run the patch test — verify it PASSES**

Run:
```bash
docker exec frappe-backend-1 bench --site task.localhost run-tests \
  --module vernon_tasks.tests.test_retire_my_work_patch
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add patches/v1_x/retire_my_work_page.py patches.txt tests/test_retire_my_work_patch.py
git commit -m "feat(patch): retire_my_work_page hapus Page + row navbar lama"
```

---

## Task 6: Delete the old page directory + full verification

**Files:**
- Delete: `task/page/my_work/` (entire directory)

- [ ] **Step 1: Confirm no live code references the page module path**

Run:
```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks/vernon_tasks
grep -rn "task.page.my_work" --include="*.py" --include="*.js" . | grep -v "task/page/my_work/"
```
Expected: **no output** (Task 1 retargeted the test; nothing else imports the page module).
If anything prints, fix that reference before deleting.

- [ ] **Step 2: Delete the directory**

```bash
git rm -r task/page/my_work
```

- [ ] **Step 3: Run the migration (applies the patch on this site)**

```bash
docker exec frappe-backend-1 bench --site task.localhost migrate
```
Expected: migrate completes; `retire_my_work_page` runs once; `/app/my-work` Page removed.

- [ ] **Step 4: Run the full affected test set**

```bash
docker exec frappe-backend-1 bench --site task.localhost run-tests \
  --module vernon_tasks.task.api.test_my_work_focus && \
docker exec frappe-backend-1 bench --site task.localhost run-tests \
  --module vernon_tasks.tests.test_retire_my_work_patch && \
docker exec frappe-backend-1 bench --site task.localhost run-tests \
  --module vernon_tasks.tests.test_focus_panel_wiring && \
docker exec frappe-backend-1 bench --site task.localhost run-tests \
  --module vernon_tasks.tests.test_flatten_nav_patch
```
Expected: all PASS. (`test_flatten_nav_patch` is the sibling nav patch — confirms no regression.)

- [ ] **Step 5: Confirm the route is dead**

Open `/app/my-work` in the browser. Expected: Frappe "Page my-work not found" (route retired).
Open `/app/vt-home` → Tugas Saya tab works.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(my-work): hapus desk Page my-work (jadi tab vt-home)"
```

---

## Task 7: Docs + branch finish

- [ ] **Step 1: Update `.wolf` project memory**

Append to `/Users/erickmo/Desktop/Project/.wolf/memory.md` a one-line session entry, and
update `/Users/erickmo/Desktop/Project/.wolf/anatomy.md`: remove the `task/page/my_work/*`
entries, add `public/js/vt_focus_panel.js` and the two new test files.

- [ ] **Step 2: Update auto-memory pointer**

The merged-dashboard memory (`project_dashboard_vt_home.md`) now has a 3rd tab. Update it to
note `vt-home = 3 tabs: Beranda | Tugas Saya (ex my-work page) | Tim`, and add a memory that
`/app/my-work` is retired (patch `retire_my_work_page`).

- [ ] **Step 3: Finish the branch**

Use the superpowers:finishing-a-development-branch skill to merge `refactor/merge-my-work-into-vt-home`
into `master` (no-ff), push, and delete the branch — or open a PR if preferred.

---

## Self-Review

**Spec coverage:**
- §3 Frontend tab → Task 3 ✓ ; extracted asset → Task 2 ✓
- §4 Move 5 funcs → Task 1 ✓
- §5 Retire (seed, shortcuts, page dir, patch, comment) → Tasks 4, 5, 6 ✓
- §6 Tests (retarget, patch test, wiring guard) → Tasks 1, 5, 3 ✓
- §7 Out of scope respected (no redirect, no Tim/onboarding/Beranda changes) ✓

**Placeholder scan:** none — all steps carry full code + exact commands.

**Type/name consistency:** API methods `vernon_tasks.task.api.my_work.{get_my_day,get_what_to_do_today,get_my_blocked_tasks,start_task,submit_for_review}` used identically in `vt_focus_panel.js` (MW_API), Task 1 funcs, and tests. Tab key `tugas-saya` and `window.vt_render_focus_panel` consistent across vt_home.js + asset + wiring test.

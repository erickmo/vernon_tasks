# Workspace Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add in-page nav bars to all 4 custom pages and fix missing shortcuts in 2 workspace JSONs.

**Architecture:** A shared public JS file (`page_nav.js`) exports `vt_render_page_nav(page, links)`, injected globally via `hooks.py app_include_js`. Each page calls this once after `make_app_page`. Workspace JSONs are patched directly — no Python changes beyond hooks.py.

**Tech Stack:** Frappe Framework JS, jQuery (via Frappe), Frappe Workspace JSON fixtures

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `vernon_tasks/public/js/page_nav.js` | CREATE | Shared nav bar renderer |
| `vernon_tasks/hooks.py` | MODIFY | Register public JS |
| `vernon_tasks/workspace/my_projects.json` | MODIFY | Add Leader Dashboard shortcut |
| `vernon_tasks/workspace/overview.json` | MODIFY | Add Leader Review shortcut |
| `vernon_tasks/task/page/my_work/my_work.js` | MODIFY | Call `vt_render_page_nav` |
| `vernon_tasks/task/page/my_dashboard/my_dashboard.js` | MODIFY | Call `vt_render_page_nav` |
| `vernon_tasks/task/page/leader_review/leader_review.js` | MODIFY | Call `vt_render_page_nav` |
| `vernon_tasks/task/page/leader_dashboard/leader_dashboard.js` | MODIFY | Call `vt_render_page_nav` |

---

## Task 1: Create shared nav bar utility

**Files:**
- Create: `vernon_tasks/public/js/page_nav.js`

No automated tests for this file (DOM-only, Frappe test infra not set up for JS unit tests). Visual verification in Task 5.

- [ ] **Step 1: Create the public/js directory**

```bash
mkdir -p /path/to/apps/vernon_tasks/vernon_tasks/public/js
```

Replace `/path/to/apps` with your actual bench apps path.

- [ ] **Step 2: Create `vernon_tasks/public/js/page_nav.js`**

```js
/**
 * vt_render_page_nav — renders a small nav bar at the top of a Frappe page.
 *
 * @param {Object} page  - the Frappe page object from frappe.ui.make_app_page()
 * @param {Array}  links - array of { label: string, route: string, icon: string }
 *                         route examples: "workspace/My Tasks", "my-work", "my-dashboard"
 */
window.vt_render_page_nav = function (page, links) {
    const nav = $('<div class="vt-page-nav"></div>').css({
        display: "flex",
        gap: "8px",
        alignItems: "center",
        padding: "8px 20px",
        background: "var(--subtle-bg)",
        borderBottom: "1px solid var(--border-color)",
        marginBottom: "4px",
        flexWrap: "wrap",
    });

    links.forEach(function (link) {
        const icon_html = link.icon
            ? `<svg class="icon icon-sm" style="margin-right:4px;"><use href="#icon-${link.icon}"></use></svg>`
            : "";
        const btn = $(`<button class="btn btn-xs btn-default">${icon_html}${__(link.label)}</button>`);
        btn.on("click", function () {
            frappe.set_route(link.route);
        });
        nav.append(btn);
    });

    // Prepend to page.main so it appears above the page container
    page.main.prepend(nav);
};
```

- [ ] **Step 3: Commit**

```bash
git add vernon_tasks/public/js/page_nav.js
git commit -m "feat(nav): add shared vt_render_page_nav utility"
```

---

## Task 2: Register public JS in hooks.py

**Files:**
- Modify: `vernon_tasks/hooks.py`

- [ ] **Step 1: Open `vernon_tasks/hooks.py` and add `app_include_js`**

Add this block after `app_version = app_version` (before `required_apps`):

```python
app_include_js = ["/assets/vernon_tasks/js/page_nav.js"]
```

The full top of the file should look like:

```python
from . import __version__ as app_version

app_name = "vernon_tasks"
app_title = "Vernon Tasks"
app_publisher = "Vernon Corp"
app_description = "Task and project management system with OKR, PDCA, and Agile"
app_email = "dev@vernoncorp.com"
app_license = "mit"
app_version = app_version

app_include_js = ["/assets/vernon_tasks/js/page_nav.js"]

required_apps = []
```

- [ ] **Step 2: Build assets so Frappe copies the JS to `/assets/`**

```bash
bench build --app vernon_tasks
```

Expected output contains: `✓ Built vernon_tasks`

If `bench` is not on PATH, run from your bench directory: `./env/bin/bench build --app vernon_tasks`

- [ ] **Step 3: Commit**

```bash
git add vernon_tasks/hooks.py
git commit -m "feat(nav): register page_nav.js as app_include_js"
```

---

## Task 3: Fix workspace shortcuts

**Files:**
- Modify: `vernon_tasks/workspace/my_projects.json`
- Modify: `vernon_tasks/workspace/overview.json`

### 3a — My Projects: add Leader Dashboard shortcut

- [ ] **Step 1: Open `vernon_tasks/workspace/my_projects.json`**

Find the `"shortcuts"` array. It currently has 7 entries ending with `"Review Schedule"`.

- [ ] **Step 2: Append the Leader Dashboard shortcut**

Add this object as the last entry in the `"shortcuts"` array:

```json
{
  "color": "Orange",
  "icon": "bar-chart",
  "label": "Leader Dashboard",
  "link_to": "leader-dashboard",
  "type": "Page"
}
```

The complete `"shortcuts"` array should end with:

```json
    ...
    {
      "color": "Grey",
      "icon": "calendar",
      "label": "Review Schedule",
      "link_to": "What To Do Today",
      "type": "Report"
    },
    {
      "color": "Orange",
      "icon": "bar-chart",
      "label": "Leader Dashboard",
      "link_to": "leader-dashboard",
      "type": "Page"
    }
  ]
```

### 3b — Overview: add Leader Review shortcut

- [ ] **Step 3: Open `vernon_tasks/workspace/overview.json`**

Find the `"shortcuts"` array. It currently has 9 entries ending with `"Leader Dashboard"`.

- [ ] **Step 4: Append the Leader Review shortcut**

Add this object as the last entry in the `"shortcuts"` array:

```json
{
  "color": "Blue",
  "icon": "check-circle",
  "label": "Leader Review",
  "link_to": "leader-review",
  "type": "Page"
}
```

- [ ] **Step 5: Reload fixtures in Frappe**

```bash
bench --site [your-site-name] migrate
```

Or for immediate workspace reload without migrate:

```bash
bench --site [your-site-name] reload-doc Task Workspace My\ Projects
bench --site [your-site-name] reload-doc Project Workspace Overview
```

- [ ] **Step 6: Commit**

```bash
git add vernon_tasks/workspace/my_projects.json vernon_tasks/workspace/overview.json
git commit -m "feat(workspace): add Leader Dashboard and Leader Review shortcuts"
```

---

## Task 4: Add nav bar to Member pages

**Files:**
- Modify: `vernon_tasks/task/page/my_work/my_work.js`
- Modify: `vernon_tasks/task/page/my_dashboard/my_dashboard.js`

### 4a — my_work.js

- [ ] **Step 1: Open `vernon_tasks/task/page/my_work/my_work.js`**

Find this block (lines 2–6):

```js
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: "My Work",
        single_column: true,
    });
```

- [ ] **Step 2: Add nav bar call immediately after `make_app_page`**

Insert after the closing `});` of `make_app_page`:

```js
    vt_render_page_nav(page, [
        { label: "My Tasks", route: "workspace/My Tasks", icon: "home" },
        { label: "My Dashboard", route: "my-dashboard", icon: "bar-chart" },
    ]);
```

Result should look like:

```js
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: "My Work",
        single_column: true,
    });

    vt_render_page_nav(page, [
        { label: "My Tasks", route: "workspace/My Tasks", icon: "home" },
        { label: "My Dashboard", route: "my-dashboard", icon: "bar-chart" },
    ]);

    page.add_button(__("Refresh"), () => render_all(), { icon: "refresh" });
```

### 4b — my_dashboard.js

- [ ] **Step 3: Open `vernon_tasks/task/page/my_dashboard/my_dashboard.js`**

Find the same `make_app_page` block (lines 2–6). Insert the same pattern after it:

```js
    vt_render_page_nav(page, [
        { label: "My Work", route: "my-work", icon: "book-open" },
        { label: "My Tasks", route: "workspace/My Tasks", icon: "home" },
    ]);
```

Result:

```js
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: "My Dashboard",
        single_column: true,
    });

    vt_render_page_nav(page, [
        { label: "My Work", route: "my-work", icon: "book-open" },
        { label: "My Tasks", route: "workspace/My Tasks", icon: "home" },
    ]);

    page.add_button(__("Refresh"), () => render_all(), { icon: "refresh" });
```

- [ ] **Step 4: Commit**

```bash
git add vernon_tasks/task/page/my_work/my_work.js \
        vernon_tasks/task/page/my_dashboard/my_dashboard.js
git commit -m "feat(nav): add page nav bar to member pages"
```

---

## Task 5: Add nav bar to Leader pages

**Files:**
- Modify: `vernon_tasks/task/page/leader_review/leader_review.js`
- Modify: `vernon_tasks/task/page/leader_dashboard/leader_dashboard.js`

### 5a — leader_review.js

- [ ] **Step 1: Open `vernon_tasks/task/page/leader_review/leader_review.js`**

Find the `make_app_page` block (lines 2–6). Insert after it:

```js
    vt_render_page_nav(page, [
        { label: "My Projects", route: "workspace/My Projects", icon: "home" },
        { label: "Leader Dashboard", route: "leader-dashboard", icon: "bar-chart" },
    ]);
```

Result:

```js
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: "Leader Review",
        single_column: true,
    });

    vt_render_page_nav(page, [
        { label: "My Projects", route: "workspace/My Projects", icon: "home" },
        { label: "Leader Dashboard", route: "leader-dashboard", icon: "bar-chart" },
    ]);

    page.add_button(__("Refresh"), () => render_active_tab(), { icon: "refresh" });
```

### 5b — leader_dashboard.js

- [ ] **Step 2: Open `vernon_tasks/task/page/leader_dashboard/leader_dashboard.js`**

Find the `make_app_page` block (lines 2–6). Insert after it:

```js
    vt_render_page_nav(page, [
        { label: "Leader Review", route: "leader-review", icon: "check-circle" },
        { label: "My Projects", route: "workspace/My Projects", icon: "home" },
    ]);
```

Result:

```js
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: "Leader Dashboard",
        single_column: true,
    });

    vt_render_page_nav(page, [
        { label: "Leader Review", route: "leader-review", icon: "check-circle" },
        { label: "My Projects", route: "workspace/My Projects", icon: "home" },
    ]);

    page.add_button(__("Refresh"), () => render_all(), { icon: "refresh" });
```

- [ ] **Step 3: Commit**

```bash
git add vernon_tasks/task/page/leader_review/leader_review.js \
        vernon_tasks/task/page/leader_dashboard/leader_dashboard.js
git commit -m "feat(nav): add page nav bar to leader pages"
```

---

## Task 6: Visual verification

No automated JS tests. Verify manually:

- [ ] **Step 1: Restart bench to pick up asset changes**

```bash
bench restart
```

- [ ] **Step 2: Open browser, log in as a VT Member user**

Navigate to `My Tasks` workspace. Verify shortcut list matches spec.

- [ ] **Step 3: Click "My Work" shortcut**

Verify: nav bar appears at top with buttons `My Tasks` and `My Dashboard`. Clicking each routes correctly.

- [ ] **Step 4: Click "My Dashboard" from nav bar**

Verify: nav bar shows `My Work` and `My Tasks`. Both buttons route correctly.

- [ ] **Step 5: Log in as a VT Leader user**

Navigate to `My Projects` workspace. Verify `Leader Dashboard` shortcut is present.

- [ ] **Step 6: Click "Leader Review"**

Verify nav bar: `My Projects` and `Leader Dashboard`. Both route correctly.

- [ ] **Step 7: Click "Leader Dashboard" from nav bar**

Verify nav bar: `Leader Review` and `My Projects`. Both route correctly.

- [ ] **Step 8: Log in as a VT Manager user**

Navigate to `Overview` workspace. Verify `Leader Review` shortcut is present.

- [ ] **Step 9: Click "Leader Review" shortcut**

Verify it routes to the Leader Review page correctly.

---

## Self-Review Notes

**Spec coverage check:**
- ✅ Workspace shortcut fixes — My Projects (Task 3a), Overview (Task 3b)
- ✅ Shared nav utility — Task 1
- ✅ hooks.py registration — Task 2
- ✅ my_work nav — Task 4a
- ✅ my_dashboard nav — Task 4b
- ✅ leader_review nav — Task 5a
- ✅ leader_dashboard nav — Task 5b
- ✅ Visual verification — Task 6

**No placeholders found.** All steps have exact code or commands.

**Type consistency:** `vt_render_page_nav` used consistently across Tasks 1, 4, 5. Route strings consistent with Frappe conventions (`workspace/My Tasks`, `my-work`, `my-dashboard`, etc).

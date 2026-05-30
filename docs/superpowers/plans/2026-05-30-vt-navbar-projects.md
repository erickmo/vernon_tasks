# Editable Global Navbar + Projects Cards Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a global "navbar2" under the desk navbar whose menu items are editable from VT Settings (default Home → /app/vt-home, Project → /app/vt-projects), plus a new `vt-projects` desk Page listing projects as cards.

**Architecture:** Menu items live in a new child doctype `VT Navbar Item` on the single doctype `VT Settings`. A Frappe `extend_bootinfo` hook injects them into `frappe.boot.vt_navbar_items` (with a hardcoded default when empty). A global `app_include_js` script renders `.vt-navbar2` on every desk page. The projects page reuses the existing `dashboard.my_projects` API. No Frappe core files touched.

**Tech Stack:** Frappe Framework (Python), Frappe Desk JS, jQuery, CSS.

**Working dir:** repo root `/Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks` (note: the app package is at `vernon_tasks/`, docs at repo-root `docs/`). Bench runs in Docker: `docker exec frappe-backend-1 bench --site task.localhost <cmd>`.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `vernon_tasks/vt_settings/doctype/vt_navbar_item/{__init__.py,vt_navbar_item.json,vt_navbar_item.py}` | Child doctype: one menu link |
| `vernon_tasks/vt_settings/doctype/vt_settings/vt_settings.json` | + Navbar Menu section + `navbar_items` table field |
| `vernon_tasks/boot.py` | `extend_bootinfo` injects `vt_navbar_items` |
| `vernon_tasks/public/js/vt_navbar.js` | Global navbar2 renderer |
| `vernon_tasks/public/css/vt_home.css` | + `.vt-navbar2` styles |
| `vernon_tasks/hooks.py` | extend_bootinfo, app_include_js, fixtures |
| `vernon_tasks/task/page/vt_projects/{__init__.py,vt_projects.json,vt_projects.js,test_vt_projects.py}` | Projects cards Page |
| `vernon_tasks/boot.py` test → `vernon_tasks/test_boot.py` | extend_bootinfo unit test |

---

### Task 1: VT Navbar Item child doctype + VT Settings table field

**Files:**
- Create: `vernon_tasks/vt_settings/doctype/vt_navbar_item/__init__.py` (empty)
- Create: `vernon_tasks/vt_settings/doctype/vt_navbar_item/vt_navbar_item.json`
- Create: `vernon_tasks/vt_settings/doctype/vt_navbar_item/vt_navbar_item.py`
- Modify: `vernon_tasks/vt_settings/doctype/vt_settings/vt_settings.json`

- [ ] **Step 1: Create the package marker**

`vernon_tasks/vt_settings/doctype/vt_navbar_item/__init__.py` — empty file.

- [ ] **Step 2: Create the child doctype JSON**

`vernon_tasks/vt_settings/doctype/vt_navbar_item/vt_navbar_item.json`:

```json
{
 "actions": [],
 "creation": "2026-05-30 00:00:00.000000",
 "doctype": "DocType",
 "editable_grid": 1,
 "engine": "InnoDB",
 "field_order": ["label", "route", "icon", "enabled"],
 "fields": [
  {"fieldname": "label", "fieldtype": "Data", "label": "Label", "reqd": 1, "in_list_view": 1},
  {"fieldname": "route", "fieldtype": "Data", "label": "Route", "reqd": 1, "in_list_view": 1, "description": "Desk route, e.g. /app/vt-home"},
  {"fieldname": "icon", "fieldtype": "Data", "label": "Icon", "in_list_view": 1, "description": "Frappe icon name (optional), e.g. home"},
  {"fieldname": "enabled", "fieldtype": "Check", "label": "Enabled", "default": "1", "in_list_view": 1}
 ],
 "istable": 1,
 "modified": "2026-05-30 00:00:00.000000",
 "modified_by": "Administrator",
 "module": "Vt Settings",
 "name": "VT Navbar Item",
 "owner": "Administrator",
 "permissions": [],
 "sort_field": "modified",
 "sort_order": "DESC"
}
```

- [ ] **Step 3: Create the controller**

`vernon_tasks/vt_settings/doctype/vt_navbar_item/vt_navbar_item.py`:

```python
# Child doctype: a single navbar2 menu link. No behaviour beyond storage.
from frappe.model.document import Document


class VTNavbarItem(Document):
    pass
```

- [ ] **Step 4: Add the table field to VT Settings**

In `vernon_tasks/vt_settings/doctype/vt_settings/vt_settings.json`:

(a) In `field_order`, after `"portal_dashboard_v2_enabled"`, add:
```json
    "navbar_section",
    "navbar_items"
```

(b) In `fields` array, after the `portal_dashboard_v2_enabled` field object (the last field), add:
```json
    {
      "fieldname": "navbar_section",
      "fieldtype": "Section Break",
      "label": "Navbar Menu"
    },
    {
      "fieldname": "navbar_items",
      "fieldtype": "Table",
      "label": "Navbar Items",
      "options": "VT Navbar Item",
      "description": "Menu links shown in the global navbar2 across desk pages. Empty = default (Home, Project)."
    }
```
Be careful to keep valid JSON (add a comma after the previous last field object's closing brace).

- [ ] **Step 5: Migrate + verify**

Run:
```bash
docker exec frappe-backend-1 bench --site task.localhost migrate
```
Then verify both doctype and field exist:
```bash
docker exec frappe-backend-1 bench --site task.localhost execute frappe.client.get_count --kwargs '{"doctype":"DocType","filters":{"name":"VT Navbar Item"}}'
docker exec frappe-backend-1 bench --site task.localhost execute frappe.get_meta --kwargs '{"doctype":"VT Settings"}' 2>&1 | grep -c navbar_items
```
Expected: count 1, and grep finds navbar_items.

- [ ] **Step 6: Commit**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks
git add vernon_tasks/vt_settings/doctype/vt_navbar_item/ vernon_tasks/vt_settings/doctype/vt_settings/vt_settings.json
git commit -m "feat(navbar): doctype VT Navbar Item + tabel navbar_items di VT Settings"
```

---

### Task 2: extend_bootinfo + hooks wire + unit test

**Files:**
- Create: `vernon_tasks/boot.py`
- Create: `vernon_tasks/test_boot.py`
- Modify: `vernon_tasks/hooks.py`

- [ ] **Step 1: Write the failing test**

`vernon_tasks/test_boot.py`:

```python
# Tests for navbar2 boot injection. Spec: docs/superpowers/specs/2026-05-30-vt-navbar-projects-design.html
import frappe
import unittest

from vernon_tasks.boot import extend_bootinfo, DEFAULT_NAVBAR


class _Boot(dict):
    # bootinfo behaves like an attr-accessible dict in Frappe; emulate the attribute set.
    def __getattr__(self, k):
        return self[k]

    def __setattr__(self, k, v):
        self[k] = v


class TestNavbarBoot(unittest.TestCase):
    def setUp(self):
        self.settings = frappe.get_single("VT Settings")
        self.settings.set("navbar_items", [])
        self.settings.save(ignore_permissions=True)

    def test_defaults_when_empty(self):
        boot = _Boot()
        extend_bootinfo(boot)
        self.assertEqual(boot.vt_navbar_items, DEFAULT_NAVBAR)

    def test_returns_enabled_rows_in_order(self):
        self.settings.append("navbar_items", {"label": "A", "route": "/app/a", "enabled": 1})
        self.settings.append("navbar_items", {"label": "B", "route": "/app/b", "enabled": 0})
        self.settings.append("navbar_items", {"label": "C", "route": "/app/c", "enabled": 1})
        self.settings.save(ignore_permissions=True)
        boot = _Boot()
        extend_bootinfo(boot)
        labels = [r["label"] for r in boot.vt_navbar_items]
        self.assertEqual(labels, ["A", "C"])  # B disabled, order by idx
```

- [ ] **Step 2: Create boot.py**

`vernon_tasks/boot.py`:

```python
# extend_bootinfo hook: inject the editable navbar2 menu so desk JS can read
# frappe.boot.vt_navbar_items without an extra HTTP round-trip.
import frappe

# Shown out-of-box when VT Settings.navbar_items is empty.
DEFAULT_NAVBAR = [
    {"label": "Home", "route": "/app/vt-home", "icon": "home"},
    {"label": "Project", "route": "/app/vt-projects", "icon": "folder-normal"},
]


def extend_bootinfo(bootinfo):
    rows = frappe.get_all(
        "VT Navbar Item",
        filters={"parenttype": "VT Settings", "enabled": 1},
        fields=["label", "route", "icon"],
        order_by="idx asc",
    )
    bootinfo.vt_navbar_items = rows or DEFAULT_NAVBAR
```

- [ ] **Step 3: Wire the hook**

In `vernon_tasks/hooks.py`, add a top-level line near the other hooks (e.g. after `app_include_css`):

```python
extend_bootinfo = "vernon_tasks.boot.extend_bootinfo"
```

- [ ] **Step 4: Run the test**

```bash
docker exec frappe-backend-1 bench --site task.localhost run-tests --module vernon_tasks.test_boot
```
Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks
git add vernon_tasks/boot.py vernon_tasks/test_boot.py vernon_tasks/hooks.py
git commit -m "feat(navbar): extend_bootinfo inject vt_navbar_items (default bila kosong)"
```

---

### Task 3: Global navbar2 renderer + CSS

**Files:**
- Create: `vernon_tasks/public/js/vt_navbar.js`
- Modify: `vernon_tasks/public/css/vt_home.css` (append)
- Modify: `vernon_tasks/hooks.py` (app_include_js)

- [ ] **Step 1: Create vt_navbar.js**

`vernon_tasks/public/js/vt_navbar.js`:

```javascript
/* vt_navbar.js — global "navbar2" rendered on every desk page.
   Reads frappe.boot.vt_navbar_items (injected by extend_bootinfo);
   falls back to an inline default. Presentation only. */

const VT_NAVBAR_ID = "vt-navbar2";
const VT_NAV_DEFAULT = [
    { label: "Home", route: "/app/vt-home", icon: "home" },
    { label: "Project", route: "/app/vt-projects", icon: "folder-normal" },
];
const VT_NAV_POLL_TRIES = 25;
const VT_NAV_POLL_MS = 200;

$(document).ready(function () {
    vt_navbar_wait_for_desk(VT_NAV_POLL_TRIES);
});

function vt_navbar_wait_for_desk(tries) {
    if ($(".navbar").length) {
        vt_navbar_render();
        if (frappe.router && frappe.router.on) frappe.router.on("change", vt_navbar_update_active);
        return;
    }
    if (tries > 0) setTimeout(() => vt_navbar_wait_for_desk(tries - 1), VT_NAV_POLL_MS);
}

function vt_navbar_items() {
    return (frappe.boot && frappe.boot.vt_navbar_items) || VT_NAV_DEFAULT;
}

function vt_navbar_render() {
    if (document.getElementById(VT_NAVBAR_ID)) { vt_navbar_update_active(); return; }
    const bar = $(`<div id="${VT_NAVBAR_ID}" class="vt-navbar2"></div>`);
    vt_navbar_items().forEach((it) => {
        const route = frappe.utils.escape_html(it.route || "");
        const link = $(`<a class="vt-nav-item" data-route="${route}">${frappe.utils.escape_html(it.label || "")}</a>`);
        link.on("click", (e) => { e.preventDefault(); frappe.set_route(it.route); });
        bar.append(link);
    });
    $(".navbar").first().after(bar);
    vt_navbar_update_active();
}

function vt_navbar_update_active() {
    const path = window.location.pathname;
    $(`#${VT_NAVBAR_ID} .vt-nav-item`).each(function () {
        const r = $(this).data("route");
        const active = r && (path === r || path.indexOf(r + "/") === 0);
        $(this).toggleClass("active", !!active);
    });
}
```

- [ ] **Step 2: Append .vt-navbar2 styles to vt_home.css**

Append to the END of `vernon_tasks/public/css/vt_home.css`:

```css

/* ── navbar2 (global desk sub-nav) ── */
.vt-navbar2 {
  display: flex;
  gap: 4px;
  align-items: center;
  padding: 6px 16px;
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
  font-family: 'DM Sans', system-ui, sans-serif;
}
.vt-navbar2 .vt-nav-item {
  font-size: 13px;
  font-weight: 500;
  color: #475569;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  text-decoration: none;
  transition: background .15s, color .15s;
}
.vt-navbar2 .vt-nav-item:hover { background: #f1f5f9; color: #0f172a; }
.vt-navbar2 .vt-nav-item.active { background: rgba(37,99,235,0.10); color: #2563eb; }
```

- [ ] **Step 3: Wire app_include_js**

In `vernon_tasks/hooks.py`, change:
```python
app_include_js = ["/assets/vernon_tasks/js/page_nav.js"]
```
to:
```python
app_include_js = [
    "/assets/vernon_tasks/js/page_nav.js",
    "/assets/vernon_tasks/js/vt_navbar.js",
]
```

- [ ] **Step 4: Build + restart + verify syntax**

```bash
node --check vernon_tasks/public/js/vt_navbar.js
docker exec frappe-backend-1 bench build --app vernon_tasks
docker restart frappe-backend-1
```
(Restart required: hooks.py changed.) Manual browser check happens in Task 5.

- [ ] **Step 5: Commit**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks
git add vernon_tasks/public/js/vt_navbar.js vernon_tasks/public/css/vt_home.css vernon_tasks/hooks.py
git commit -m "feat(navbar): render navbar2 global + style + wire app_include_js"
```

---

### Task 4: vt-projects cards Page

**Files:**
- Create: `vernon_tasks/task/page/vt_projects/__init__.py` (empty)
- Create: `vernon_tasks/task/page/vt_projects/vt_projects.json`
- Create: `vernon_tasks/task/page/vt_projects/vt_projects.js`
- Create: `vernon_tasks/task/page/vt_projects/test_vt_projects.py`
- Modify: `vernon_tasks/hooks.py` (fixtures)

- [ ] **Step 1: Page JSON**

`vernon_tasks/task/page/vt_projects/vt_projects.json` (match the vt_home pattern — key order: creation, doctype, module, name, page_name, roles, title):

```json
{
 "creation": "2026-05-30 00:00:00.000000",
 "doctype": "Page",
 "module": "Task",
 "name": "vt-projects",
 "page_name": "vt-projects",
 "roles": [
  {"role": "VT Member"},
  {"role": "VT Leader"},
  {"role": "VT Manager"}
 ],
 "title": "Proyek"
}
```

- [ ] **Step 2: Empty package marker**

`vernon_tasks/task/page/vt_projects/__init__.py` — empty.

- [ ] **Step 3: Page JS**

`vernon_tasks/task/page/vt_projects/vt_projects.js`:

```javascript
/* vt_projects.js — desk page listing projects as cards.
   Reuses vernon_tasks.task.api.dashboard.my_projects. Presentation only. */

const PROJ_API = "vernon_tasks.task.api.dashboard.my_projects";
const PROJ_RISK_LABELS = { on_track: "On track", at_risk: "Berisiko", behind: "Tertinggal" };

frappe.pages["vt-projects"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: "Proyek",
        single_column: true,
    });
    page.add_button(__("Refresh"), () => render_projects(page), { icon: "refresh" });
    render_projects(page);
};

function render_projects(page) {
    const c = $('<div class="vt-home"></div>');
    page.main.empty().append(c);
    frappe.call(PROJ_API).then((r) => paint_projects(c, r.message || {}));
}

function paint_projects(c, data) {
    const led = data.led || [], member = data.member || [];
    const sec = $('<div class="vh-section"><div class="vh-section-title">Semua Proyek</div></div>');
    c.append(sec);
    if (!led.length && !member.length) {
        sec.append('<div class="vh-empty">Belum ada proyek.</div>');
        return;
    }
    const row = $('<div class="vh-row"></div>');
    sec.append(row);
    led.forEach((p) => row.append(project_card(p)));
    if (member.length) paint_member(sec, member);
}

function project_card(p) {
    const chip = `<span class="vh-chip vh-chip-${p.risk}">${PROJ_RISK_LABELS[p.risk] || p.risk}</span>`;
    const card = $(`<div class="vh-card" style="flex:1 1 240px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
            <strong>${frappe.utils.escape_html(p.name)}</strong>${chip}</div>
        <div class="vh-bar" style="margin:10px 0 6px;"><span style="width:${p.pct_done}%"></span></div>
        <div class="vh-item-meta">${frappe.utils.escape_html(p.status || "")} · ${p.open_tasks} task terbuka · ${p.blockers} blocker</div></div>`);
    card.css("cursor", "pointer").on("click", () => frappe.set_route("vt-project", p.id));
    return card;
}

function paint_member(sec, member) {
    const card = $('<div class="vh-card" style="margin-top:16px;"></div>');
    card.append('<div class="vh-lbl" style="margin-bottom:8px;">Sebagai Anggota</div>');
    member.forEach((p) => {
        const item = $(`<div class="vh-item"><span class="vh-item-title">
            ${frappe.utils.escape_html(p.name)}</span>
            <span class="vh-item-meta">${p.pct_done}% · ${p.my_open_tasks} task saya</span></div>`);
        item.css("cursor", "pointer").on("click", () => frappe.set_route("vt-project", p.id));
        card.append(item);
    });
    sec.append(card);
}
```

- [ ] **Step 4: Page test**

`vernon_tasks/task/page/vt_projects/test_vt_projects.py`:

```python
# Tests for vt-projects desk Page. Spec: docs/superpowers/specs/2026-05-30-vt-navbar-projects-design.html
import frappe
import unittest

PAGE_NAME = "vt-projects"
EXPECTED_ROLES = {"VT Member", "VT Leader", "VT Manager"}


class TestVtProjectsPage(unittest.TestCase):
    def test_page_exists(self):
        self.assertTrue(frappe.db.exists("Page", PAGE_NAME))

    def test_page_route_name(self):
        page = frappe.get_doc("Page", PAGE_NAME)
        self.assertEqual(page.page_name, PAGE_NAME)

    def test_role_gating(self):
        page = frappe.get_doc("Page", PAGE_NAME)
        roles = {r.role for r in page.roles}
        self.assertEqual(roles, EXPECTED_ROLES)
```

- [ ] **Step 5: Add fixture**

In `vernon_tasks/hooks.py` fixtures list, after the existing vt-home Page fixture line, add:
```python
    {"dt": "Page", "filters": [["name", "=", "vt-projects"]]},
```

- [ ] **Step 6: Migrate + test**

```bash
node --check vernon_tasks/task/page/vt_projects/vt_projects.js
docker exec frappe-backend-1 bench --site task.localhost migrate
docker exec frappe-backend-1 bench --site task.localhost run-tests --module vernon_tasks.task.page.vt_projects.test_vt_projects
```
Expected: 3 tests PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks
git add vernon_tasks/task/page/vt_projects/ vernon_tasks/hooks.py
git commit -m "feat(navbar): halaman vt-projects (kartu proyek) + fixture"
```

---

### Task 5: Build, restart, manual smoke, merge

- [ ] **Step 1: Full build + restart**

```bash
docker exec frappe-backend-1 bench build --app vernon_tasks
docker restart frappe-backend-1
```
Wait until `curl -s -o /dev/null -w "%{http_code}" http://task.localhost:8080/api/method/ping` returns 200.

- [ ] **Step 2: Verify boot + asset injection (authenticated curl)**

```bash
cd /tmp && rm -f c.txt
curl -s -c c.txt -X POST http://task.localhost:8080/api/method/login -H "Content-Type: application/json" -d '{"usr":"Administrator","pwd":"admin"}' -o /dev/null
curl -s -b c.txt http://task.localhost:8080/app/vt-home | grep -c "vt_navbar.js"
```
Expected: 1 (the script is injected). Also confirm the page `/app/vt-projects` HTML returns 200.

- [ ] **Step 3: Manual browser smoke**

Hard-refresh `http://task.localhost:8080/app/vt-home`. Confirm:
- A second nav bar appears under the desk navbar with "Home" and "Project".
- Clicking Project navigates to `/app/vt-projects` (cards render); Home back to `/app/vt-home`.
- Active item is highlighted per current route; no duplicate bars when navigating.
- In VT Settings, the "Navbar Menu" table is present and editable; adding a row + reload changes the menu.

- [ ] **Step 4: Run all new tests once more**

```bash
docker exec frappe-backend-1 bench --site task.localhost run-tests --module vernon_tasks.test_boot
docker exec frappe-backend-1 bench --site task.localhost run-tests --module vernon_tasks.task.page.vt_projects.test_vt_projects
```
Expected: all PASS.

- [ ] **Step 5: Merge to master**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks
git checkout master
git merge --no-ff feat/vt-navbar-projects -m "feat(navbar): navbar2 global editable + halaman vt-projects kartu"
git branch -d feat/vt-navbar-projects
```
(Do NOT push unless the user asks.)

---

## Self-Review

**Spec coverage:**
- §3 child doctype + VT Settings field → Task 1. ✅
- §5 extend_bootinfo + default → Task 2. ✅
- §6 global renderer → Task 3. ✅
- §7 vt-projects cards page → Task 4. ✅
- §9 tests (boot defaults/rows, page exists/route/roles, manual nav) → Tasks 2, 4, 5. ✅
- §10 deploy (migrate, build, restart) → Tasks 1,2,4,5. ✅

**Placeholder scan:** No TBDs; all code blocks complete.

**Type/name consistency:** Page name `vt-projects` consistent across json/js/test/fixture/boot default route. `vt_navbar_items` field name consistent in VT Settings json, boot.py query (parenttype filter), and JS `frappe.boot.vt_navbar_items`. CSS classes `.vt-navbar2`/`.vt-nav-item` consistent between vt_navbar.js and vt_home.css. `DEFAULT_NAVBAR` (py) mirrors `VT_NAV_DEFAULT` (js).

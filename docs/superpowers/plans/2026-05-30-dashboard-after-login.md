# Dashboard Page After Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After login, land users on a modern desk dashboard at `/app/vt-home` showing personal progress, projects, schedule, and quick links — styled with the login page's visual convention.

**Architecture:** A new Frappe **Page** doctype (`vt-home`) under the `vernon_tasks` app, module `Task`. The page JS is presentation-only: it calls three existing whitelisted APIs in `task/api/dashboard.py` (`me_progress`, `my_projects`, `schedule_agenda`) and renders five blocks. A scoped CSS file ports the login design tokens. Three app-owned `www/` files repoint login redirect to `/app/vt-home`. No Frappe core files are modified.

**Tech Stack:** Frappe Framework (Python), Frappe Desk JS (`frappe.ui.make_app_page`, `frappe.call`, `frappe.Chart`), vanilla DOM + jQuery (bundled in desk), CSS.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `vernon_tasks/task/page/vt_home/__init__.py` | Empty package marker |
| `vernon_tasks/task/page/vt_home/vt_home.json` | Page doctype definition + role gating |
| `vernon_tasks/task/page/vt_home/vt_home.js` | Render layer: fetch APIs, build 5 blocks |
| `vernon_tasks/public/css/vt_home.css` | Scoped `.vt-home` styles + login design tokens |
| `vernon_tasks/hooks.py` | Wire `app_include_css`; add Page fixture |
| `vernon_tasks/www/login.py` | Default `redirect_to` → `/app/vt-home` |
| `vernon_tasks/www/login.html` | JS fallback → `/app/vt-home` (fix dead `/m/dashboard`) |
| `vernon_tasks/www/index.py` | Logged-in redirect → `/app/vt-home` |
| `vernon_tasks/task/page/vt_home/test_vt_home.py` | Server test: Page exists, route name, role gating |

All API logic already exists and is tested in `task/api/dashboard.py` + its test file. No new Python business logic.

---

### Task 1: Page scaffold + route reachable

**Files:**
- Create: `vernon_tasks/task/page/vt_home/__init__.py`
- Create: `vernon_tasks/task/page/vt_home/vt_home.json`
- Create: `vernon_tasks/task/page/vt_home/vt_home.js`
- Modify: `vernon_tasks/hooks.py` (fixtures list)

- [ ] **Step 1: Create empty package marker**

Create `vernon_tasks/task/page/vt_home/__init__.py` as an empty file.

- [ ] **Step 2: Create the Page definition**

Create `vernon_tasks/task/page/vt_home/vt_home.json`:

```json
{
 "creation": "2026-05-30 00:00:00.000000",
 "doctype": "Page",
 "module": "Task",
 "name": "vt-home",
 "page_name": "vt-home",
 "standard": "Yes",
 "title": "Beranda",
 "roles": [
  {"role": "VT Member"},
  {"role": "VT Leader"},
  {"role": "VT Manager"}
 ]
}
```

- [ ] **Step 3: Create minimal page JS (skeleton only)**

Create `vernon_tasks/task/page/vt_home/vt_home.js`:

```javascript
frappe.pages["vt-home"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __("Beranda"),
        single_column: true,
    });

    const container = $('<div class="vt-home"></div>').appendTo(page.main);
    container.html('<p style="padding:20px;">Dashboard loading…</p>');
};
```

- [ ] **Step 4: Register the Page as a fixture**

In `vernon_tasks/hooks.py`, inside the `fixtures` list, add this entry right after the `Workspace` line (after line 74):

```python
    {"dt": "Page", "filters": [["name", "=", "vt-home"]]},
```

- [ ] **Step 5: Migrate + build, then verify the route loads**

Run:
```bash
bench --site task.localhost migrate
bench build --app vernon_tasks
```
Then in the browser open `http://task.localhost:8080/app/vt-home` while logged in as a VT Member.
Expected: page titled "Beranda" with text "Dashboard loading…".

- [ ] **Step 6: Commit**

```bash
git add vernon_tasks/task/page/vt_home/ vernon_tasks/hooks.py
git commit -m "feat(dashboard): scaffold halaman vt-home + daftar fixture"
```

---

### Task 2: CSS design tokens (login convention)

**Files:**
- Create: `vernon_tasks/public/css/vt_home.css`
- Modify: `vernon_tasks/hooks.py` (add `app_include_css`)

- [ ] **Step 1: Create the scoped stylesheet**

Create `vernon_tasks/public/css/vt_home.css`:

```css
/* vt_home.css — dashboard styling, ported from www/login.html convention.
   All rules scoped under .vt-home so desk UI is untouched. */
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&family=DM+Serif+Display:ital@0;1&display=swap');

.vt-home {
  --vh-navy: #0b0f1a;
  --vh-navy-2: #111827;
  --vh-blue: #2563eb;
  --vh-blue-dk: #1d4ed8;
  --vh-text-2: #64748b;
  --vh-text-3: #94a3b8;
  --vh-border: #e2e8f0;
  --vh-green: #22c55e;
  --vh-amber: #f59e0b;
  --vh-red: #dc2626;
  padding: 0 20px 48px;
  font-family: 'DM Sans', system-ui, sans-serif;
}

/* ── Hero band ── */
.vt-home .vh-hero {
  position: relative;
  overflow: hidden;
  background: var(--vh-navy);
  border-radius: 12px;
  padding: 32px 36px;
  margin: 20px 0 28px;
  animation: vhFadeUp 0.6s cubic-bezier(0.22,1,0.36,1) both;
}
.vt-home .vh-hero::before {
  content: '';
  position: absolute; inset: 0;
  background-image:
    linear-gradient(rgba(37,99,235,0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(37,99,235,0.05) 1px, transparent 1px);
  background-size: 40px 40px;
  pointer-events: none;
}
.vt-home .vh-hero::after {
  content: '';
  position: absolute; bottom: -120px; right: -80px;
  width: 420px; height: 420px; border-radius: 50%;
  background: radial-gradient(circle, rgba(37,99,235,0.16) 0%, transparent 65%);
  pointer-events: none;
}
.vt-home .vh-eyebrow {
  position: relative; z-index: 1;
  font-size: 10px; font-weight: 600; letter-spacing: 3px;
  text-transform: uppercase; color: var(--vh-blue); margin-bottom: 12px;
}
.vt-home .vh-greeting {
  position: relative; z-index: 1;
  font-family: 'DM Serif Display', Georgia, serif;
  font-weight: 400; font-size: clamp(26px, 2.6vw, 38px);
  line-height: 1.15; color: #f1f5f9; letter-spacing: -0.5px;
}
.vt-home .vh-greeting span { font-style: italic; color: rgba(241,245,249,0.55); }

/* ── Cards ── */
.vt-home .vh-row { display: flex; gap: 16px; flex-wrap: wrap; }
.vt-home .vh-card {
  background: #fff; border: 1px solid var(--vh-border); border-radius: 8px;
  padding: 18px 20px; animation: vhFadeUp 0.6s 0.1s cubic-bezier(0.22,1,0.36,1) both;
}
.vt-home .vh-stat { flex: 1 1 160px; }
.vt-home .vh-stat .vh-num {
  font-family: 'DM Serif Display', Georgia, serif; font-size: 32px; color: #0f172a;
}
.vt-home .vh-stat .vh-lbl {
  font-size: 11px; font-weight: 600; letter-spacing: 0.4px;
  text-transform: uppercase; color: var(--vh-text-2); margin-top: 4px;
}

/* ── Section headers ── */
.vt-home .vh-section { margin-top: 32px; }
.vt-home .vh-section-title {
  font-family: 'DM Serif Display', Georgia, serif; font-size: 20px;
  color: #0f172a; margin-bottom: 14px; letter-spacing: -0.2px;
}

/* ── Chips ── */
.vt-home .vh-chip {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 11px; font-weight: 600; border-radius: 999px; padding: 3px 10px;
}
.vt-home .vh-chip-on_track { background: rgba(34,197,94,0.12); color: #15803d; }
.vt-home .vh-chip-at_risk  { background: rgba(245,158,11,0.14); color: #b45309; }
.vt-home .vh-chip-behind   { background: rgba(220,38,38,0.12); color: #b91c1c; }

/* ── Lists / agenda ── */
.vt-home .vh-item {
  display: flex; justify-content: space-between; gap: 12px;
  padding: 10px 0; border-bottom: 1px solid var(--vh-border);
}
.vt-home .vh-item:last-child { border-bottom: none; }
.vt-home .vh-item-title { font-size: 13px; color: #0f172a; }
.vt-home .vh-item-meta { font-size: 12px; color: var(--vh-text-3); }
.vt-home .vh-day-label {
  font-size: 11px; font-weight: 600; letter-spacing: 0.4px;
  text-transform: uppercase; color: var(--vh-blue); margin: 16px 0 4px;
}

/* ── Progress bar ── */
.vt-home .vh-bar { height: 8px; border-radius: 4px; background: var(--vh-border); overflow: hidden; }
.vt-home .vh-bar > span { display: block; height: 100%; background: var(--vh-blue); }

/* ── Quick links ── */
.vt-home .vh-quick { display: flex; gap: 8px; flex-wrap: wrap; }
.vt-home .vh-quick button {
  font-family: 'DM Sans', sans-serif; font-size: 12px; font-weight: 500;
  color: #334155; background: #fff; border: 1px solid var(--vh-border);
  border-radius: 6px; padding: 7px 14px; cursor: pointer;
  transition: border-color .15s, box-shadow .15s;
}
.vt-home .vh-quick button:hover {
  border-color: var(--vh-blue); box-shadow: 0 0 0 3px rgba(37,99,235,0.08);
}

.vt-home .vh-empty { font-size: 13px; color: var(--vh-text-3); padding: 8px 0; }

@keyframes vhFadeUp {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

- [ ] **Step 2: Wire the stylesheet in hooks.py**

In `vernon_tasks/hooks.py`, find line 11:

```python
app_include_js = ["/assets/vernon_tasks/js/page_nav.js"]
```

Add immediately after it:

```python
app_include_css = ["/assets/vernon_tasks/css/vt_home.css"]
```

- [ ] **Step 3: Build + verify the font + tokens load**

Run:
```bash
bench build --app vernon_tasks
```
Reload `http://task.localhost:8080/app/vt-home`. In DevTools, confirm `vt_home.css` is loaded and DM fonts are fetched. (Page still shows "Dashboard loading…" — styling applies in later tasks.)

- [ ] **Step 4: Commit**

```bash
git add vernon_tasks/public/css/vt_home.css vernon_tasks/hooks.py
git commit -m "feat(dashboard): tambah CSS token gaya login (scoped vt-home)"
```

---

### Task 3: Full render layer (5 blocks)

**Files:**
- Modify: `vernon_tasks/task/page/vt_home/vt_home.js` (replace skeleton)

This task replaces the whole `vt_home.js` with the complete render layer. Each render function is ≤ 40 lines; colors/labels/limits are named constants.

- [ ] **Step 1: Replace vt_home.js with the full implementation**

Overwrite `vernon_tasks/task/page/vt_home/vt_home.js`:

```javascript
/* vt_home.js — desk dashboard render layer (presentation only).
   Calls existing whitelisted APIs in vernon_tasks.task.api.dashboard.
   No business logic: fetch → render. */

const API = "vernon_tasks.task.api.dashboard";
const RISK_LABELS = { on_track: "On track", at_risk: "Berisiko", behind: "Tertinggal" };
const NEXT_ACTIONS_SHOWN = 5;
const QUICK_LINKS = [
    { label: "Task Saya", route: "List/VT Task" },
    { label: "Task Baru", route: "vt-task/new" },
    { label: "Proyek", route: "List/VT Project" },
    { label: "Sprint", route: "List/VT Sprint" },
];

frappe.pages["vt-home"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __("Beranda"),
        single_column: true,
    });
    page.add_button(__("Refresh"), () => render_all(page), { icon: "refresh" });
    render_all(page);
};

function render_all(page) {
    const c = $('<div class="vt-home"></div>');
    page.main.empty().append(c);
    render_hero(c);
    frappe.call(`${API}.me_progress`).then((r) => render_progress(c, r.message || {}));
    frappe.call(`${API}.my_projects`).then((r) => render_projects(c, r.message || {}));
    frappe.call(`${API}.schedule_agenda`).then((r) => render_schedule(c, r.message || {}));
    render_quick_links(c);
}

function render_hero(c) {
    const name = frappe.utils.escape_html(frappe.user.full_name() || "");
    const hero = $(`
        <div class="vh-hero">
            <div class="vh-eyebrow">Workspace Vernon</div>
            <div class="vh-greeting">Selamat datang, <span>${name}</span></div>
        </div>`);
    c.append(hero);
    c.append('<div class="vh-row" data-block="workload"></div>');
}

function render_progress(c, data) {
    const w = data.workload || { open: 0, overdue: 0, due_soon: 0 };
    const cards = [
        ["Task Terbuka", w.open], ["Terlambat", w.overdue], ["Jatuh Tempo", w.due_soon],
    ];
    const row = c.find('[data-block="workload"]').empty();
    cards.forEach(([lbl, num]) => row.append(
        `<div class="vh-card vh-stat"><div class="vh-num">${num}</div>
         <div class="vh-lbl">${lbl}</div></div>`));

    const sec = $('<div class="vh-section"><div class="vh-section-title">Progres Saya</div></div>');
    render_velocity(sec, data.velocity || []);
    render_sprint(sec, data.sprint);
    render_next_actions(sec, data.next_actions || []);
    c.append(sec);
}

function render_velocity(sec, weeks) {
    const card = $('<div class="vh-card" style="margin-bottom:16px;"></div>');
    const chartEl = $('<div></div>');
    card.append('<div class="vh-lbl" style="margin-bottom:8px;">Velocity 8 minggu</div>').append(chartEl);
    sec.append(card);
    new frappe.Chart(chartEl[0], {
        type: "bar", height: 180, colors: ["#2563eb"],
        data: {
            labels: weeks.map((x) => x.week.replace(/^\d+-/, "")),
            datasets: [{ name: "Selesai", values: weeks.map((x) => x.done) }],
        },
    });
}

function render_sprint(sec, sprint) {
    if (!sprint) { sec.append('<div class="vh-empty">Tidak ada sprint aktif.</div>'); return; }
    const chip = `<span class="vh-chip vh-chip-${sprint.risk}">${RISK_LABELS[sprint.risk] || sprint.risk}</span>`;
    sec.append(`
        <div class="vh-card" style="margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <strong>${frappe.utils.escape_html(sprint.name)}</strong>${chip}
            </div>
            <div class="vh-bar" style="margin-top:10px;"><span style="width:${sprint.progress_pct}%"></span></div>
            <div class="vh-item-meta" style="margin-top:6px;">
                ${sprint.done_points}/${sprint.committed_points} poin · ${sprint.progress_pct}%</div>
        </div>`);
}

function render_next_actions(sec, actions) {
    const card = $('<div class="vh-card"></div>');
    card.append('<div class="vh-lbl" style="margin-bottom:8px;">Aksi Berikutnya</div>');
    if (!actions.length) { card.append('<div class="vh-empty">Tidak ada task aktif.</div>'); }
    actions.slice(0, NEXT_ACTIONS_SHOWN).forEach((a) => {
        const due = a.deadline ? frappe.datetime.str_to_user(a.deadline) : "—";
        const item = $(`<div class="vh-item"><span class="vh-item-title">
            ${frappe.utils.escape_html(a.title || a.id)}</span>
            <span class="vh-item-meta">${due}</span></div>`);
        item.css("cursor", "pointer").on("click", () => frappe.set_route("vt-task", a.id));
        card.append(item);
    });
    sec.append(card);
}

function render_projects(c, data) {
    const sec = $('<div class="vh-section"><div class="vh-section-title">Proyek Saya</div></div>');
    const led = data.led || [], member = data.member || [];
    if (!led.length && !member.length) { sec.append('<div class="vh-empty">Belum ada proyek.</div>'); }
    const row = $('<div class="vh-row"></div>');
    led.forEach((p) => {
        const chip = `<span class="vh-chip vh-chip-${p.risk}">${RISK_LABELS[p.risk] || p.risk}</span>`;
        const card = $(`<div class="vh-card" style="flex:1 1 240px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <strong>${frappe.utils.escape_html(p.name)}</strong>${chip}</div>
            <div class="vh-bar" style="margin:10px 0 6px;"><span style="width:${p.pct_done}%"></span></div>
            <div class="vh-item-meta">${p.open_tasks} task terbuka · ${p.blockers} blocker</div></div>`);
        card.css("cursor", "pointer").on("click", () => frappe.set_route("vt-project", p.id));
        row.append(card);
    });
    sec.append(row);
    if (member.length) render_member_projects(sec, member);
    c.append(sec);
}

function render_member_projects(sec, member) {
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

function render_schedule(c, data) {
    const sec = $('<div class="vh-section"><div class="vh-section-title">Jadwal 8 Hari</div></div>');
    const days = data.days || [];
    if (!days.length) { sec.append('<div class="vh-empty">Tidak ada agenda.</div>'); c.append(sec); return; }
    const card = $('<div class="vh-card"></div>');
    days.forEach((d) => {
        card.append(`<div class="vh-day-label">${frappe.utils.escape_html(d.label)}</div>`);
        d.items.forEach((it) => {
            const time = it.time ? `${it.time} · ` : "";
            const item = $(`<div class="vh-item"><span class="vh-item-title">
                ${frappe.utils.escape_html(it.title || it.id)}</span>
                <span class="vh-item-meta">${time}${it.type}</span></div>`);
            if (it.route) item.css("cursor", "pointer").on("click", () => frappe.set_route(it.route));
            card.append(item);
        });
    });
    sec.append(card);
    c.append(sec);
}

function render_quick_links(c) {
    const sec = $('<div class="vh-section"><div class="vh-section-title">Akses Cepat</div></div>');
    const quick = $('<div class="vh-quick"></div>');
    QUICK_LINKS.forEach((l) => {
        const btn = $(`<button>${frappe.utils.escape_html(l.label)}</button>`);
        btn.on("click", () => frappe.set_route(l.route));
        quick.append(btn);
    });
    sec.append(quick);
    c.append(sec);
}
```

- [ ] **Step 2: Build + verify all blocks render**

Run:
```bash
bench build --app vernon_tasks
```
Reload `http://task.localhost:8080/app/vt-home` as a VT Member with data. Confirm:
- Hero band (navy, serif greeting with your name, grid + glow)
- 3 workload number cards
- Velocity bar chart, active sprint bar + risk chip (or "Tidak ada sprint aktif")
- Next actions list (clickable → opens task)
- Projects cards + member list (or "Belum ada proyek")
- 8-day agenda grouped per day (or "Tidak ada agenda")
- Quick-link buttons routing correctly

- [ ] **Step 3: Verify empty states**

Log in as a user with no tasks/projects/sprint. Confirm each block shows its empty-state text and no JS errors in console.

- [ ] **Step 4: Commit**

```bash
git add vernon_tasks/task/page/vt_home/vt_home.js
git commit -m "feat(dashboard): render 5 blok dashboard dari API dashboard.py"
```

---

### Task 4: Repoint login redirect to /app/vt-home

**Files:**
- Modify: `vernon_tasks/www/login.py:12`
- Modify: `vernon_tasks/www/login.html:525`
- Modify: `vernon_tasks/www/index.py:10`

- [ ] **Step 1: Update login.py default redirect**

In `vernon_tasks/www/login.py`, change line 12 from:

```python
    redirect_to = frappe.form_dict.get("redirect_to") or "/app"
```

to:

```python
    redirect_to = frappe.form_dict.get("redirect_to") or "/app/vt-home"
```

- [ ] **Step 2: Update login.html JS fallback (fix dead /m/dashboard)**

In `vernon_tasks/www/login.html`, change line 525 from:

```javascript
  var redirect = {{ (redirect_to or "/m/dashboard") | tojson }};
```

to:

```javascript
  var redirect = {{ (redirect_to or "/app/vt-home") | tojson }};
```

- [ ] **Step 3: Update index.py logged-in redirect**

In `vernon_tasks/www/index.py`, change line 10 from:

```python
        frappe.local.flags.redirect_location = "/app"
```

to:

```python
        frappe.local.flags.redirect_location = "/app/vt-home"
```

- [ ] **Step 4: Manual verification of redirect flow**

1. Log out. Visit `http://task.localhost:8080/` → expect redirect to `/login`.
2. Log in via the form → expect to land on `/app/vt-home`.
3. While logged in, visit `http://task.localhost:8080/` → expect redirect to `/app/vt-home`.
4. Confirm `?redirect_to=/app/vt-task` still overrides correctly (open-redirect guard intact).

- [ ] **Step 5: Commit**

```bash
git add vernon_tasks/www/login.py vernon_tasks/www/login.html vernon_tasks/www/index.py
git commit -m "feat(dashboard): arahkan redirect login ke /app/vt-home"
```

---

### Task 5: Server test — Page exists, route, role gating

**Files:**
- Create: `vernon_tasks/task/page/vt_home/test_vt_home.py`

- [ ] **Step 1: Write the failing test**

Create `vernon_tasks/task/page/vt_home/test_vt_home.py`:

```python
# Tests for vt-home dashboard Page. Spec: docs/superpowers/specs/2026-05-30-dashboard-after-login-design.html
import frappe
from frappe.tests.utils import FrappeTestCase

PAGE_NAME = "vt-home"
EXPECTED_ROLES = {"VT Member", "VT Leader", "VT Manager"}


class TestVtHomePage(FrappeTestCase):
    def test_page_exists(self):
        # vt-home Page must be installed as a fixture
        self.assertTrue(frappe.db.exists("Page", PAGE_NAME))

    def test_page_route_name(self):
        # page_name drives the /app/<page_name> route
        page = frappe.get_doc("Page", PAGE_NAME)
        self.assertEqual(page.page_name, PAGE_NAME)

    def test_role_gating(self):
        # Only VT roles may open the dashboard
        page = frappe.get_doc("Page", PAGE_NAME)
        roles = {r.role for r in page.roles}
        self.assertEqual(roles, EXPECTED_ROLES)
```

- [ ] **Step 2: Run test to verify it passes**

Run:
```bash
bench --site task.localhost run-tests --module vernon_tasks.task.page.vt_home.test_vt_home
```
Expected: 3 tests PASS (Page was installed by the fixture migrate in Task 1).

If `test_page_exists` fails, run `bench --site task.localhost migrate` to reinstall fixtures, then re-run.

- [ ] **Step 3: Commit**

```bash
git add vernon_tasks/task/page/vt_home/test_vt_home.py
git commit -m "test(dashboard): verifikasi page vt-home, route, role gating"
```

---

### Task 6: Full regression + finish branch

- [ ] **Step 1: Run the existing dashboard API tests (no regression)**

Run:
```bash
bench --site task.localhost run-tests --module vernon_tasks.task.api.test_dashboard
```
Expected: all existing tests PASS. (If module name differs, locate with `ls vernon_tasks/task/api/test_dashboard*.py`.)

- [ ] **Step 2: Final manual smoke**

Reconfirm the full login → `/app/vt-home` flow and that all 5 blocks render with real data and degrade to empty states cleanly.

- [ ] **Step 3: Merge to master**

```bash
git checkout master
git merge --no-ff feat/dashboard-after-login -m "feat(dashboard): halaman dashboard setelah login di /app/vt-home"
```

- [ ] **Step 4: Clean up branch**

```bash
git branch -d feat/dashboard-after-login
```

---

## Self-Review

**Spec coverage:**
- §3 Files → Tasks 1–5 create/modify every listed file. ✅
- §4 Redirect (3 points) → Task 4 steps 1–3. ✅
- §5 Layout (5 blocks) → Task 3 render functions. ✅
- §6 Visual tokens → Task 2 CSS. ✅
- §7 Layer/quality (named constants, ≤40-line fns, no new logic) → Task 3 structure. ✅
- §8 Testing (route, role gating, API regression, empty states) → Tasks 3, 5, 6. ✅
- §9 Fixture → Task 1 step 4. ✅

**Placeholder scan:** No TBD/TODO; all code blocks complete. ✅

**Type/name consistency:** `render_all(page)`, `render_progress/projects/schedule`, constant `API`, `RISK_LABELS`, `QUICK_LINKS`, CSS classes `vh-*`, Page name `vt-home` — consistent across JS, CSS, tests, redirect targets. ✅

# Stakeholder Pages & Navbar Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create 3 missing stakeholder desk pages (vt-scorecard, vt-okr, vt-team) and upgrade the global navbar to support role-filtered dropdowns, with VT Settings pre-seeded with structured nav items.

**Architecture:** Each new page follows the existing pattern — `{name}.json` (Frappe Page definition) + `{name}.js` (client render) + `{name}.py` (whitelisted API handlers) + `test_{name}.py`. The navbar upgrade adds three fields to `VT Navbar Item` (`is_group`, `parent_group`, `role_restriction`), filters items server-side in `boot.py`, and renders dropdowns in `vt_navbar.js`. Navbar items are seeded via `setup_website.py`.

**Tech Stack:** Frappe v15, Python 3.11, MariaDB, jQuery + Frappe Charts (desk JS)

---

## File Map

### New files
| Path | Purpose |
|------|---------|
| `vernon_tasks/task/page/vt_scorecard/vt_scorecard.json` | Page definition — roles: Member, Leader, Manager |
| `vernon_tasks/task/page/vt_scorecard/vt_scorecard.py` | API: `get_point_log`, `get_monthly_summary` |
| `vernon_tasks/task/page/vt_scorecard/vt_scorecard.js` | Client: point-log table + monthly bar chart |
| `vernon_tasks/task/page/vt_scorecard/__init__.py` | Empty init |
| `vernon_tasks/task/page/vt_scorecard/test_vt_scorecard.py` | Backend tests |
| `vernon_tasks/task/page/vt_okr/vt_okr.json` | Page definition — roles: Leader, Manager |
| `vernon_tasks/task/page/vt_okr/vt_okr.py` | API: `list_objectives`, `update_key_result` |
| `vernon_tasks/task/page/vt_okr/vt_okr.js` | Client: accordion objectives + inline KR update |
| `vernon_tasks/task/page/vt_okr/__init__.py` | Empty init |
| `vernon_tasks/task/page/vt_okr/test_vt_okr.py` | Backend tests |
| `vernon_tasks/task/page/vt_team/vt_team.json` | Page definition — roles: Leader, Manager |
| `vernon_tasks/task/page/vt_team/vt_team.py` | API: `get_team_capacity` |
| `vernon_tasks/task/page/vt_team/vt_team.js` | Client: utilization table per member |
| `vernon_tasks/task/page/vt_team/__init__.py` | Empty init |
| `vernon_tasks/task/page/vt_team/test_vt_team.py` | Backend tests |

### Modified files
| Path | Change |
|------|--------|
| `vernon_tasks/vt_settings/doctype/vt_navbar_item/vt_navbar_item.json` | Add `is_group`, `parent_group`, `role_restriction` fields |
| `vernon_tasks/boot.py` | Role-filter navbar items; expose new fields |
| `vernon_tasks/task/api/settings.py` | Extend `NAVBAR_FIELDS` to include new 3 fields |
| `vernon_tasks/public/js/vt_navbar.js` | Dropdown rendering for group items |
| `vernon_tasks/setup_website.py` | Add `setup_navbar_items()` function |

---

## Task 1 — VT Navbar Item: add dropdown + role fields

**Files:**
- Modify: `vernon_tasks/vt_settings/doctype/vt_navbar_item/vt_navbar_item.json`

- [ ] **Step 1.1: Read current JSON**

```bash
cat vernon_tasks/vt_settings/doctype/vt_navbar_item/vt_navbar_item.json
```

Confirm current fields: `label`, `route`, `icon`, `enabled`.

- [ ] **Step 1.2: Add three fields to the fields array**

Open `vernon_tasks/vt_settings/doctype/vt_navbar_item/vt_navbar_item.json`. After the `"enabled"` field entry, append these three new field objects inside the `"fields"` array:

```json
{
    "fieldname": "is_group",
    "fieldtype": "Check",
    "label": "Is Dropdown Group",
    "default": "0"
},
{
    "fieldname": "parent_group",
    "fieldtype": "Data",
    "label": "Parent Group Label"
},
{
    "fieldname": "role_restriction",
    "fieldtype": "Data",
    "label": "Role Restriction (blank = all roles)"
}
```

- [ ] **Step 1.3: Extend settings.py NAVBAR_FIELDS**

In `vernon_tasks/task/api/settings.py`, update `NAVBAR_FIELDS`:

```python
NAVBAR_FIELDS = ("label", "route", "icon", "enabled", "is_group", "parent_group", "role_restriction")
```

And update `_read_navbar()` to include new fields:

```python
def _read_navbar(doc: Any) -> list[dict]:
    """Project the navbar_items child rows into plain dicts for the client."""
    return [
        {
            "label": row.label,
            "route": row.route,
            "icon": row.icon,
            "enabled": row.enabled,
            "is_group": row.is_group or 0,
            "parent_group": row.parent_group or "",
            "role_restriction": row.role_restriction or "",
            "idx": row.idx,
        }
        for row in (doc.navbar_items or [])
    ]
```

- [ ] **Step 1.4: Apply migration**

```bash
docker exec frappe-backend-1 bench --site task.localhost migrate
```

Expected: `Running migrations... ✓`

- [ ] **Step 1.5: Commit**

```bash
git add vernon_tasks/vt_settings/doctype/vt_navbar_item/vt_navbar_item.json
git add vernon_tasks/task/api/settings.py
git commit -m "feat(navbar): tambah field is_group, parent_group, role_restriction ke VT Navbar Item"
```

---

## Task 2 — boot.py: role-filtered navbar items

**Files:**
- Modify: `vernon_tasks/boot.py`

- [ ] **Step 2.1: Write the failing test**

Create `vernon_tasks/tests/test_boot_navbar.py`:

```python
"""Tests for boot.py navbar role-filtering logic."""
import frappe
import unittest


class TestBootNavbar(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        frappe.set_user("Administrator")

    def _seed_navbar_items(self, items):
        """Replace VT Settings navbar_items with given list."""
        doc = frappe.get_single("VT Settings")
        doc.set("navbar_items", [])
        for it in items:
            doc.append("navbar_items", it)
        doc.save(ignore_permissions=True)
        frappe.db.commit()

    def tearDown(self):
        doc = frappe.get_single("VT Settings")
        doc.set("navbar_items", [])
        doc.save(ignore_permissions=True)
        frappe.db.commit()

    def test_items_without_restriction_always_returned(self):
        self._seed_navbar_items([
            {"label": "Home", "route": "/app/vt-home", "icon": "home", "enabled": 1,
             "is_group": 0, "parent_group": "", "role_restriction": ""},
        ])
        from unittest.mock import MagicMock
        from vernon_tasks.boot import extend_bootinfo
        boot = MagicMock()
        extend_bootinfo(boot)
        labels = [i["label"] for i in boot.vt_navbar_items]
        self.assertIn("Home", labels)

    def test_restricted_item_hidden_from_member(self):
        self._seed_navbar_items([
            {"label": "Home", "route": "/app/vt-home", "icon": "home", "enabled": 1,
             "is_group": 0, "parent_group": "", "role_restriction": ""},
            {"label": "Admin", "route": "", "icon": "setting", "enabled": 1,
             "is_group": 1, "parent_group": "", "role_restriction": "VT Manager"},
        ])
        # Run as Administrator (has all roles), manually filter what a Member would see
        from vernon_tasks.boot import _filter_by_roles
        items = [
            {"label": "Home", "role_restriction": ""},
            {"label": "Admin", "role_restriction": "VT Manager"},
        ]
        user_roles = {"VT Member", "Guest"}
        result = _filter_by_roles(items, user_roles)
        labels = [i["label"] for i in result]
        self.assertIn("Home", labels)
        self.assertNotIn("Admin", labels)

    def test_restricted_item_visible_to_matching_role(self):
        from vernon_tasks.boot import _filter_by_roles
        items = [
            {"label": "Leader", "role_restriction": "VT Leader"},
        ]
        user_roles = {"VT Leader", "VT Member"}
        result = _filter_by_roles(items, user_roles)
        self.assertEqual(len(result), 1)

    def test_default_navbar_used_when_no_items(self):
        from unittest.mock import MagicMock
        from vernon_tasks.boot import extend_bootinfo, DEFAULT_NAVBAR
        boot = MagicMock()
        extend_bootinfo(boot)
        # When no enabled items exist, fallback to DEFAULT_NAVBAR
        self.assertIsInstance(boot.vt_navbar_items, list)
        self.assertGreater(len(boot.vt_navbar_items), 0)
```

- [ ] **Step 2.2: Run test to verify it fails**

```bash
docker exec frappe-backend-1 bench --site task.localhost run-tests \
    --module "vernon_tasks.tests.test_boot_navbar" -v
```

Expected: FAIL — `ImportError: cannot import name '_filter_by_roles' from 'vernon_tasks.boot'`

- [ ] **Step 2.3: Rewrite boot.py**

Replace `vernon_tasks/boot.py` with:

```python
"""extend_bootinfo hook: inject role-filtered navbar2 menu into frappe.boot.

Desk JS reads frappe.boot.vt_navbar_items without an extra HTTP round-trip.
Items with role_restriction set are filtered server-side so the client never
receives nav entries for roles the user does not hold.
"""
import frappe

DEFAULT_NAVBAR = [
    {"label": "Beranda", "route": "/app/vt-home", "icon": "home",
     "is_group": 0, "parent_group": "", "role_restriction": ""},
    {"label": "Proyek", "route": "/app/vt-projects", "icon": "folder-normal",
     "is_group": 0, "parent_group": "", "role_restriction": ""},
]


def _filter_by_roles(items: list, user_roles: set) -> list:
    """Return only items whose role_restriction is satisfied by user_roles.

    An empty role_restriction means the item is visible to all roles.
    """
    return [
        item for item in items
        if not item.get("role_restriction") or item["role_restriction"] in user_roles
    ]


def extend_bootinfo(bootinfo) -> None:
    """Inject filtered navbar items into frappe.boot."""
    rows = frappe.get_all(
        "VT Navbar Item",
        filters={"parenttype": "VT Settings", "enabled": 1},
        fields=["label", "route", "icon", "is_group", "parent_group", "role_restriction"],
        order_by="idx asc",
    )
    if not rows:
        bootinfo.vt_navbar_items = DEFAULT_NAVBAR
        return

    user_roles = set(frappe.get_roles())
    bootinfo.vt_navbar_items = _filter_by_roles(rows, user_roles)
```

- [ ] **Step 2.4: Run tests to verify they pass**

```bash
docker exec frappe-backend-1 bench --site task.localhost run-tests \
    --module "vernon_tasks.tests.test_boot_navbar" -v
```

Expected: 4 tests PASS.

- [ ] **Step 2.5: Commit**

```bash
git add vernon_tasks/boot.py vernon_tasks/tests/test_boot_navbar.py
git commit -m "feat(navbar): filter navbar items berdasarkan role user di boot.py"
```

---

## Task 3 — vt_navbar.js: dropdown rendering

**Files:**
- Modify: `vernon_tasks/public/js/vt_navbar.js`

- [ ] **Step 3.1: Replace vt_navbar.js with dropdown-aware version**

Replace the entire file with:

```javascript
/* vt_navbar.js — global "navbar2" rendered on every desk page.
   Reads frappe.boot.vt_navbar_items (injected by extend_bootinfo).
   Items with is_group=1 render as dropdown triggers; their children
   (items with parent_group == group.label) render inside a dropdown panel.
   Role filtering already applied server-side — no client check needed. */

const VT_NAVBAR_ID = "vt-navbar2";
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
    return (frappe.boot && frappe.boot.vt_navbar_items) || [];
}

/* Build a flat link element. */
function _build_link(it) {
    const route = frappe.utils.escape_html(it.route || "");
    const label = frappe.utils.escape_html(it.label || "");
    const el = $(`<a class="vt-nav-item" data-route="${route}">${label}</a>`);
    el.on("click", function (e) {
        e.preventDefault();
        frappe.set_route(it.route);
        $(".vt-nav-dropdown.open").removeClass("open");
    });
    return el;
}

/* Build a dropdown group element with its child links. */
function _build_dropdown(group_item, children) {
    const label = frappe.utils.escape_html(group_item.label || "");
    const wrapper = $(`<div class="vt-nav-group" data-group="${label}"></div>`);
    const trigger = $(`<a class="vt-nav-item vt-nav-group-trigger">${label} <span class="vt-nav-caret">▾</span></a>`);
    const panel = $(`<div class="vt-nav-dropdown"></div>`);

    children.forEach((child) => {
        const child_route = frappe.utils.escape_html(child.route || "");
        const child_label = frappe.utils.escape_html(child.label || "");
        const child_el = $(`<a class="vt-nav-dropdown-item" data-route="${child_route}">${child_label}</a>`);
        child_el.on("click", function (e) {
            e.preventDefault();
            panel.removeClass("open");
            frappe.set_route(child.route);
        });
        panel.append(child_el);
    });

    trigger.on("click", function (e) {
        e.stopPropagation();
        const is_open = panel.hasClass("open");
        $(".vt-nav-dropdown.open").removeClass("open");
        if (!is_open) panel.addClass("open");
    });

    wrapper.append(trigger, panel);
    return wrapper;
}

function vt_navbar_render() {
    if (document.getElementById(VT_NAVBAR_ID)) {
        vt_navbar_update_active();
        return;
    }

    const items = vt_navbar_items();
    const bar = $(`<div id="${VT_NAVBAR_ID}" class="vt-navbar2"></div>`);

    const groups = items.filter((it) => it.is_group);
    const children = items.filter((it) => it.parent_group);

    items.forEach((it) => {
        if (it.parent_group) return; // rendered inside dropdown
        if (it.is_group) {
            const kids = children.filter((c) => c.parent_group === it.label);
            if (kids.length === 0) return;
            bar.append(_build_dropdown(it, kids));
        } else {
            bar.append(_build_link(it));
        }
    });

    $(".navbar").first().after(bar);

    // Close dropdowns on outside click
    $(document).on("click.vt_navbar", function () {
        $(".vt-nav-dropdown.open").removeClass("open");
    });

    vt_navbar_update_active();
}

function vt_navbar_update_active() {
    const path = window.location.pathname;
    // Standalone links
    $(`#${VT_NAVBAR_ID} .vt-nav-item:not(.vt-nav-group-trigger)`).each(function () {
        const r = $(this).data("route");
        const active = r && (path === r || path.indexOf(r + "/") === 0);
        $(this).toggleClass("active", !!active);
    });
    // Dropdown items + their group trigger
    $(`#${VT_NAVBAR_ID} .vt-nav-dropdown-item`).each(function () {
        const r = $(this).data("route");
        const active = r && (path === r || path.indexOf(r + "/") === 0);
        $(this).toggleClass("active", !!active);
        if (active) {
            $(this).closest(".vt-nav-group").find(".vt-nav-group-trigger").addClass("active");
        }
    });
}
```

- [ ] **Step 3.2: Add CSS for dropdowns**

Open `vernon_tasks/public/css/vt_home.css`. Append at the bottom:

```css
/* ── vt-navbar2 dropdown ── */
.vt-navbar2 {
    position: relative;
    z-index: 1000;
}

.vt-nav-group {
    position: relative;
    display: inline-block;
}

.vt-nav-group-trigger {
    cursor: pointer;
    user-select: none;
}

.vt-nav-caret {
    font-size: 10px;
    margin-left: 2px;
    opacity: 0.7;
}

.vt-nav-dropdown {
    display: none;
    position: absolute;
    top: 100%;
    left: 0;
    min-width: 180px;
    background: #fff;
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.10);
    padding: 4px 0;
    z-index: 1100;
}

.vt-nav-dropdown.open {
    display: block;
}

.vt-nav-dropdown-item {
    display: block;
    padding: 7px 16px;
    font-size: 13px;
    color: var(--text-color, #1e293b);
    text-decoration: none;
    cursor: pointer;
    white-space: nowrap;
}

.vt-nav-dropdown-item:hover,
.vt-nav-dropdown-item.active {
    background: var(--subtle-bg, #f4f5f7);
    color: var(--primary, #6366f1);
}
```

- [ ] **Step 3.3: Rebuild assets**

```bash
docker exec frappe-backend-1 bench --site task.localhost build --app vernon_tasks
docker restart frappe-backend-1 frappe-frontend-1
```

- [ ] **Step 3.4: Commit**

```bash
git add vernon_tasks/public/js/vt_navbar.js vernon_tasks/public/css/vt_home.css
git commit -m "feat(navbar): tambah dropdown rendering ke vt_navbar.js"
```

---

## Task 4 — vt-scorecard: Python API + tests

**Files:**
- Create: `vernon_tasks/task/page/vt_scorecard/vt_scorecard.py`
- Create: `vernon_tasks/task/page/vt_scorecard/test_vt_scorecard.py`
- Create: `vernon_tasks/task/page/vt_scorecard/__init__.py`

- [ ] **Step 4.1: Write the failing tests**

Create `vernon_tasks/task/page/vt_scorecard/test_vt_scorecard.py`:

```python
"""Tests for vt-scorecard page API: get_point_log, get_monthly_summary."""
import frappe
import unittest
from frappe.utils import now_datetime, add_months, today

_PROJECT_NAME = None


def _make_project():
    global _PROJECT_NAME
    existing = frappe.db.get_value("VT Project", {"title": "Test Scorecard Project"}, "name")
    if existing:
        _PROJECT_NAME = existing
        return
    doc = frappe.get_doc({
        "doctype": "VT Project",
        "title": "Test Scorecard Project",
        "project_owner": "Administrator",
        "start_date": today(),
        "end_date": add_months(today(), 1),
        "pdca_phase": "DO",
    }).insert(ignore_permissions=True)
    _PROJECT_NAME = doc.name


def _make_task(project_name):
    return frappe.get_doc({
        "doctype": "VT Task",
        "title": "Scorecard Test Task",
        "project": project_name,
        "assigned_to": "Administrator",
        "pdca_phase": "DONE",
        "kanban_status": "Done",
        "priority": "Medium",
        "weight": 5.0,
    }).insert(ignore_permissions=True)


class TestScorecardAPI(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        frappe.set_user("Administrator")
        _make_project()
        cls._task = _make_task(_PROJECT_NAME)
        cls._logs = []
        cls._summaries = []

    @classmethod
    def tearDownClass(cls):
        for log in cls._logs:
            if frappe.db.exists("Task Point Log", log):
                frappe.delete_doc("Task Point Log", log, force=True)
        for s in cls._summaries:
            if frappe.db.exists("User Point Summary", s):
                frappe.delete_doc("User Point Summary", s, force=True)
        if frappe.db.exists("VT Task", cls._task.name):
            frappe.delete_doc("VT Task", cls._task.name, force=True)
        if _PROJECT_NAME and frappe.db.exists("VT Project", _PROJECT_NAME):
            frappe.delete_doc("VT Project", _PROJECT_NAME, force=True)
        frappe.db.commit()

    def _make_log(self, user, amount, ttype="earned"):
        doc = frappe.get_doc({
            "doctype": "Task Point Log",
            "task": self._task.name,
            "user": user,
            "transaction_type": ttype,
            "amount": amount,
            "original_amount": amount,
            "log_timestamp": now_datetime(),
        }).insert(ignore_permissions=True)
        self.__class__._logs.append(doc.name)
        return doc

    def _make_summary(self, user, period, net_points):
        doc = frappe.get_doc({
            "doctype": "User Point Summary",
            "user": user,
            "period": period,
            "total_earned": net_points,
            "total_penalty": 0,
            "total_bonus": 0,
            "total_override_delta": 0,
            "net_points": net_points,
        }).insert(ignore_permissions=True)
        self.__class__._summaries.append(doc.name)
        return doc

    def test_get_point_log_returns_own_records(self):
        """get_point_log returns Task Point Log for the calling user."""
        self._make_log("Administrator", 50.0, "earned")
        from vernon_tasks.task.page.vt_scorecard.vt_scorecard import get_point_log
        result = get_point_log()
        self.assertTrue(any(r["amount"] == 50.0 for r in result))

    def test_get_point_log_enriches_task_title(self):
        """Each log row includes task_title from the linked VT Task."""
        self._make_log("Administrator", 10.0, "earned")
        from vernon_tasks.task.page.vt_scorecard.vt_scorecard import get_point_log
        result = get_point_log()
        self.assertTrue(all("task_title" in r for r in result))
        self.assertTrue(any(r["task_title"] == "Scorecard Test Task" for r in result))

    def test_get_point_log_limit_respected(self):
        """limit param caps the number of rows returned."""
        for _ in range(5):
            self._make_log("Administrator", 1.0)
        from vernon_tasks.task.page.vt_scorecard.vt_scorecard import get_point_log
        result = get_point_log(limit=2)
        self.assertLessEqual(len(result), 2)

    def test_get_monthly_summary_chronological(self):
        """get_monthly_summary returns rows in ascending period order."""
        self._make_summary("Administrator", "2026-03", 100)
        self._make_summary("Administrator", "2026-04", 120)
        self._make_summary("Administrator", "2026-05", 90)
        from vernon_tasks.task.page.vt_scorecard.vt_scorecard import get_monthly_summary
        result = get_monthly_summary(months=6)
        periods = [r["period"] for r in result]
        self.assertEqual(periods, sorted(periods))

    def test_get_monthly_summary_respects_months_limit(self):
        """months param caps how many periods are returned."""
        from vernon_tasks.task.page.vt_scorecard.vt_scorecard import get_monthly_summary
        result = get_monthly_summary(months=2)
        self.assertLessEqual(len(result), 2)
```

- [ ] **Step 4.2: Run tests to confirm failure**

```bash
docker exec frappe-backend-1 bench --site task.localhost run-tests \
    --module "vernon_tasks.task.page.vt_scorecard.test_vt_scorecard" -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'vernon_tasks.task.page.vt_scorecard'`

- [ ] **Step 4.3: Create `__init__.py`**

```bash
touch vernon_tasks/task/page/vt_scorecard/__init__.py
```

- [ ] **Step 4.4: Create `vt_scorecard.py`**

```python
"""vt-scorecard page API: personal point log and monthly summary.

Exposes get_point_log and get_monthly_summary for VT Member, Leader, Manager.
Managers may optionally query a different user via the `user` param.
"""
from __future__ import annotations

import frappe

_ALLOWED_ROLES = ("VT Member", "VT Leader", "VT Manager")
_MANAGER_ROLE = "VT Manager"
_LOG_DOCTYPE = "Task Point Log"
_SUMMARY_DOCTYPE = "User Point Summary"
_TASK_DOCTYPE = "VT Task"


def _resolve_target_user(user: str | None) -> str:
    """Return the user whose data to query.

    Non-managers always get their own data regardless of the `user` param.
    Managers may specify a different user to view their scorecard.
    """
    frappe.only_for(_ALLOWED_ROLES)
    if user and _MANAGER_ROLE in frappe.get_roles():
        return user
    return frappe.session.user


@frappe.whitelist()
def get_point_log(user: str | None = None, project: str | None = None,
                  limit: int = 50, offset: int = 0) -> list[dict]:
    """Return paginated Task Point Log rows for a user, newest first.

    Each row is enriched with task_title from the linked VT Task.
    """
    target = _resolve_target_user(user)
    filters: dict = {"user": target}

    if project:
        task_names = frappe.get_all(_TASK_DOCTYPE, filters={"project": project}, pluck="name")
        if not task_names:
            return []
        filters["task"] = ("in", task_names)

    rows = frappe.get_all(
        _LOG_DOCTYPE,
        filters=filters,
        fields=["name", "task", "transaction_type", "amount", "original_amount",
                "log_timestamp", "note", "overridden_by"],
        order_by="log_timestamp desc",
        limit=int(limit),
        start=int(offset),
    )

    title_cache: dict[str, str] = {}
    for row in rows:
        task = row["task"]
        if task not in title_cache:
            title_cache[task] = frappe.db.get_value(_TASK_DOCTYPE, task, "title") or task
        row["task_title"] = title_cache[task]

    return rows


@frappe.whitelist()
def get_monthly_summary(user: str | None = None, months: int = 6) -> list[dict]:
    """Return last N monthly User Point Summary rows in chronological order."""
    target = _resolve_target_user(user)

    rows = frappe.get_all(
        _SUMMARY_DOCTYPE,
        filters={"user": target},
        fields=["period", "total_earned", "total_penalty", "total_bonus",
                "total_override_delta", "net_points"],
        order_by="period desc",
        limit=int(months),
    )

    return list(reversed(rows))
```

- [ ] **Step 4.5: Run tests to verify all pass**

```bash
docker exec frappe-backend-1 bench --site task.localhost run-tests \
    --module "vernon_tasks.task.page.vt_scorecard.test_vt_scorecard" -v
```

Expected: 5 tests PASS.

- [ ] **Step 4.6: Commit**

```bash
git add vernon_tasks/task/page/vt_scorecard/
git commit -m "feat(scorecard): tambah API get_point_log dan get_monthly_summary"
```

---

## Task 5 — vt-scorecard: JSON + JS

**Files:**
- Create: `vernon_tasks/task/page/vt_scorecard/vt_scorecard.json`
- Create: `vernon_tasks/task/page/vt_scorecard/vt_scorecard.js`

- [ ] **Step 5.1: Create `vt_scorecard.json`**

```json
{
    "creation": "2026-06-01 00:00:00",
    "docstatus": 0,
    "doctype": "Page",
    "idx": 0,
    "modified": "2026-06-01 00:00:00",
    "modified_by": "Administrator",
    "module": "Task",
    "name": "vt-scorecard",
    "page_name": "vt-scorecard",
    "roles": [
        {"role": "VT Member"},
        {"role": "VT Leader"},
        {"role": "VT Manager"}
    ],
    "script": null,
    "standard": "Yes",
    "style": null,
    "system_page": 1,
    "title": "Scorecard & Poin"
}
```

- [ ] **Step 5.2: Create `vt_scorecard.js`**

```javascript
/* vt_scorecard.js — personal gamification scorecard.
   Shows: monthly net-points bar chart + paginated transaction log.
   API: task/page/vt_scorecard/vt_scorecard.py */

const SC_API_LOG     = "vernon_tasks.task.page.vt_scorecard.vt_scorecard.get_point_log";
const SC_API_SUMMARY = "vernon_tasks.task.page.vt_scorecard.vt_scorecard.get_monthly_summary";
const SC_PAGE_SIZE   = 30;
const TYPE_COLOR = {
    earned:            "var(--green-500)",
    early_bonus:       "var(--blue-500)",
    late_penalty:      "var(--red-400)",
    revision_deduction:"var(--orange-500)",
    leader_override:   "var(--purple-500)",
};

const esc = (v) => frappe.utils.escape_html(v == null ? "" : String(v));

frappe.pages["vt-scorecard"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __("Scorecard & Poin"),
        single_column: true,
    });

    const state = { offset: 0, project: null };

    const project_field = page.add_field({
        fieldname: "project",
        label: __("Proyek"),
        fieldtype: "Link",
        options: "VT Project",
        change: () => {
            state.project = project_field.get_value() || null;
            state.offset = 0;
            render_all();
        },
    });

    page.add_button(__("Refresh"), () => { state.offset = 0; render_all(); }, { icon: "refresh" });

    const container = $('<div class="vt-home" style="padding:20px 20px 48px;"></div>').appendTo(page.main);

    function call(method, args) {
        return frappe.call({ method, args }).then((r) => r.message || []);
    }

    function render_summary() {
        call(SC_API_SUMMARY, { months: 6 }).then((rows) => {
            const section = $('<div class="vh-section" style="margin-bottom:24px;"></div>');
            section.append('<div class="vh-section-title">Poin Bulanan (6 bulan terakhir)</div>');

            if (!rows.length) {
                section.append('<div class="vh-empty">Belum ada ringkasan poin.</div>');
                container.prepend(section);
                return;
            }

            const chart_el = $('<div id="sc-monthly-chart"></div>');
            section.append(chart_el);

            container.prepend(section);

            new frappe.Chart("#sc-monthly-chart", {
                type: "bar",
                data: {
                    labels: rows.map((r) => esc(r.period)),
                    datasets: [
                        { name: __("Net Poin"), values: rows.map((r) => r.net_points || 0) },
                    ],
                },
                colors: ["#6366f1"],
                height: 200,
            });
        });
    }

    function render_log() {
        const args = { limit: SC_PAGE_SIZE, offset: state.offset };
        if (state.project) args.project = state.project;

        call(SC_API_LOG, args).then((rows) => {
            const log_section = $('<div class="vh-section"></div>');
            log_section.append('<div class="vh-section-title">Riwayat Transaksi Poin</div>');

            if (!rows.length) {
                log_section.append('<div class="vh-empty">Belum ada transaksi poin.</div>');
            } else {
                const table = $(`
                    <table class="table table-sm" style="font-size:13px;">
                        <thead>
                            <tr>
                                <th>Tugas</th>
                                <th>Tipe</th>
                                <th style="text-align:right;">Poin</th>
                                <th>Catatan</th>
                                <th>Waktu</th>
                            </tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                `);
                const tbody = table.find("tbody");
                rows.forEach((r) => {
                    const color = TYPE_COLOR[r.transaction_type] || "inherit";
                    const sign  = r.transaction_type === "earned" || r.transaction_type === "early_bonus" ? "+" : "−";
                    tbody.append(`
                        <tr>
                            <td>${esc(r.task_title)}</td>
                            <td>${esc(r.transaction_type)}</td>
                            <td style="text-align:right;color:${color};font-weight:600;">
                                ${sign}${Math.abs(r.amount).toFixed(1)}
                            </td>
                            <td>${esc(r.note || "—")}</td>
                            <td style="color:var(--text-muted);font-size:12px;">
                                ${esc(frappe.datetime.str_to_user(r.log_timestamp))}
                            </td>
                        </tr>
                    `);
                });
                log_section.append(table);

                const nav = $('<div style="display:flex;gap:8px;margin-top:8px;"></div>');
                if (state.offset > 0) {
                    nav.append($(`<button class="btn btn-xs btn-default">${__("← Sebelumnya")}</button>`)
                        .on("click", () => { state.offset = Math.max(0, state.offset - SC_PAGE_SIZE); render_log(); }));
                }
                if (rows.length === SC_PAGE_SIZE) {
                    nav.append($(`<button class="btn btn-xs btn-default">${__("Berikutnya →")}</button>`)
                        .on("click", () => { state.offset += SC_PAGE_SIZE; render_log(); }));
                }
                log_section.append(nav);
            }

            container.find(".sc-log-section").remove();
            log_section.addClass("sc-log-section");
            container.append(log_section);
        });
    }

    function render_all() {
        container.empty();
        render_summary();
        render_log();
    }

    render_all();
};
```

- [ ] **Step 5.3: Commit**

```bash
git add vernon_tasks/task/page/vt_scorecard/vt_scorecard.json
git add vernon_tasks/task/page/vt_scorecard/vt_scorecard.js
git commit -m "feat(scorecard): tambah halaman Scorecard & Poin (JSON + JS)"
```

---

## Task 6 — vt-okr: Python API + tests

**Files:**
- Create: `vernon_tasks/task/page/vt_okr/vt_okr.py`
- Create: `vernon_tasks/task/page/vt_okr/test_vt_okr.py`
- Create: `vernon_tasks/task/page/vt_okr/__init__.py`

- [ ] **Step 6.1: Write the failing tests**

Create `vernon_tasks/task/page/vt_okr/test_vt_okr.py`:

```python
"""Tests for vt-okr page API: list_objectives, update_key_result."""
import frappe
import unittest
from frappe.utils import today, add_months


class TestOkrAPI(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        frappe.set_user("Administrator")
        cls._objectives = []
        cls._key_results = []

    @classmethod
    def tearDownClass(cls):
        for kr in cls._key_results:
            if frappe.db.exists("Key Result", kr):
                frappe.delete_doc("Key Result", kr, force=True)
        for obj in cls._objectives:
            if frappe.db.exists("Objective", obj):
                frappe.delete_doc("Objective", obj, force=True)
        frappe.db.commit()

    def _make_objective(self, title="Test OKR Obj", period="2026-Q2"):
        doc = frappe.get_doc({
            "doctype": "Objective",
            "title": title,
            "period": period,
            "period_start": today(),
            "period_end": add_months(today(), 3),
            "objective_owner": "Administrator",
            "status": "Open",
            "pdca_phase": "DO",
        }).insert(ignore_permissions=True)
        self.__class__._objectives.append(doc.name)
        return doc

    def _make_key_result(self, objective_name, metric="Revenue", target=100.0, current=0.0):
        doc = frappe.get_doc({
            "doctype": "Key Result",
            "objective": objective_name,
            "metric": metric,
            "target_value": target,
            "current_value": current,
            "unit": "IDR",
            "progress_percent": (current / target * 100) if target else 0,
            "confidence": 50.0,
        }).insert(ignore_permissions=True)
        self.__class__._key_results.append(doc.name)
        return doc

    def test_list_objectives_includes_key_results(self):
        """list_objectives returns each objective with its key_results array."""
        obj = self._make_objective("OKR Test 1", "2026-Q2")
        self._make_key_result(obj.name, "Revenue", 200.0, 50.0)

        from vernon_tasks.task.page.vt_okr.vt_okr import list_objectives
        result = list_objectives()

        found = [o for o in result if o["name"] == obj.name]
        self.assertEqual(len(found), 1)
        self.assertIn("key_results", found[0])
        self.assertEqual(len(found[0]["key_results"]), 1)

    def test_list_objectives_computes_avg_progress(self):
        """avg_progress is mean of KR progress_percent values."""
        obj = self._make_objective("OKR Avg Test", "2026-Q2")
        self._make_key_result(obj.name, "KR1", 100.0, 40.0)  # 40%
        self._make_key_result(obj.name, "KR2", 100.0, 60.0)  # 60%

        from vernon_tasks.task.page.vt_okr.vt_okr import list_objectives
        result = list_objectives()
        found = next((o for o in result if o["name"] == obj.name), None)
        self.assertIsNotNone(found)
        self.assertAlmostEqual(found["avg_progress"], 50.0, places=1)

    def test_update_key_result_recalculates_progress(self):
        """update_key_result sets current_value and recalculates progress_percent."""
        obj = self._make_objective("OKR Update Test", "2026-Q3")
        kr = self._make_key_result(obj.name, "Units", 200.0, 0.0)

        from vernon_tasks.task.page.vt_okr.vt_okr import update_key_result
        result = update_key_result(kr.name, current_value=100.0)

        self.assertAlmostEqual(result["progress_percent"], 50.0, places=1)
        self.assertAlmostEqual(result["current_value"], 100.0, places=1)

    def test_update_key_result_caps_progress_at_100(self):
        """Progress cannot exceed 100% even when current > target."""
        obj = self._make_objective("OKR Cap Test", "2026-Q3")
        kr = self._make_key_result(obj.name, "Sales", 100.0, 0.0)

        from vernon_tasks.task.page.vt_okr.vt_okr import update_key_result
        result = update_key_result(kr.name, current_value=150.0)

        self.assertEqual(result["progress_percent"], 100.0)

    def test_list_objectives_filters_by_period(self):
        """period filter returns only matching objectives."""
        obj_a = self._make_objective("Period Q2", "2026-Q2")
        obj_b = self._make_objective("Period Q4", "2026-Q4")

        from vernon_tasks.task.page.vt_okr.vt_okr import list_objectives
        result = list_objectives(period="2026-Q4")
        names = [o["name"] for o in result]

        self.assertIn(obj_b.name, names)
        self.assertNotIn(obj_a.name, names)
```

- [ ] **Step 6.2: Run tests to confirm failure**

```bash
docker exec frappe-backend-1 bench --site task.localhost run-tests \
    --module "vernon_tasks.task.page.vt_okr.test_vt_okr" -v
```

Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 6.3: Create `__init__.py`**

```bash
touch vernon_tasks/task/page/vt_okr/__init__.py
```

- [ ] **Step 6.4: Create `vt_okr.py`**

```python
"""vt-okr page API: OKR management for Leaders and Managers.

Provides list_objectives (with Key Results embedded) and
update_key_result (inline current_value + confidence update).
Create/delete Objectives delegates to native Frappe form (frappe.new_doc / form route).
"""
from __future__ import annotations

import frappe

_ALLOWED_ROLES = ("VT Leader", "VT Manager")
_OBJ_DOCTYPE = "Objective"
_KR_DOCTYPE = "Key Result"


def _require_leader() -> None:
    """Raise PermissionError unless caller holds VT Leader or VT Manager."""
    frappe.only_for(_ALLOWED_ROLES)


@frappe.whitelist()
def list_objectives(period: str | None = None, brand: str | None = None) -> list[dict]:
    """Return Objectives with embedded Key Results and computed avg_progress.

    Optionally filters by OKR period (e.g. '2026-Q2') or brand name.
    """
    _require_leader()

    filters: dict = {}
    if period:
        filters["period"] = period
    if brand:
        filters["brand"] = brand

    objectives = frappe.get_all(
        _OBJ_DOCTYPE,
        filters=filters,
        fields=["name", "title", "brand", "period", "period_start", "period_end",
                "objective_owner", "status", "pdca_phase"],
        order_by="period desc, title asc",
    )

    for obj in objectives:
        krs = frappe.get_all(
            _KR_DOCTYPE,
            filters={"objective": obj["name"]},
            fields=["name", "metric", "target_value", "current_value",
                    "progress_percent", "confidence", "unit"],
        )
        obj["key_results"] = krs
        obj["kr_count"] = len(krs)
        obj["avg_progress"] = (
            sum(k["progress_percent"] or 0 for k in krs) / len(krs) if krs else 0
        )

    return objectives


@frappe.whitelist()
def update_key_result(key_result: str, current_value: float,
                      confidence: float | None = None) -> dict:
    """Update current_value (and optionally confidence) on a Key Result.

    Recalculates progress_percent = min(100, current / target * 100).
    Returns {"progress_percent": ..., "current_value": ...}.
    """
    _require_leader()

    doc = frappe.get_doc(_KR_DOCTYPE, key_result)
    doc.current_value = float(current_value)

    if confidence is not None:
        doc.confidence = float(confidence)

    if doc.target_value:
        doc.progress_percent = min(100.0, (doc.current_value / doc.target_value) * 100)

    doc.save()

    return {
        "progress_percent": doc.progress_percent,
        "current_value": doc.current_value,
    }
```

- [ ] **Step 6.5: Run tests to verify all pass**

```bash
docker exec frappe-backend-1 bench --site task.localhost run-tests \
    --module "vernon_tasks.task.page.vt_okr.test_vt_okr" -v
```

Expected: 5 tests PASS.

- [ ] **Step 6.6: Commit**

```bash
git add vernon_tasks/task/page/vt_okr/
git commit -m "feat(okr): tambah API list_objectives dan update_key_result"
```

---

## Task 7 — vt-okr: JSON + JS

**Files:**
- Create: `vernon_tasks/task/page/vt_okr/vt_okr.json`
- Create: `vernon_tasks/task/page/vt_okr/vt_okr.js`

- [ ] **Step 7.1: Create `vt_okr.json`**

```json
{
    "creation": "2026-06-01 00:00:00",
    "docstatus": 0,
    "doctype": "Page",
    "idx": 0,
    "modified": "2026-06-01 00:00:00",
    "modified_by": "Administrator",
    "module": "Task",
    "name": "vt-okr",
    "page_name": "vt-okr",
    "roles": [
        {"role": "VT Leader"},
        {"role": "VT Manager"}
    ],
    "script": null,
    "standard": "Yes",
    "style": null,
    "system_page": 1,
    "title": "OKR"
}
```

- [ ] **Step 7.2: Create `vt_okr.js`**

```javascript
/* vt_okr.js — OKR management page for Leaders and Managers.
   Shows accordion list of Objectives with embedded Key Results.
   Inline confidence/current_value updates via update_key_result API.
   Create/edit Objective routes to native Frappe form. */

const OKR_API_LIST   = "vernon_tasks.task.page.vt_okr.vt_okr.list_objectives";
const OKR_API_UPDATE = "vernon_tasks.task.page.vt_okr.vt_okr.update_key_result";
const OKR_DOCTYPE    = "Objective";

const esc = (v) => frappe.utils.escape_html(v == null ? "" : String(v));

const STATUS_COLOR = {
    Open:   "var(--blue-500)",
    Closed: "var(--green-500)",
    Dropped:"var(--red-400)",
};

frappe.pages["vt-okr"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __("OKR"),
        single_column: true,
    });

    const state = { period: "", brand: "" };

    const period_field = page.add_field({
        fieldname: "period",
        label: __("Periode"),
        fieldtype: "Data",
        description: __("contoh: 2026-Q2"),
        change: () => { state.period = period_field.get_value() || ""; render(); },
    });

    const brand_field = page.add_field({
        fieldname: "brand",
        label: __("Brand"),
        fieldtype: "Link",
        options: "VT Brand",
        change: () => { state.brand = brand_field.get_value() || ""; render(); },
    });

    page.set_primary_action(__("Buat Objective"), () => frappe.new_doc(OKR_DOCTYPE), "add");
    page.add_button(__("Refresh"), render, { icon: "refresh" });

    const container = $('<div class="vt-home" style="padding:20px 20px 48px;"></div>').appendTo(page.main);

    function call_list() {
        const args = {};
        if (state.period) args.period = state.period;
        if (state.brand) args.brand = state.brand;
        return frappe.call({ method: OKR_API_LIST, args }).then((r) => r.message || []);
    }

    function progress_bar_html(pct, color) {
        const safe_pct = Math.min(100, Math.max(0, pct || 0));
        return `
            <div style="background:var(--border-color);border-radius:4px;height:6px;width:100%;margin-top:4px;">
                <div style="width:${safe_pct.toFixed(1)}%;height:6px;border-radius:4px;background:${color};"></div>
            </div>
            <span style="font-size:11px;color:var(--text-muted);">${safe_pct.toFixed(1)}%</span>
        `;
    }

    function build_kr_row(kr, obj_el) {
        const row = $(`
            <div class="okr-kr-row" style="display:flex;align-items:flex-start;gap:12px;
                 padding:8px 12px;border-bottom:1px solid var(--border-color);font-size:13px;">
                <div style="flex:2;">
                    <div style="font-weight:500;">${esc(kr.metric)}</div>
                    ${progress_bar_html(kr.progress_percent, "var(--primary)")}
                </div>
                <div style="flex:1;display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                    <input class="form-control form-control-sm okr-current-input"
                           type="number" step="any"
                           value="${esc(kr.current_value)}"
                           style="width:90px;"
                           title="${__('Current Value')}" />
                    <span style="color:var(--text-muted);font-size:12px;">/ ${esc(kr.target_value)} ${esc(kr.unit || "")}</span>
                    <button class="btn btn-xs btn-primary okr-save-btn">${__("Simpan")}</button>
                </div>
            </div>
        `);

        row.find(".okr-save-btn").on("click", function () {
            const new_val = parseFloat(row.find(".okr-current-input").val());
            if (isNaN(new_val)) return frappe.throw(__("Nilai harus angka"));
            frappe.call({
                method: OKR_API_UPDATE,
                args: { key_result: kr.name, current_value: new_val },
            }).then((r) => {
                const updated = r.message;
                kr.current_value = updated.current_value;
                kr.progress_percent = updated.progress_percent;
                row.find(".okr-current-input").val(updated.current_value);
                row.find("[style*='height:6px']").css("width", updated.progress_percent.toFixed(1) + "%");
                row.find("span[style*='font-size:11px']").text(updated.progress_percent.toFixed(1) + "%");
                frappe.show_alert({ message: __("KR diperbarui"), indicator: "green" });
            });
        });

        return row;
    }

    function build_objective_card(obj) {
        const color = STATUS_COLOR[obj.status] || "var(--text-muted)";
        const card = $(`
            <div class="okr-card" style="border:1px solid var(--border-color);border-radius:8px;
                 margin-bottom:12px;overflow:hidden;">
                <div class="okr-header" style="display:flex;align-items:center;gap:12px;
                     padding:12px 16px;cursor:pointer;background:var(--subtle-bg);">
                    <div style="flex:1;">
                        <div style="font-weight:600;font-size:14px;">${esc(obj.title)}</div>
                        <div style="font-size:12px;color:var(--text-muted);">
                            ${esc(obj.period)} · ${esc(obj.brand || "—")} ·
                            <span style="color:${color};">${esc(obj.status)}</span> ·
                            ${obj.kr_count} KR
                        </div>
                        ${progress_bar_html(obj.avg_progress, color)}
                    </div>
                    <button class="btn btn-xs btn-default" onclick="event.stopPropagation();
                        frappe.set_route('Form','${OKR_DOCTYPE}','${esc(obj.name)}');">
                        ${__("Edit")}
                    </button>
                    <span class="okr-toggle" style="font-size:18px;color:var(--text-muted);">▾</span>
                </div>
                <div class="okr-body" style="display:none;"></div>
            </div>
        `);

        const body = card.find(".okr-body");
        if (!obj.key_results.length) {
            body.append(`<div style="padding:12px;color:var(--text-muted);font-size:13px;">${__("Belum ada Key Result")}</div>`);
        } else {
            obj.key_results.forEach((kr) => body.append(build_kr_row(kr, card)));
        }

        card.find(".okr-header").on("click", function () {
            const open = body.is(":visible");
            body.toggle(!open);
            card.find(".okr-toggle").text(open ? "▾" : "▴");
        });

        return card;
    }

    function render() {
        container.empty();
        container.append(`<div class="vh-section-title" style="margin-bottom:16px;">${__("Daftar Objective")}</div>`);

        const spinner = $('<div class="vh-empty">Memuat...</div>').appendTo(container);

        call_list().then((objectives) => {
            spinner.remove();
            if (!objectives.length) {
                container.append(`<div class="vh-empty">${__("Belum ada Objective. Klik 'Buat Objective' untuk mulai.")}</div>`);
                return;
            }
            objectives.forEach((obj) => container.append(build_objective_card(obj)));
        });
    }

    render();
};
```

- [ ] **Step 7.3: Commit**

```bash
git add vernon_tasks/task/page/vt_okr/vt_okr.json
git add vernon_tasks/task/page/vt_okr/vt_okr.js
git commit -m "feat(okr): tambah halaman OKR Management (JSON + JS)"
```

---

## Task 8 — vt-team: Python API + tests

**Files:**
- Create: `vernon_tasks/task/page/vt_team/vt_team.py`
- Create: `vernon_tasks/task/page/vt_team/test_vt_team.py`
- Create: `vernon_tasks/task/page/vt_team/__init__.py`

- [ ] **Step 8.1: Write the failing tests**

Create `vernon_tasks/task/page/vt_team/test_vt_team.py`:

```python
"""Tests for vt-team page API: get_team_capacity."""
import frappe
import unittest
from frappe.utils import today, add_months


class TestTeamCapacityAPI(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        frappe.set_user("Administrator")
        cls._profiles = []
        cls._tasks = []
        cls._projects = []
        cls._project_name = cls._make_project()

    @classmethod
    def _make_project(cls):
        existing = frappe.db.get_value("VT Project", {"title": "Test Team Capacity Project"}, "name")
        if existing:
            cls._projects.append(existing)
            return existing
        doc = frappe.get_doc({
            "doctype": "VT Project",
            "title": "Test Team Capacity Project",
            "project_owner": "Administrator",
            "start_date": today(),
            "end_date": add_months(today(), 1),
            "pdca_phase": "DO",
        }).insert(ignore_permissions=True)
        cls._projects.append(doc.name)
        return doc.name

    @classmethod
    def tearDownClass(cls):
        for t in cls._tasks:
            if frappe.db.exists("VT Task", t):
                frappe.delete_doc("VT Task", t, force=True)
        for p in cls._projects:
            if frappe.db.exists("VT Project", p):
                frappe.delete_doc("VT Project", p, force=True)
        for pr in cls._profiles:
            if frappe.db.exists("Work Profile", pr):
                frappe.delete_doc("Work Profile", pr, force=True)
        frappe.db.commit()

    def _make_profile(self, user="Administrator", daily_target=8.0):
        existing = frappe.db.get_value("Work Profile", {"user": user}, "name")
        if existing:
            self.__class__._profiles.append(existing)
            return frappe.get_doc("Work Profile", existing)
        doc = frappe.get_doc({
            "doctype": "Work Profile",
            "user": user,
            "daily_target_hours": daily_target,
        }).insert(ignore_permissions=True)
        self.__class__._profiles.append(doc.name)
        return doc

    def _make_active_task(self, user, estimated_minutes=120):
        doc = frappe.get_doc({
            "doctype": "VT Task",
            "title": f"Team Test Task {frappe.generate_hash(length=4)}",
            "project": self._project_name,
            "assigned_to": user,
            "pdca_phase": "DO",
            "kanban_status": "In Progress",
            "priority": "Medium",
            "weight": 3.0,
            "estimated_minutes": estimated_minutes,
        }).insert(ignore_permissions=True)
        self.__class__._tasks.append(doc.name)
        return doc

    def test_get_team_capacity_returns_profile_users(self):
        """get_team_capacity includes users who have a Work Profile."""
        self._make_profile("Administrator", 8.0)
        from vernon_tasks.task.page.vt_team.vt_team import get_team_capacity
        result = get_team_capacity()
        users = [r["user"] for r in result]
        self.assertIn("Administrator", users)

    def test_get_team_capacity_computes_utilization(self):
        """Utilization is total_estimated_hours / (daily_target * 5) * 100."""
        self._make_profile("Administrator", 8.0)
        # 240 min = 4 hours → utilization = 4 / (8 * 5) * 100 = 10%
        self._make_active_task("Administrator", estimated_minutes=240)
        from vernon_tasks.task.page.vt_team.vt_team import get_team_capacity
        result = get_team_capacity()
        admin_row = next((r for r in result if r["user"] == "Administrator"), None)
        self.assertIsNotNone(admin_row)
        self.assertGreater(admin_row["total_estimated_hours"], 0)
        self.assertGreater(admin_row["utilization_pct"], 0)

    def test_get_team_capacity_sorts_by_utilization_desc(self):
        """Result is sorted highest utilization first."""
        self._make_profile("Administrator", 8.0)
        from vernon_tasks.task.page.vt_team.vt_team import get_team_capacity
        result = get_team_capacity()
        pcts = [r["utilization_pct"] for r in result]
        self.assertEqual(pcts, sorted(pcts, reverse=True))

    def test_get_team_capacity_project_filter(self):
        """project param scopes tasks to a single project."""
        self._make_profile("Administrator", 8.0)
        from vernon_tasks.task.page.vt_team.vt_team import get_team_capacity
        result = get_team_capacity(project=self._project_name)
        self.assertIsInstance(result, list)
```

- [ ] **Step 8.2: Run tests to confirm failure**

```bash
docker exec frappe-backend-1 bench --site task.localhost run-tests \
    --module "vernon_tasks.task.page.vt_team.test_vt_team" -v
```

Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 8.3: Create `__init__.py`**

```bash
touch vernon_tasks/task/page/vt_team/__init__.py
```

- [ ] **Step 8.4: Create `vt_team.py`**

```python
"""vt-team page API: team capacity and workload for Leaders and Managers.

Computes per-member utilization from Work Profile (daily_target_hours)
vs active task estimated_minutes. Returns sorted by utilization descending.
"""
from __future__ import annotations

import frappe

_ALLOWED_ROLES = ("VT Leader", "VT Manager")
_PROFILE_DOCTYPE = "Work Profile"
_TASK_DOCTYPE = "VT Task"
_ACTIVE_STATUSES = ("Scheduled", "In Progress", "In Review")
_WORKING_DAYS_PER_WEEK = 5


def _require_leader() -> None:
    """Raise PermissionError unless caller holds VT Leader or VT Manager."""
    frappe.only_for(_ALLOWED_ROLES)


@frappe.whitelist()
def get_team_capacity(project: str | None = None) -> list[dict]:
    """Return per-member utilization computed from Work Profile vs active tasks.

    utilization_pct = total_estimated_hours / (daily_target_hours * 5) * 100
    Sorted by utilization_pct descending (most loaded first).
    """
    _require_leader()

    profiles = frappe.get_all(
        _PROFILE_DOCTYPE,
        fields=["user", "daily_target_hours"],
    )

    result: list[dict] = []
    for profile in profiles:
        user = profile["user"]
        daily_target = profile["daily_target_hours"] or 8.0

        task_filters: dict = {
            "assigned_to": user,
            "kanban_status": ("in", list(_ACTIVE_STATUSES)),
        }
        if project:
            task_filters["project"] = project

        tasks = frappe.get_all(
            _TASK_DOCTYPE,
            filters=task_filters,
            fields=["name", "title", "estimated_minutes", "kanban_status", "deadline", "project"],
        )

        total_hours = sum((t["estimated_minutes"] or 0) / 60.0 for t in tasks)
        capacity_hours = daily_target * _WORKING_DAYS_PER_WEEK
        utilization_pct = round((total_hours / capacity_hours) * 100, 1) if capacity_hours else 0.0

        full_name = frappe.db.get_value("User", user, "full_name") or user

        result.append({
            "user": user,
            "full_name": full_name,
            "daily_target_hours": daily_target,
            "active_tasks": len(tasks),
            "total_estimated_hours": round(total_hours, 1),
            "utilization_pct": utilization_pct,
            "tasks": tasks,
        })

    result.sort(key=lambda x: x["utilization_pct"], reverse=True)
    return result
```

- [ ] **Step 8.5: Run tests to verify all pass**

```bash
docker exec frappe-backend-1 bench --site task.localhost run-tests \
    --module "vernon_tasks.task.page.vt_team.test_vt_team" -v
```

Expected: 4 tests PASS.

- [ ] **Step 8.6: Commit**

```bash
git add vernon_tasks/task/page/vt_team/
git commit -m "feat(team): tambah API get_team_capacity untuk kapasitas tim"
```

---

## Task 9 — vt-team: JSON + JS

**Files:**
- Create: `vernon_tasks/task/page/vt_team/vt_team.json`
- Create: `vernon_tasks/task/page/vt_team/vt_team.js`

- [ ] **Step 9.1: Create `vt_team.json`**

```json
{
    "creation": "2026-06-01 00:00:00",
    "docstatus": 0,
    "doctype": "Page",
    "idx": 0,
    "modified": "2026-06-01 00:00:00",
    "modified_by": "Administrator",
    "module": "Task",
    "name": "vt-team",
    "page_name": "vt-team",
    "roles": [
        {"role": "VT Leader"},
        {"role": "VT Manager"}
    ],
    "script": null,
    "standard": "Yes",
    "style": null,
    "system_page": 1,
    "title": "Tim & Kapasitas"
}
```

- [ ] **Step 9.2: Create `vt_team.js`**

```javascript
/* vt_team.js — Team Capacity page for Leaders and Managers.
   Shows per-member utilization bar, active task count, and expandable task list.
   API: task/page/vt_team/vt_team.py */

const TEAM_API = "vernon_tasks.task.page.vt_team.vt_team.get_team_capacity";

const esc = (v) => frappe.utils.escape_html(v == null ? "" : String(v));

function utilization_color(pct) {
    if (pct >= 100) return "var(--red-500)";
    if (pct >= 75)  return "var(--orange-500)";
    if (pct >= 40)  return "var(--green-500)";
    return "var(--text-muted)";
}

frappe.pages["vt-team"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __("Tim & Kapasitas"),
        single_column: true,
    });

    const state = { project: null };

    const project_field = page.add_field({
        fieldname: "project",
        label: __("Proyek"),
        fieldtype: "Link",
        options: "VT Project",
        change: () => { state.project = project_field.get_value() || null; render(); },
    });

    page.add_button(__("Refresh"), render, { icon: "refresh" });

    const container = $('<div class="vt-home" style="padding:20px 20px 48px;"></div>').appendTo(page.main);

    function build_utilization_bar(pct) {
        const color = utilization_color(pct);
        const safe_pct = Math.min(100, pct || 0);
        return `
            <div style="display:flex;align-items:center;gap:8px;min-width:160px;">
                <div style="flex:1;background:var(--border-color);border-radius:4px;height:8px;">
                    <div style="width:${safe_pct.toFixed(1)}%;height:8px;border-radius:4px;background:${color};"></div>
                </div>
                <span style="font-size:12px;font-weight:600;color:${color};min-width:44px;">
                    ${pct.toFixed(0)}%
                </span>
            </div>
        `;
    }

    function build_task_list_row(tasks) {
        if (!tasks.length) return `<div style="padding:8px 16px;font-size:13px;color:var(--text-muted);">${__("Tidak ada tugas aktif")}</div>`;
        const items = tasks.map((t) => `
            <div style="padding:5px 16px;font-size:12px;border-bottom:1px solid var(--border-color);
                 display:flex;justify-content:space-between;align-items:center;">
                <span>${esc(t.title)}</span>
                <span style="color:var(--text-muted);">
                    ${esc(t.estimated_minutes ? Math.round(t.estimated_minutes / 60 * 10) / 10 + ' jam' : '—')}
                    · ${esc(t.kanban_status)}
                </span>
            </div>
        `).join("");
        return items;
    }

    function build_member_card(member) {
        const card = $(`
            <div style="border:1px solid var(--border-color);border-radius:8px;
                 margin-bottom:10px;overflow:hidden;">
                <div class="team-row-header" style="display:flex;align-items:center;gap:16px;
                     padding:12px 16px;cursor:pointer;background:var(--subtle-bg);">
                    <div style="flex:0 0 160px;font-weight:600;font-size:14px;">${esc(member.full_name)}</div>
                    <div style="flex:1;">${build_utilization_bar(member.utilization_pct)}</div>
                    <div style="text-align:right;min-width:80px;font-size:12px;color:var(--text-muted);">
                        ${member.total_estimated_hours}h / ${(member.daily_target_hours * 5).toFixed(0)}h<br>
                        ${member.active_tasks} tugas
                    </div>
                    <span class="team-toggle" style="font-size:16px;color:var(--text-muted);">▾</span>
                </div>
                <div class="team-row-body" style="display:none;">
                    ${build_task_list_row(member.tasks)}
                </div>
            </div>
        `);

        card.find(".team-row-header").on("click", function () {
            const body = card.find(".team-row-body");
            const open = body.is(":visible");
            body.toggle(!open);
            card.find(".team-toggle").text(open ? "▾" : "▴");
        });

        return card;
    }

    function render_summary(members) {
        const total = members.length;
        const overloaded = members.filter((m) => m.utilization_pct >= 100).length;
        const high_load = members.filter((m) => m.utilization_pct >= 75 && m.utilization_pct < 100).length;
        const idle = members.filter((m) => m.utilization_pct < 10).length;

        const row = $(`
            <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:20px;">
                <div class="frappe-card" style="flex:1;min-width:120px;padding:16px;text-align:center;">
                    <div style="font-size:24px;font-weight:700;">${total}</div>
                    <div style="font-size:12px;color:var(--text-muted);">${__("Anggota")}</div>
                </div>
                <div class="frappe-card" style="flex:1;min-width:120px;padding:16px;text-align:center;">
                    <div style="font-size:24px;font-weight:700;color:var(--red-500);">${overloaded}</div>
                    <div style="font-size:12px;color:var(--text-muted);">${__("Overload (≥100%)")}</div>
                </div>
                <div class="frappe-card" style="flex:1;min-width:120px;padding:16px;text-align:center;">
                    <div style="font-size:24px;font-weight:700;color:var(--orange-500);">${high_load}</div>
                    <div style="font-size:12px;color:var(--text-muted);">${__("Beban Tinggi (75–99%)")}</div>
                </div>
                <div class="frappe-card" style="flex:1;min-width:120px;padding:16px;text-align:center;">
                    <div style="font-size:24px;font-weight:700;color:var(--text-muted);">${idle}</div>
                    <div style="font-size:12px;color:var(--text-muted);">${__("Tersedia (<10%)")}</div>
                </div>
            </div>
        `);
        return row;
    }

    function render() {
        container.empty();
        const spinner = $(`<div class="vh-empty">${__("Memuat...")}</div>`).appendTo(container);

        const args = {};
        if (state.project) args.project = state.project;

        frappe.call({ method: TEAM_API, args }).then((r) => {
            spinner.remove();
            const members = r.message || [];

            if (!members.length) {
                container.append(`<div class="vh-empty">${__("Belum ada Work Profile. Set up Work Profile untuk setiap anggota tim terlebih dahulu.")}</div>`);
                return;
            }

            container.append(render_summary(members));
            container.append(`<div class="vh-section-title" style="margin-bottom:12px;">${__("Kapasitas per Anggota")}</div>`);
            members.forEach((m) => container.append(build_member_card(m)));
        });
    }

    render();
};
```

- [ ] **Step 9.3: Commit**

```bash
git add vernon_tasks/task/page/vt_team/vt_team.json
git add vernon_tasks/task/page/vt_team/vt_team.js
git commit -m "feat(team): tambah halaman Tim & Kapasitas (JSON + JS)"
```

---

## Task 10 — Seed navbar items in setup_website.py

**Files:**
- Modify: `vernon_tasks/setup_website.py`

- [ ] **Step 10.1: Add `setup_navbar_items()` function**

Open `vernon_tasks/setup_website.py`. Add this function before `setup_website()`:

```python
# Ordered navbar items seeded into VT Settings.
# is_group=1 items are dropdown group headers; their children set parent_group.
# role_restriction: blank = all roles. Single role name = only that role (and above via boot.py).
_NAVBAR_ITEMS = [
    # ── Standalone ─────────────────────────────────────────────────────────
    dict(label="Beranda",   route="/app/vt-home",      icon="home",          is_group=0, parent_group="", role_restriction="",          enabled=1),
    # ── Saya group (all roles) ─────────────────────────────────────────────
    dict(label="Saya",      route="",                  icon="user",          is_group=1, parent_group="", role_restriction="",          enabled=1),
    dict(label="My Work",   route="/app/my-work",      icon="check-circle",  is_group=0, parent_group="Saya", role_restriction="",     enabled=1),
    dict(label="Dashboard", route="/app/my-dashboard", icon="bar-chart",     is_group=0, parent_group="Saya", role_restriction="",     enabled=1),
    dict(label="Analytics", route="/app/my-analytics", icon="trend",         is_group=0, parent_group="Saya", role_restriction="",     enabled=1),
    dict(label="Scorecard", route="/app/vt-scorecard", icon="star",          is_group=0, parent_group="Saya", role_restriction="",     enabled=1),
    # ── Proyek standalone (all roles) ─────────────────────────────────────
    dict(label="Proyek",    route="/app/vt-projects",  icon="folder-normal", is_group=0, parent_group="", role_restriction="",          enabled=1),
    # ── Leader group ──────────────────────────────────────────────────────
    dict(label="Leader",         route="",                       icon="users",        is_group=1, parent_group="", role_restriction="VT Leader", enabled=1),
    dict(label="Dashboard Tim",  route="/app/leader-dashboard",  icon="dashboard",    is_group=0, parent_group="Leader", role_restriction="VT Leader", enabled=1),
    dict(label="Review",         route="/app/leader-review",     icon="tick",         is_group=0, parent_group="Leader", role_restriction="VT Leader", enabled=1),
    dict(label="Sprint Analytics",route="/app/leader-analytics", icon="chart",        is_group=0, parent_group="Leader", role_restriction="VT Leader", enabled=1),
    dict(label="OKR",            route="/app/vt-okr",            icon="target-doc",   is_group=0, parent_group="Leader", role_restriction="VT Leader", enabled=1),
    dict(label="Tim & Kapasitas",route="/app/vt-team",           icon="users",        is_group=0, parent_group="Leader", role_restriction="VT Leader", enabled=1),
    # ── Eksekutif standalone (Manager) ────────────────────────────────────
    dict(label="Eksekutif", route="/app/exec-analytics", icon="chart",       is_group=0, parent_group="", role_restriction="VT Manager",  enabled=1),
    # ── Admin group (Manager) ─────────────────────────────────────────────
    dict(label="Admin",      route="",                 icon="setting",       is_group=1, parent_group="", role_restriction="VT Manager",  enabled=1),
    dict(label="Pengaturan", route="/app/vt-settings", icon="setting",       is_group=0, parent_group="Admin", role_restriction="VT Manager", enabled=1),
    dict(label="Brand",      route="/app/vt-brands",   icon="badge",         is_group=0, parent_group="Admin", role_restriction="VT Manager", enabled=1),
]


def setup_navbar_items():
    """Seed VT Settings navbar_items with the full structured menu.

    Safe to re-run: clears existing rows and re-inserts in order.
    """
    doc = frappe.get_single("VT Settings")
    doc.set("navbar_items", [])
    for item in _NAVBAR_ITEMS:
        doc.append("navbar_items", item)
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    print(f"✓ Seeded {len(_NAVBAR_ITEMS)} navbar items into VT Settings")
```

- [ ] **Step 10.2: Call it from the main `setup_website()` function**

Find the `setup_website()` function in the same file. Add at the end:

```python
    setup_navbar_items()
```

- [ ] **Step 10.3: Run setup to seed the items**

```bash
docker exec frappe-backend-1 bench --site task.localhost execute \
    "vernon_tasks.setup_website.setup_navbar_items"
```

Expected: `✓ Seeded 17 navbar items into VT Settings`

- [ ] **Step 10.4: Restart backend to flush boot cache**

```bash
docker restart frappe-backend-1
```

- [ ] **Step 10.5: Commit**

```bash
git add vernon_tasks/setup_website.py
git commit -m "feat(navbar): seed 17 navbar items ke VT Settings via setup_navbar_items"
```

---

## Task 11 — migrate + full test run

- [ ] **Step 11.1: Run bench migrate to register new Pages**

```bash
docker exec frappe-backend-1 bench --site task.localhost migrate
```

Expected: migration completes without errors; 3 new Page records created (vt-scorecard, vt-okr, vt-team).

- [ ] **Step 11.2: Restart services to pick up new assets**

```bash
docker exec frappe-backend-1 bench --site task.localhost build --app vernon_tasks
docker restart frappe-backend-1 frappe-frontend-1
```

- [ ] **Step 11.3: Run all new tests**

```bash
docker exec frappe-backend-1 bench --site task.localhost run-tests \
    --module "vernon_tasks.tests.test_boot_navbar" \
    --module "vernon_tasks.task.page.vt_scorecard.test_vt_scorecard" \
    --module "vernon_tasks.task.page.vt_okr.test_vt_okr" \
    --module "vernon_tasks.task.page.vt_team.test_vt_team" \
    -v
```

Expected: 18 tests PASS (4 boot + 5 scorecard + 5 okr + 4 team).

- [ ] **Step 11.4: Verify pages accessible in browser**

Navigate to each new page manually:
- `/app/vt-scorecard` — must load without 403
- `/app/vt-okr` — must load without 403 (login as VT Leader)
- `/app/vt-team` — must load without 403 (login as VT Leader)

- [ ] **Step 11.5: Verify navbar dropdowns render**

Log in as VT Member → confirm: Beranda, Saya ▾, Proyek visible.
Log in as VT Leader → confirm: + Leader ▾ dropdown visible.
Log in as VT Manager → confirm: + Eksekutif, Admin ▾ visible.

- [ ] **Step 11.6: Final commit**

```bash
git add .
git commit -m "test(pages): verifikasi semua 18 test baru hijau — scorecard, okr, team, navbar"
```

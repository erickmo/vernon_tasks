# Dashboard Merge — POV Home — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse `my-dashboard` + `leader-dashboard` into the single post-login `vt-home`, rendered from the user's point of view: a **Beranda** tab (personal) always, and a **Tim** tab (team) for anyone who leads ≥1 project (led-scoped) or is Manager/admin (global).

**Architecture:** All read-aggregation moves into `task/api/dashboard.py` (Vernon rule: dashboard reads live in the API module, not page `.py`). `vt_home.js` gains a two-tab shell; the two old page directories are deleted and every nav/shortcut/seed reference repointed to `vt-home`.

**Tech Stack:** Frappe Framework (Python whitelisted methods + `frappe.db.sql`), desk Page JS (`frappe.pages`, `frappe.Chart`/frappe-charts), MariaDB. Tests = Frappe `unittest.TestCase` run via `bench run-tests` inside Docker.

**Spec:** `docs/superpowers/specs/2026-06-03-dashboard-merge-pov-design.html`

**Branch:** `feat/dashboard-merge-pov` (already created off `master`; spec already committed there).

**Environment note:** bench runs in Docker. All bench commands: `docker exec frappe-backend-1 bench --site task.localhost <cmd>`. New whitelisted Python methods are NOT callable from JS until `docker restart frappe-backend-1` (gunicorn imports the api module once at worker start). Tests run in-process so they do not need the restart; manual browser smoke does.

---

## File Structure

**Modified**
- `vernon_tasks/task/api/dashboard.py` — append 5 new whitelisted methods + private helpers (personal_stats, daily_completions, hours_summary, team_tab_state, team_overview).
- `vernon_tasks/task/page/vt_home/vt_home.js` — add tab shell, fold personal analytics into Beranda, add lazy Tim tab.
- `vernon_tasks/public/css/vt_home.css` — add `.vh-tabs` / `.vh-tab` styles.
- `vernon_tasks/task/page/my_work/my_work.js` — repoint dead sub-nav link.
- `vernon_tasks/task/page/leader_review/leader_review.js` — repoint dead sub-nav link.
- `vernon_tasks/workspace/my_tasks/my_tasks.json` — remove "My Dashboard" shortcut.
- `vernon_tasks/workspace/my_projects/my_projects.json` — remove "Leader Dashboard" shortcut.
- `vernon_tasks/workspace/overview/overview.json` — remove "Leader Dashboard" shortcut.
- `vernon_tasks/setup_website.py` — remove the two dashboard navbar-seed rows.

**Created**
- `vernon_tasks/task/api/test_dashboard_merge.py` — tests for the 5 new methods (self-contained fixtures).

**Deleted**
- `vernon_tasks/task/page/my_dashboard/` (whole dir: `.js`, `.json`, `.py`, `test_my_dashboard.py`, `__pycache__`).
- `vernon_tasks/task/page/leader_dashboard/` (whole dir incl. `test_leader_dashboard.py`).

**Unchanged (verified — do NOT touch):** `hooks.py` (no Page fixture nor asset include for the two pages; `vt-home` fixture + `vt_home.css` stay), `boot.py` `DEFAULT_NAVBAR` (no dashboard literals — confirm in Task 7), `my_work` / `leader_review` / `*_analytics` / `vt_scorecard` page bodies.

---

## Task 1: Backend — personal analytics (personal_stats, daily_completions, hours_summary)

Migrates the 3 useful `my_dashboard` page methods into `dashboard.py`, self-scoped, fixing the hours unit bug at the source. Drops the orphan `get_sprint_kanban`.

**Files:**
- Modify: `vernon_tasks/task/api/dashboard.py` (append at EOF, after the last endpoint)
- Test: `vernon_tasks/task/api/test_dashboard_merge.py` (create)

- [ ] **Step 1: Write the failing test**

Create `vernon_tasks/task/api/test_dashboard_merge.py`:

```python
"""Tests for the merged POV dashboard API (personal + team aggregators).
Covers: PRD-dashboard-merge, bug-hours-unit. See
docs/superpowers/specs/2026-06-03-dashboard-merge-pov-design.html
"""
import unittest

import frappe
from frappe.utils import today, add_days

from vernon_tasks.task.api import dashboard

_BRAND = "TEST-DM-BRAND"
_OWNER = "Administrator"


def _ensure_brand():
    if not frappe.db.exists("VT Brand", _BRAND):
        frappe.get_doc({"doctype": "VT Brand", "brand_name": _BRAND}).insert(
            ignore_permissions=True
        )
    return _BRAND


def _make_project(title, leader=None):
    existing = frappe.db.get_value("VT Project", {"title": title}, "name")
    if existing:
        return frappe.get_doc("VT Project", existing)
    return frappe.get_doc({
        "doctype": "VT Project",
        "title": title,
        "brand": _ensure_brand(),
        "project_owner": _OWNER,
        "project_leader": leader,
        "start_date": today(),
        "end_date": add_days(today(), 30),
        "pdca_phase": "DO",
    }).insert(ignore_permissions=True)


def _make_task(title, project, assigned_to, pdca_phase="PLAN",
               kanban_status="Scheduled", earned_points=0, completion_date=None,
               revision_count=0, deadline=None, actual_minutes=0,
               estimated_minutes=0):
    return frappe.get_doc({
        "doctype": "VT Task",
        "title": title,
        "project": project,
        "assigned_to": assigned_to,
        "pdca_phase": pdca_phase,
        "kanban_status": kanban_status,
        "earned_points": earned_points,
        "completion_date": completion_date,
        "revision_count": revision_count,
        "deadline": deadline,
        "actual_minutes": actual_minutes,
        "estimated_minutes": estimated_minutes,
        "start_date": add_days(today(), -10),
    }).insert(ignore_permissions=True)


class TestPersonalDashboard(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        frappe.set_user("Administrator")
        cls.project = _make_project("DM Personal Project").name
        _make_task("DM done today", cls.project, _OWNER, pdca_phase="DONE",
                   kanban_status="Done", earned_points=3, completion_date=today())
        _make_task("DM active hrs", cls.project, _OWNER, pdca_phase="DO",
                   kanban_status="In Progress", actual_minutes=120,
                   estimated_minutes=180)

    def test_personal_stats_counts_done_today(self):
        out = dashboard.personal_stats()
        self.assertGreaterEqual(out["done_today"], 1)
        self.assertIn("points_month", out)
        self.assertIn("blocked", out)

    def test_daily_completions_zero_filled_seven_days(self):
        out = dashboard.daily_completions()
        self.assertEqual(len(out), 7)
        self.assertTrue(all("date" in r and "count" in r for r in out))

    def test_hours_summary_returns_hours_not_minutes(self):
        out = dashboard.hours_summary()
        # actual_minutes=120 -> 2.0h logged; remaining (180-120)=60min -> 1.0h
        self.assertEqual(out["logged_hours"], 2.0)
        self.assertEqual(out["remaining_hours"], 1.0)
        self.assertNotIn("actual_minutes", out)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker exec frappe-backend-1 bench --site task.localhost run-tests --module vernon_tasks.task.api.test_dashboard_merge`
Expected: FAIL — `AttributeError: module 'vernon_tasks.task.api.dashboard' has no attribute 'personal_stats'`.

- [ ] **Step 3: Append the implementation to `dashboard.py`**

Add at end of `vernon_tasks/task/api/dashboard.py`:

```python
# ──────────────────────────────────────────────────────────────────────────
#  Personal dashboard (folded from the deleted my-dashboard page).
#  Self-scoped to frappe.session.user; feeds the Beranda tab of vt-home.
# ──────────────────────────────────────────────────────────────────────────

DONE_PHASE = "DONE"
DAILY_COMPLETION_DAYS = 7
MINUTES_PER_HOUR = 60.0


@frappe.whitelist()
def personal_stats() -> dict[str, Any]:
    """Headline counts for the Beranda tab: tasks done today / this ISO week,
    points earned this calendar month, and currently-blocked task count.
    Self-scoped. Migrated from my_dashboard.get_employee_stats. (PRD-dashboard-merge)"""
    require_login()
    user = frappe.session.user
    _today = today()

    done_today = frappe.db.sql(
        """SELECT COUNT(*) FROM `tabVT Task`
           WHERE assigned_to = %(user)s AND pdca_phase = %(done)s
             AND completion_date = %(today)s""",
        {"user": user, "done": DONE_PHASE, "today": _today}, as_list=True,
    )[0][0]

    done_week = frappe.db.sql(
        """SELECT COUNT(*) FROM `tabVT Task`
           WHERE assigned_to = %(user)s AND pdca_phase = %(done)s
             AND YEARWEEK(completion_date, 1) = YEARWEEK(%(today)s, 1)""",
        {"user": user, "done": DONE_PHASE, "today": _today}, as_list=True,
    )[0][0]

    points_month = frappe.db.sql(
        """SELECT COALESCE(SUM(earned_points), 0) FROM `tabVT Task`
           WHERE assigned_to = %(user)s AND pdca_phase = %(done)s
             AND YEAR(completion_date) = YEAR(%(today)s)
             AND MONTH(completion_date) = MONTH(%(today)s)""",
        {"user": user, "done": DONE_PHASE, "today": _today}, as_list=True,
    )[0][0]

    blocked = frappe.db.sql(
        """SELECT COUNT(DISTINCT t.name) FROM `tabVT Task` t
           INNER JOIN `tabTask Dependency` td ON td.parent = t.name
           INNER JOIN `tabVT Task` bt ON bt.name = td.blocked_by
           WHERE t.assigned_to = %(user)s
             AND t.pdca_phase NOT IN ('DONE', 'ACT')
             AND bt.pdca_phase NOT IN ('DONE', 'ACT')""",
        {"user": user}, as_list=True,
    )[0][0]

    return {
        "done_today": int(done_today),
        "done_week": int(done_week),
        "points_month": float(points_month),
        "blocked": int(blocked),
    }


@frappe.whitelist()
def daily_completions() -> list[dict[str, Any]]:
    """Tasks the user completed on each of the last 7 days, zero-filled, oldest
    first — for the Beranda completions bar chart. Self-scoped. Migrated from
    my_dashboard.get_daily_completions. (PRD-dashboard-merge)"""
    require_login()
    user = frappe.session.user
    start = add_days(today(), -(DAILY_COMPLETION_DAYS - 1))

    rows = frappe.db.sql(
        """SELECT completion_date AS date, COUNT(*) AS count
           FROM `tabVT Task`
           WHERE assigned_to = %(user)s AND pdca_phase = %(done)s
             AND completion_date >= %(start)s AND completion_date <= %(today)s
           GROUP BY completion_date""",
        {"user": user, "done": DONE_PHASE, "start": start, "today": today()},
        as_dict=True,
    )

    counts_by_date = {str(r["date"]): r["count"] for r in rows}
    out: list[dict[str, Any]] = []
    for i in range(DAILY_COMPLETION_DAYS):
        d = str(add_days(today(), -(DAILY_COMPLETION_DAYS - 1 - i)))
        out.append({"date": d, "count": int(counts_by_date.get(d, 0))})
    return out


@frappe.whitelist()
def hours_summary() -> dict[str, Any]:
    """Logged vs remaining effort across the user's active (non-DONE/ACT) tasks,
    returned in HOURS. Migrated from my_dashboard.get_hours_summary, which
    returned raw minutes while its chart mislabeled them 'Hours' — this fixes the
    unit at the source. Self-scoped. (PRD-dashboard-merge / bug-hours-unit)"""
    require_login()
    user = frappe.session.user

    row = frappe.db.sql(
        """SELECT COALESCE(SUM(actual_minutes), 0) AS actual_minutes,
                  COALESCE(SUM(estimated_minutes), 0) AS estimated_minutes
           FROM `tabVT Task`
           WHERE assigned_to = %(user)s AND pdca_phase NOT IN ('DONE', 'ACT')""",
        {"user": user}, as_dict=True,
    )

    actual = float(row[0]["actual_minutes"])
    estimated = float(row[0]["estimated_minutes"])
    remaining = max(0.0, estimated - actual)
    return {
        "logged_hours": round(actual / MINUTES_PER_HOUR, 1),
        "remaining_hours": round(remaining / MINUTES_PER_HOUR, 1),
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker exec frappe-backend-1 bench --site task.localhost run-tests --module vernon_tasks.task.api.test_dashboard_merge`
Expected: PASS (3 tests in `TestPersonalDashboard`).

- [ ] **Step 5: Commit**

```bash
git add vernon_tasks/task/api/dashboard.py vernon_tasks/task/api/test_dashboard_merge.py
git commit -m "feat(dashboard): tambah personal_stats/daily_completions/hours_summary (fix unit jam)"
```

---

## Task 2: Backend — team aggregator (team_tab_state, team_overview) re-scoped

Folds the 4 `leader_dashboard` methods into one scoped `team_overview` + a cheap `team_tab_state`. Scope resolved server-side: Manager/admin → global; otherwise led projects only.

**Files:**
- Modify: `vernon_tasks/task/api/dashboard.py` (append after Task 1 block)
- Test: `vernon_tasks/task/api/test_dashboard_merge.py` (extend)

- [ ] **Step 1: Write the failing test**

Append to `vernon_tasks/task/api/test_dashboard_merge.py`:

```python
def _ensure_user(email, roles):
    if not frappe.db.exists("User", email):
        frappe.get_doc({
            "doctype": "User", "email": email, "first_name": email.split("@")[0],
            "send_welcome_email": 0,
        }).insert(ignore_permissions=True)
    user = frappe.get_doc("User", email)
    user.add_roles(*roles)
    return email


class TestTeamDashboard(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        frappe.set_user("Administrator")
        cls.leader = _ensure_user("dm_leader@test.local", ["VT Leader", "VT Member"])
        cls.manager = _ensure_user("dm_manager@test.local", ["VT Manager", "VT Member"])
        cls.plain = _ensure_user("dm_plain@test.local", ["VT Member"])
        # Led project (leader is project_leader) + a foreign project the leader
        # does NOT lead — used to prove led-scope filtering.
        cls.led = _make_project("DM Led Project", leader=cls.leader).name
        cls.other = _make_project("DM Other Project").name
        _make_task("DM led overdue", cls.led, cls.leader, pdca_phase="DO",
                   kanban_status="In Progress", deadline=add_days(today(), -2))
        _make_task("DM other overdue", cls.other, cls.manager, pdca_phase="DO",
                   kanban_status="In Progress", deadline=add_days(today(), -2))

    @classmethod
    def tearDownClass(cls):
        frappe.set_user("Administrator")

    def test_tab_state_plain_member_not_visible(self):
        frappe.set_user(self.plain)
        try:
            st = dashboard.team_tab_state()
            self.assertFalse(st["visible"])
        finally:
            frappe.set_user("Administrator")

    def test_tab_state_leader_led_scope(self):
        frappe.set_user(self.leader)
        try:
            st = dashboard.team_tab_state()
            self.assertTrue(st["visible"])
            self.assertEqual(st["scope"], "led")
            self.assertGreaterEqual(st["led_count"], 1)
        finally:
            frappe.set_user("Administrator")

    def test_tab_state_manager_global_scope(self):
        frappe.set_user(self.manager)
        try:
            st = dashboard.team_tab_state()
            self.assertTrue(st["visible"])
            self.assertEqual(st["scope"], "global")
        finally:
            frappe.set_user("Administrator")

    def test_overview_led_scope_excludes_foreign_projects(self):
        frappe.set_user(self.leader)
        try:
            data = dashboard.team_overview()
            self.assertEqual(data["scope"], "led")
            titles = {o["task_title"] for o in data["overdue"]}
            self.assertIn("DM led overdue", titles)
            self.assertNotIn("DM other overdue", titles)
        finally:
            frappe.set_user("Administrator")

    def test_overview_manager_global_includes_all(self):
        frappe.set_user(self.manager)
        try:
            data = dashboard.team_overview()
            self.assertEqual(data["scope"], "global")
            titles = {o["task_title"] for o in data["overdue"]}
            self.assertIn("DM led overdue", titles)
            self.assertIn("DM other overdue", titles)
        finally:
            frappe.set_user("Administrator")

    def test_overview_denied_for_plain_member(self):
        frappe.set_user(self.plain)
        try:
            with self.assertRaises(frappe.PermissionError):
                dashboard.team_overview()
        finally:
            frappe.set_user("Administrator")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker exec frappe-backend-1 bench --site task.localhost run-tests --module vernon_tasks.task.api.test_dashboard_merge`
Expected: FAIL — `AttributeError: module ... has no attribute 'team_tab_state'`.

- [ ] **Step 3: Append the implementation to `dashboard.py`**

Add after the Task 1 block:

```python
# ──────────────────────────────────────────────────────────────────────────
#  Team dashboard (folded + re-scoped from the deleted leader-dashboard page).
#  Scope: VT Manager / admin → global; anyone leading >=1 project → led-only.
# ──────────────────────────────────────────────────────────────────────────

MANAGER_ROLE = "VT Manager"
IN_REVIEW_STATUS = "In Review"
CHECK_PHASE = "CHECK"
LEADERBOARD_LIMIT = 10


def _resolve_team_scope(user: str) -> tuple[str, set[str] | None]:
    """Decide a caller's team-view scope. ('global', None) for admins and VT
    Managers; ('led', led_ids) for anyone leading >=1 project; raises
    PermissionError otherwise. Both team_tab_state and team_overview defer to
    this so the rule lives once and the client can never widen its own scope."""
    if _is_admin() or MANAGER_ROLE in frappe.get_roles(user):
        return "global", None
    led, _member = _user_project_ids(user)
    if led:
        return "led", led
    frappe.throw("Not authorized", frappe.PermissionError)


def _scope_clause(scope: str, led_ids: set[str] | None, column: str) -> tuple[str, dict[str, Any]]:
    """Build the optional ' AND <column> IN %(projects)s' fragment + params that
    restrict a team query to led projects; ('', {}) for global scope so one query
    string serves both. `column` is the project column ('project' unaliased,
    't.project' when the task table is aliased). pymysql renders the tuple as a
    SQL list, so led_ids must be non-empty (guaranteed in 'led' scope)."""
    if scope == "led":
        return f" AND {column} IN %(projects)s", {"projects": tuple(led_ids)}
    return "", {}


@frappe.whitelist()
def team_tab_state() -> dict[str, Any]:
    """Cheap probe driving Tim-tab visibility in vt-home. Never throws for a
    logged-in user: returns visible=False for someone who neither manages nor
    leads any project. (PRD-dashboard-merge)"""
    require_login()
    user = frappe.session.user
    if _is_admin() or MANAGER_ROLE in frappe.get_roles(user):
        return {"visible": True, "scope": "global", "led_count": 0}
    led, _member = _user_project_ids(user)
    if led:
        return {"visible": True, "scope": "led", "led_count": len(led)}
    return {"visible": False, "scope": None, "led_count": 0}


def _team_stats(scope: str, led_ids: set[str] | None) -> dict[str, Any]:
    """Pending-review count, first-try approval rate %, and points earned this
    month, restricted to `scope`. approval_rate = DONE-this-month with
    revision_count=0 over all DONE-this-month."""
    _today = today()
    clause, extra = _scope_clause(scope, led_ids, "project")

    pending_review = frappe.db.sql(
        f"""SELECT COUNT(*) FROM `tabVT Task`
            WHERE kanban_status = %(in_review)s AND pdca_phase = %(check)s{clause}""",
        {"in_review": IN_REVIEW_STATUS, "check": CHECK_PHASE, **extra}, as_list=True,
    )[0][0]

    agg = frappe.db.sql(
        f"""SELECT COUNT(*) AS month_done,
                   SUM(CASE WHEN revision_count = 0 THEN 1 ELSE 0 END) AS approved,
                   COALESCE(SUM(earned_points), 0) AS team_points
            FROM `tabVT Task`
            WHERE pdca_phase = %(done)s
              AND YEAR(completion_date) = YEAR(%(today)s)
              AND MONTH(completion_date) = MONTH(%(today)s){clause}""",
        {"done": DONE_PHASE, "today": _today, **extra}, as_dict=True,
    )[0]

    month_done = int(agg["month_done"] or 0)
    approved = int(agg["approved"] or 0)
    rate = round(approved / month_done * 100, 1) if month_done > 0 else 0.0
    return {
        "pending_review": int(pending_review),
        "approval_rate": float(rate),
        "team_points_month": float(agg["team_points"] or 0),
    }


def _team_phase_distribution(scope: str, led_ids: set[str] | None) -> list[dict[str, Any]]:
    """Task counts grouped by PDCA phase (BACKLOG→DONE order), restricted to scope."""
    clause, extra = _scope_clause(scope, led_ids, "project")
    rows = frappe.db.sql(
        f"""SELECT pdca_phase AS phase, COUNT(*) AS count FROM `tabVT Task`
            WHERE 1=1{clause}
            GROUP BY pdca_phase
            ORDER BY FIELD(pdca_phase, 'BACKLOG','PLAN','DO','CHECK','ACT','DONE')""",
        extra, as_dict=True,
    )
    return [{"phase": r["phase"], "count": int(r["count"])} for r in rows]


def _team_leaderboard(scope: str, led_ids: set[str] | None) -> list[dict[str, Any]]:
    """Top members by points earned this month, restricted to scope."""
    clause, extra = _scope_clause(scope, led_ids, "project")
    rows = frappe.db.sql(
        f"""SELECT assigned_to AS member, COALESCE(SUM(earned_points), 0) AS points
            FROM `tabVT Task`
            WHERE pdca_phase = %(done)s
              AND YEAR(completion_date) = YEAR(%(today)s)
              AND MONTH(completion_date) = MONTH(%(today)s){clause}
            GROUP BY assigned_to ORDER BY points DESC LIMIT {LEADERBOARD_LIMIT}""",
        {"done": DONE_PHASE, "today": today(), **extra}, as_dict=True,
    )
    return [{"member": r["member"], "points": float(r["points"])} for r in rows]


def _team_overdue(scope: str, led_ids: set[str] | None) -> list[dict[str, Any]]:
    """Open (non-DONE/ACT) tasks past deadline, most-overdue first, scope-restricted."""
    clause, extra = _scope_clause(scope, led_ids, "t.project")
    rows = frappe.db.sql(
        f"""SELECT t.name AS task_name, t.title AS task_title, t.assigned_to AS member,
                   t.deadline, t.pdca_phase AS phase,
                   DATEDIFF(%(today)s, t.deadline) AS days_overdue
            FROM `tabVT Task` t
            WHERE t.deadline < %(today)s
              AND t.pdca_phase NOT IN ('DONE', 'ACT'){clause}
            ORDER BY days_overdue DESC""",
        {"today": today(), **extra}, as_dict=True,
    )
    return [
        {"task_name": r["task_name"], "task_title": r["task_title"],
         "member": r["member"], "deadline": str(r["deadline"]),
         "phase": r["phase"], "days_overdue": int(r["days_overdue"])}
        for r in rows
    ]


@frappe.whitelist()
def team_overview() -> dict[str, Any]:
    """Aggregate leadership cockpit for the Tim tab: review/approval KPIs, PDCA
    phase mix, points leaderboard, and overdue tasks — scoped by
    _resolve_team_scope (led projects for leaders, global for managers/admins).
    Re-resolves scope server-side; never trusts a client hint. Folded + re-scoped
    from the deleted leader_dashboard page. (PRD-dashboard-merge)"""
    require_login()
    user = frappe.session.user
    scope, led_ids = _resolve_team_scope(user)
    return {
        "scope": scope,
        "stats": _team_stats(scope, led_ids),
        "phase_distribution": _team_phase_distribution(scope, led_ids),
        "leaderboard": _team_leaderboard(scope, led_ids),
        "overdue": _team_overdue(scope, led_ids),
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker exec frappe-backend-1 bench --site task.localhost run-tests --module vernon_tasks.task.api.test_dashboard_merge`
Expected: PASS (all of `TestPersonalDashboard` + `TestTeamDashboard`).

- [ ] **Step 5: Commit**

```bash
git add vernon_tasks/task/api/dashboard.py vernon_tasks/task/api/test_dashboard_merge.py
git commit -m "feat(dashboard): tambah team_overview/team_tab_state ber-scope (leader=led, manager=global)"
```

---

## Task 3: Frontend — tab shell + fold personal analytics into Beranda

Restructure `vt_home.js` into a two-panel tab shell; move the existing Beranda renders into the Beranda panel and add the two ported personal charts.

**Files:**
- Modify: `vernon_tasks/task/page/vt_home/vt_home.js`
- Modify: `vernon_tasks/public/css/vt_home.css`

- [ ] **Step 1: Add tab styles to `vt_home.css`**

Append to `vernon_tasks/public/css/vt_home.css`:

```css
/* Dashboard tab strip (Beranda / Tim) */
.vh-tabs { display: flex; gap: 4px; margin: 8px 0 4px; border-bottom: 1px solid var(--border-color); }
.vh-tab { background: none; border: none; padding: 10px 16px; font-weight: 600;
          color: var(--text-muted); cursor: pointer; border-bottom: 2px solid transparent; }
.vh-tab:hover { color: var(--text-color); }
.vh-tab.active { color: #2563eb; border-bottom-color: #2563eb; }
```

- [ ] **Step 2: Replace the page-load + orchestrator block in `vt_home.js`**

In `vernon_tasks/task/page/vt_home/vt_home.js`, replace the existing `frappe.pages["vt-home"].on_page_load = ...` function AND the existing `render_all(page)` function with:

```javascript
// Module-scoped lazy state for the Tim tab (reset on every Refresh).
let team_loaded = false;

frappe.pages["vt-home"].on_page_load = function (wrapper) {
    // Gray page background; styled via .vt-gray-bg in vt_home.css.
    $(wrapper).addClass("vt-gray-bg");
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: "Beranda",
        single_column: true,
    });
    page.add_button(__("Refresh"), () => render_all(page), { icon: "refresh" });
    page.set_primary_action(__("Buat Proyek"), () => vt_quick_create_project(), "add");
    render_all(page);
};

// Build the tab strip + two panels into page.main, wire tab switching, and
// return the strip element. Tim panel stays hidden until probe_team_tab reveals
// the button; team_overview is fetched lazily on first Tim activation.
function build_tabs(page) {
    const el = $(`
        <div>
            <div class="vh-tabs">
                <button class="vh-tab active" data-tab="beranda">Beranda</button>
                <button class="vh-tab" data-tab="tim" style="display:none;">Tim</button>
            </div>
            <div class="vh-panel vt-home" data-panel="beranda"></div>
            <div class="vh-panel vt-home" data-panel="tim" style="display:none;"></div>
        </div>
    `);
    page.main.empty().append(el);
    el.find(".vh-tab").on("click", function () {
        const tab = $(this).data("tab");
        el.find(".vh-tab").removeClass("active");
        $(this).addClass("active");
        el.find(".vh-panel").hide();
        el.find(`.vh-panel[data-panel="${tab}"]`).show();
        if (tab === "tim") render_team_tab();
    });
    return el;
}

function render_all(page) {
    const tabs = build_tabs(page);
    render_beranda(tabs.find('.vh-panel[data-panel="beranda"]'), page);
    team_loaded = false;
    probe_team_tab(tabs);
}

// Personal POV — runs immediately into the Beranda panel.
function render_beranda(c, page) {
    c.empty();
    render_hero(c);
    render_onboarding(c, page);
    frappe.call(`${API}.me_progress`).then((r) => render_progress(c, r.message || {}));
    frappe.call(`${API}.my_projects`).then((r) => render_projects(c, r.message || {}));
    frappe.call(`${API}.daily_completions`).then((r) => render_completions(c, r.message || []));
    frappe.call(`${API}.hours_summary`).then((r) => render_hours(c, r.message || {}));
    frappe.call(`${API}.schedule_agenda`).then((r) => render_schedule(c, r.message || {}));
    render_quick_links(c);
}

// Reveal the Tim tab button only when the caller is eligible (leads >=1 project,
// or is Manager/admin). Scope is decided server-side; this is a visibility hint.
function probe_team_tab(tabs) {
    frappe.call(`${API}.team_tab_state`).then((r) => {
        if ((r.message || {}).visible) {
            tabs.find('.vh-tab[data-tab="tim"]').show();
        }
    });
}
```

- [ ] **Step 3: Add the two personal-analytics renderers**

Add these functions inside the IIFE in `vt_home.js` (e.g. just after `render_progress`). Place the new consts in the existing const block near `VELOCITY_CHART_HEIGHT`:

```javascript
const COMPLETIONS_CHART_HEIGHT = 180;
const COMPLETIONS_COLOR = "#5e64ff";
const HOURS_COLORS = ["#2563eb", "#e0e0e0"];
```

```javascript
// Last-7-days completed-task bar chart (ports my_dashboard render_bar_chart).
// Beranda panel is rebuilt fresh each render, so a new frappe.Chart per call is
// fine — no instance reuse needed.
function render_completions(c, rows) {
    const sec = $('<div class="vh-section"><div class="vh-section-title">Task Selesai — 7 Hari</div></div>');
    const card = $('<div class="vh-card"><div id="vh-completions-chart"></div></div>');
    sec.append(card);
    c.append(sec);
    const data = rows || [];
    const labels = data.map((d) => frappe.datetime.str_to_user(d.date));
    const values = data.map((d) => d.count);
    new frappe.Chart("#vh-completions-chart", {
        type: "bar",
        height: COMPLETIONS_CHART_HEIGHT,
        colors: [COMPLETIONS_COLOR],
        data: { labels, datasets: [{ values }] },
        tooltipOptions: { formatTooltipY: (d) => (d ?? 0) + " task" },
    });
}

// Logged-vs-remaining hours donut (ports my_dashboard render_donut_chart).
// Backend now returns HOURS (logged_hours/remaining_hours) — unit bug fixed.
function render_hours(c, d) {
    const sec = $('<div class="vh-section"><div class="vh-section-title">Jam: Tercatat vs Sisa</div></div>');
    const card = $('<div class="vh-card"><div id="vh-hours-chart"></div></div>');
    sec.append(card);
    c.append(sec);
    const logged = d.logged_hours || 0;
    const remaining = d.remaining_hours || 0;
    if (logged === 0 && remaining === 0) {
        card.find("#vh-hours-chart").html('<div class="vh-empty">Tidak ada task aktif.</div>');
        return;
    }
    new frappe.Chart("#vh-hours-chart", {
        type: "donut",
        height: COMPLETIONS_CHART_HEIGHT,
        colors: HOURS_COLORS,
        data: { labels: ["Tercatat", "Sisa"], datasets: [{ values: [logged, remaining] }] },
        tooltipOptions: { formatTooltipY: (v) => (v ?? 0).toFixed(1) + " jam" },
    });
}
```

- [ ] **Step 4: Build assets and reload**

Run: `docker exec frappe-backend-1 bench build --app vernon_tasks`
Then `docker restart frappe-backend-1` (so the new whitelisted methods from Tasks 1–2 are importable).
Open `/app/vt-home` in the browser (hard refresh). Expected: Beranda tab active, shows existing sections PLUS "Task Selesai — 7 Hari" bar and "Jam: Tercatat vs Sisa" donut. No Tim tab yet for a non-leader.

- [ ] **Step 5: Commit**

```bash
git add vernon_tasks/task/page/vt_home/vt_home.js vernon_tasks/public/css/vt_home.css
git commit -m "feat(vt-home): tab shell Beranda + fold grafik personal (completions, jam)"
```

---

## Task 4: Frontend — lazy Tim tab rendering `team_overview`

Add the Tim-panel renderers (KPI cards, PDCA donut, leaderboard bar, overdue table), ported and re-pointed to `team_overview`.

**Files:**
- Modify: `vernon_tasks/task/page/vt_home/vt_home.js`

- [ ] **Step 1: Add Tim helpers + consts**

Add to the const block in `vt_home.js`:

```javascript
const PHASE_COLORS = {
    BACKLOG: "#b0bec5", PLAN: "#5e64ff", DO: "#ff9800",
    CHECK: "#7c4dff", ACT: "#00bcd4", DONE: "#4caf50",
};
const PHASE_COLOR_FALLBACK = "#9e9e9e";
const TEAM_CHART_HEIGHT = 200;
const LEADERBOARD_COLOR = "#5e64ff";
```

Add these shared helpers inside the IIFE (the Tim renderers need them; ported from leader_dashboard.js):

```javascript
const esc = (s) => frappe.utils.escape_html(String(s || ""));

function fmt_deadline(d) {
    if (!d) return "—";
    const diff = frappe.datetime.get_diff(d, frappe.datetime.get_today());
    if (diff < 0) return `<span style="color:var(--red-500)">Overdue ${Math.abs(diff)}d</span>`;
    return frappe.datetime.str_to_user(d);
}
```

- [ ] **Step 2: Add the Tim tab orchestrator + renderers**

Add to `vt_home.js` (inside the IIFE):

```javascript
// Lazy: fetch + render the Tim panel once per render_all cycle. Panel is already
// visible (tab click shows it) before charts build, so width measurement is fine.
function render_team_tab() {
    if (team_loaded) return;
    team_loaded = true;
    const panel = $('.vh-panel[data-panel="tim"]');
    panel.empty();
    frappe.call(`${API}.team_overview`).then((r) => {
        const d = r.message || {};
        render_team_stats(panel, d.stats || {});
        render_team_charts(panel, d.phase_distribution || [], d.leaderboard || []);
        render_team_overdue(panel, d.overdue || []);
    });
}

// Three KPI cards: Pending Review, Approval Rate %, Team Points (month).
function render_team_stats(c, s) {
    const sec = $('<div class="vh-section"><div class="vh-section-title">Tim</div></div>');
    const row = $('<div class="vh-cards"></div>');
    const pending = s.pending_review ?? 0;
    const approval = typeof s.approval_rate === "number" ? s.approval_rate.toFixed(1) + "%" : "—";
    const points = typeof s.team_points_month === "number" ? s.team_points_month.toFixed(1) : "0";
    [["Pending Review", pending], ["Approval Rate", approval], ["Poin Tim (Bulan)", points]]
        .forEach(([label, val]) => {
            row.append(`<div class="vh-stat"><div class="vh-stat-num">${esc(val)}</div>
                        <div class="vh-stat-label">${esc(label)}</div></div>`);
        });
    sec.append(row);
    c.append(sec);
}

// PDCA donut + points leaderboard bar, side by side.
function render_team_charts(c, phase_rows, board_rows) {
    const sec = $('<div class="vh-section"></div>');
    const wrap = $('<div style="display:flex; gap:16px; flex-wrap:wrap;"></div>');
    wrap.append('<div class="vh-card" style="flex:1; min-width:220px;"><div class="vh-section-title">Distribusi Fase PDCA</div><div id="vh-team-donut"></div></div>');
    wrap.append('<div class="vh-card" style="flex:2; min-width:300px;"><div class="vh-section-title">Leaderboard Poin (Bulan)</div><div id="vh-team-bar"></div></div>');
    sec.append(wrap);
    c.append(sec);

    if (phase_rows.length) {
        new frappe.Chart("#vh-team-donut", {
            type: "donut", height: TEAM_CHART_HEIGHT,
            colors: phase_rows.map((r) => PHASE_COLORS[r.phase] || PHASE_COLOR_FALLBACK),
            data: { labels: phase_rows.map((r) => r.phase), datasets: [{ values: phase_rows.map((r) => r.count) }] },
        });
    } else {
        $("#vh-team-donut").html('<div class="vh-empty">Tidak ada task.</div>');
    }

    if (board_rows.length) {
        new frappe.Chart("#vh-team-bar", {
            type: "bar", height: TEAM_CHART_HEIGHT, colors: [LEADERBOARD_COLOR],
            data: {
                labels: board_rows.map((d) => (d.member ? d.member.split("@")[0] : "Unassigned")),
                datasets: [{ values: board_rows.map((d) => d.points) }],
            },
            tooltipOptions: { formatTooltipY: (d) => (d || 0).toFixed(1) + " pts" },
        });
    } else {
        $("#vh-team-bar").html('<div class="vh-empty">Belum ada poin bulan ini.</div>');
    }
}

// Overdue tasks table (team-wide or led-scoped per server resolution).
function render_team_overdue(c, rows) {
    const sec = $(`<div class="vh-section"><div class="vh-section-title">Task Terlambat (${rows.length})</div></div>`);
    const card = $('<div class="vh-card"></div>');
    if (!rows.length) {
        card.html('<div class="vh-empty">Tidak ada task terlambat.</div>');
    } else {
        const body = rows.map((t) => `
            <tr>
                <td>${esc(t.member)}</td>
                <td><a href="/app/vt-task/${esc(t.task_name)}" target="_blank">${esc(t.task_title)}</a></td>
                <td>${fmt_deadline(t.deadline)}</td>
                <td><span style="color:var(--red-500); font-weight:600;">${t.days_overdue ?? 0}d</span></td>
                <td>${esc(t.phase)}</td>
            </tr>`).join("");
        card.html(`<table class="table table-sm" style="margin:0;">
            <thead><tr><th>Member</th><th>Task</th><th>Deadline</th><th>Telat</th><th>Fase</th></tr></thead>
            <tbody>${body}</tbody></table>`);
    }
    sec.append(card);
    c.append(sec);
}
```

> Note: `.vh-cards` / `.vh-stat` / `.vh-stat-num` / `.vh-stat-label` are existing classes used by `render_progress`'s workload cards — reuse them (grep `vh-stat` in `vt_home.css` to confirm; they exist). If absent, fall back to the `.frappe-card` inline style used by `render_team_charts`.

- [ ] **Step 2b: Verify the reused stat classes exist**

Run: `grep -n "vh-stat\|vh-cards" vernon_tasks/public/css/vt_home.css`
Expected: matches. If none, change `render_team_stats` to use `<div class="frappe-card" style="flex:1; min-width:160px; padding:20px; text-align:center;">` cards like the old page. (Decide here, before smoke.)

- [ ] **Step 3: Build + smoke as a leader**

Run: `docker exec frappe-backend-1 bench build --app vernon_tasks`
Log in (or impersonate) a user who is `project_leader` of ≥1 project. Open `/app/vt-home`. Expected: **Tim** tab button visible; clicking it loads KPI cards + PDCA donut + leaderboard + overdue table, scoped to led projects. As a VT Manager: Tim tab visible, data global. As a plain member: no Tim tab.

- [ ] **Step 4: Commit**

```bash
git add vernon_tasks/task/page/vt_home/vt_home.js
git commit -m "feat(vt-home): Tim tab lazy render team_overview (KPI, PDCA, leaderboard, overdue)"
```

---

## Task 5: Delete old pages + migrate test coverage

`team_overview`/personal tests now cover the migrated logic, so the old pages and their tests can go.

**Files:**
- Delete: `vernon_tasks/task/page/my_dashboard/`, `vernon_tasks/task/page/leader_dashboard/`

- [ ] **Step 1: Confirm coverage parity, then delete the directories**

Confirm `test_dashboard_merge.py` asserts: pending-review filter, approval-rate definition, points, overdue, phase distribution, self-scoped personal stats, hours unit. (It does — Tasks 1–2.) Then:

```bash
git rm -r vernon_tasks/task/page/my_dashboard vernon_tasks/task/page/leader_dashboard
```

- [ ] **Step 2: Verify no code imports the deleted modules**

Run: `grep -rn "page.my_dashboard\|page.leader_dashboard\|pages\[.my-dashboard\|pages\[.leader-dashboard" vernon_tasks --include=*.py --include=*.js`
Expected: no matches (the dirs are gone; nav refs handled in Task 6).

- [ ] **Step 3: Run the full api test module to confirm nothing broke**

Run: `docker exec frappe-backend-1 bench --site task.localhost run-tests --module vernon_tasks.task.api.test_dashboard_merge`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(dashboard): hapus page my-dashboard + leader-dashboard (digabung ke vt-home)"
```

---

## Task 6: Repoint nav, shortcuts, and navbar seed

Fix every reference that pointed at the now-deleted routes so nothing 404s.

**Files:**
- Modify: `my_work.js`, `leader_review.js`, `my_tasks.json`, `my_projects.json`, `overview.json`, `setup_website.py`

- [ ] **Step 1: Fix the two page sub-nav links**

In `vernon_tasks/task/page/my_work/my_work.js`, replace the nav array:

```javascript
    vt_render_page_nav(page, [
        { label: "My Tasks", route: "workspace/My Tasks", icon: "home" },
        { label: "Beranda", route: "vt-home", icon: "bar-chart" },
    ]);
```

In `vernon_tasks/task/page/leader_review/leader_review.js`, replace the nav array:

```javascript
    vt_render_page_nav(page, [
        { label: "My Projects", route: "workspace/My Projects", icon: "home" },
        { label: "Beranda", route: "vt-home", icon: "bar-chart" },
    ]);
```

- [ ] **Step 2: Remove the three workspace shortcuts**

Edit each workspace fixture's `shortcuts` array, removing the dashboard object AND fixing the preceding comma so JSON stays valid:
- `vernon_tasks/workspace/my_tasks/my_tasks.json` — delete the `"label": "My Dashboard"` / `"link_to": "my-dashboard"` object (last in array).
- `vernon_tasks/workspace/my_projects/my_projects.json` — delete the `"label": "Leader Dashboard"` / `"link_to": "leader-dashboard"` object (last in array).
- `vernon_tasks/workspace/overview/overview.json` — delete the `"label": "Leader Dashboard"` / `"link_to": "leader-dashboard"` object (mid-array; remove its trailing comma).

After each edit, validate: `python3 -c "import json,sys; json.load(open(sys.argv[1]))" <file>` — expect no error. The `content` layout strings do NOT reference these shortcuts, so leave `content` alone.

- [ ] **Step 3: Remove the two navbar-seed rows**

In `vernon_tasks/setup_website.py`, delete these two lines from `_NAVBAR_ITEMS`:

```python
    dict(label="Dashboard",      route="/app/my-dashboard",   icon="bar-chart",     is_group=0, parent_group="Saya",   role_restriction="",          enabled=1),
```
```python
    dict(label="Dashboard Tim",  route="/app/leader-dashboard",icon="dashboard",    is_group=0, parent_group="Leader", role_restriction="VT Leader", enabled=1),
```

(The standalone "Beranda" → `/app/vt-home` row stays — it already points at the merged dashboard.)

- [ ] **Step 4: Re-seed the navbar + verify no dangling references**

Run: `docker exec frappe-backend-1 bench --site task.localhost migrate` (runs `after_migrate` → `ensure_navbar_seeded`). If the navbar was already seeded (non-empty), manually clear+reseed: `docker exec frappe-backend-1 bench --site task.localhost execute vernon_tasks.setup_website.setup_navbar_items` (confirm function name/path), or edit `VT Settings.navbar_items` in the UI.
Then: `grep -rn "my-dashboard\|leader-dashboard" vernon_tasks --include=*.js --include=*.json --include=*.py`
Expected: only the optional comment in `public/js/page_nav.js:6` (harmless) — no functional references.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix(nav): repoint sub-nav, shortcut, dan seed navbar ke vt-home"
```

---

## Task 7: Migrate, rebuild, full smoke + docs

- [ ] **Step 1: Confirm boot.py has no dashboard literals**

Run: `grep -n "my-dashboard\|leader-dashboard" vernon_tasks/boot.py`
Expected: no matches. (If any appear in `DEFAULT_NAVBAR`, remove them the same way as Task 6 Step 3.)

- [ ] **Step 2: Full rebuild + restart + migrate**

```bash
docker exec frappe-backend-1 bench build --app vernon_tasks
docker restart frappe-backend-1
docker exec frappe-backend-1 bench --site task.localhost migrate
```

- [ ] **Step 3: Run the full app test suite for regressions**

Run: `docker exec frappe-backend-1 bench --site task.localhost run-tests --app vernon_tasks`
Expected: no NEW failures vs baseline. (Per project memory ~33 task-module fixtures error on pre-existing `MandatoryError` for brand/project_owner — those are not regressions from this change.)

- [ ] **Step 4: Manual smoke matrix**

Verify in browser:
- Plain member: `/app/vt-home` → Beranda only, both personal charts render, no Tim tab. Navbar has no "Dashboard" under "Saya".
- Project leader: Tim tab appears, data limited to led projects; overdue table excludes foreign-project tasks.
- Manager/admin: Tim tab appears, data global.
- `/app/my-work` and `/app/leader-review` sub-nav "Beranda" link opens `/app/vt-home` (no 404).
- Old routes `/app/my-dashboard` and `/app/leader-dashboard` no longer resolve (expected — deleted).

- [ ] **Step 5: Update docs + memory**

- Edit `docs/implementation-tracker.md` (if present): mark dashboard-merge PRD row implemented, add Tests column = `test_dashboard_merge.py`.
- Update OpenWolf `.wolf/anatomy.md`: remove the `my_dashboard` + `leader_dashboard` page entries; update the `vt_home.js` entry (now tabbed) and the `dashboard.py` entry (new methods).
- Append a line to `.wolf/memory.md`.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "docs(dashboard): perbarui tracker + anatomy untuk merge POV dashboard"
```

---

## Finishing

After all tasks pass, use `superpowers:finishing-a-development-branch` to merge `feat/dashboard-merge-pov` into `master` (`--no-ff`), push, and delete the branch — per Vernon dev flow steps 12–14.

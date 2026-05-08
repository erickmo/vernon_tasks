# Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two standalone Frappe pages — `my-dashboard` (employee KPIs) and `leader-dashboard` (team KPIs) — each with number cards and Frappe Charts.

**Architecture:** Two Frappe pages, each with an isolated Python module (whitelist API functions) and a JS file that builds number cards + charts using `frappe.Chart`. No shared state between pages. Workspace shortcuts added to `my_tasks` and `overview` workspaces.

**Tech Stack:** Frappe v15, Python 3.11, Frappe Charts (built-in `frappe.Chart`), vanilla JS (no bundler)

---

## File Map

### Created
| File | Responsibility |
|---|---|
| `vernon_tasks/task/page/my_dashboard/__init__.py` | Empty package marker |
| `vernon_tasks/task/page/my_dashboard/my_dashboard.json` | Page doctype fixture (roles, title) |
| `vernon_tasks/task/page/my_dashboard/my_dashboard.py` | Python APIs: `get_employee_stats`, `get_daily_completions`, `get_hours_summary` |
| `vernon_tasks/task/page/my_dashboard/my_dashboard.js` | JS: number cards + bar chart + donut chart |
| `vernon_tasks/task/page/my_dashboard/test_my_dashboard.py` | Unit tests for all 3 Python APIs |
| `vernon_tasks/task/page/leader_dashboard/__init__.py` | Empty package marker |
| `vernon_tasks/task/page/leader_dashboard/leader_dashboard.json` | Page doctype fixture (leader roles only) |
| `vernon_tasks/task/page/leader_dashboard/leader_dashboard.py` | Python APIs: `get_leader_stats`, `get_phase_distribution`, `get_team_leaderboard`, `get_overdue_tasks` |
| `vernon_tasks/task/page/leader_dashboard/leader_dashboard.js` | JS: number cards + donut + bar leaderboard + overdue table |
| `vernon_tasks/task/page/leader_dashboard/test_leader_dashboard.py` | Unit tests for all 4 Python APIs |

### Modified
| File | Change |
|---|---|
| `vernon_tasks/workspace/my_tasks/my_tasks.json` | Add My Dashboard shortcut |
| `vernon_tasks/workspace/overview/overview.json` | Add Leader Dashboard shortcut |

---

## Task 1: Employee Dashboard — Python APIs + Tests

**Files:**
- Create: `vernon_tasks/task/page/my_dashboard/__init__.py`
- Create: `vernon_tasks/task/page/my_dashboard/my_dashboard.py`
- Create: `vernon_tasks/task/page/my_dashboard/test_my_dashboard.py`

- [ ] **Step 1: Create package marker**

```bash
touch vernon_tasks/task/page/my_dashboard/__init__.py
```

- [ ] **Step 2: Write failing tests**

Create `vernon_tasks/task/page/my_dashboard/test_my_dashboard.py`:

```python
import frappe
import unittest
from frappe.utils import today, add_days, get_first_day_of_week, get_last_day_of_week

_PROJECT_NAME = None
_PROJECT_TITLE = "Test My Dashboard Project - MD"


def _make_project():
    global _PROJECT_NAME
    if _PROJECT_NAME and frappe.db.exists("VT Project", _PROJECT_NAME):
        return frappe.get_doc("VT Project", _PROJECT_NAME)
    existing = frappe.db.get_value("VT Project", {"title": _PROJECT_TITLE}, "name")
    if existing:
        _PROJECT_NAME = existing
        return frappe.get_doc("VT Project", _PROJECT_NAME)
    doc = frappe.get_doc({
        "doctype": "VT Project",
        "title": _PROJECT_TITLE,
        "project_owner": "Administrator",
        "start_date": today(),
        "end_date": add_days(today(), 30),
        "pdca_phase": "DO",
    }).insert(ignore_permissions=True)
    _PROJECT_NAME = doc.name
    return doc


def _get_project_name():
    global _PROJECT_NAME
    if _PROJECT_NAME:
        return _PROJECT_NAME
    existing = frappe.db.get_value("VT Project", {"title": _PROJECT_TITLE}, "name")
    if existing:
        _PROJECT_NAME = existing
    return _PROJECT_NAME


def _make_task(suffix, assigned_to, pdca_phase="PLAN", kanban_status="Scheduled",
               estimated_hours=4.0, actual_hours=0.0, earned_points=0.0,
               completion_date=None, deadline_offset=5):
    doc = frappe.get_doc({
        "doctype": "VT Task",
        "title": f"MD Task {suffix}",
        "project": _get_project_name(),
        "assigned_to": assigned_to,
        "pdca_phase": pdca_phase,
        "kanban_status": kanban_status,
        "start_date": today(),
        "deadline": add_days(today(), deadline_offset),
        "weight": 3.0,
        "priority": "Medium",
        "estimated_hours": estimated_hours,
        "actual_hours": actual_hours,
        "earned_points": earned_points,
    }).insert(ignore_permissions=True)
    if completion_date:
        frappe.db.set_value("VT Task", doc.name, "completion_date", completion_date)
    return doc


class TestEmployeeDashboardAPI(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        frappe.set_user("Administrator")
        _make_project()
        cls._created_tasks = []

    @classmethod
    def tearDownClass(cls):
        for name in cls._created_tasks:
            if frappe.db.exists("VT Task", name):
                frappe.delete_doc("VT Task", name, force=True)
        pn = _get_project_name()
        if pn and frappe.db.exists("VT Project", pn):
            frappe.delete_doc("VT Project", pn, force=True)
        frappe.db.commit()

    def setUp(self):
        frappe.set_user("Administrator")
        self._test_tasks = []

    def tearDown(self):
        for name in self._test_tasks:
            if frappe.db.exists("VT Task", name):
                frappe.delete_doc("VT Task", name, force=True)
        frappe.db.commit()

    def _track(self, doc):
        self._test_tasks.append(doc.name)
        self.__class__._created_tasks.append(doc.name)
        return doc

    # --- get_employee_stats ---

    def test_get_employee_stats_returns_required_keys(self):
        from vernon_tasks.task.page.my_dashboard.my_dashboard import get_employee_stats
        result = get_employee_stats()
        for key in ("done_today", "done_week", "points_month", "blocked"):
            self.assertIn(key, result)

    def test_done_today_counts_task_completed_today(self):
        self._track(_make_task("done-today", "Administrator",
                               pdca_phase="DONE", kanban_status="Done",
                               completion_date=today(), earned_points=5.0))
        from vernon_tasks.task.page.my_dashboard.my_dashboard import get_employee_stats
        result = get_employee_stats()
        self.assertGreaterEqual(result["done_today"], 1)

    def test_done_today_excludes_not_done_task(self):
        before = self._get_done_today_count()
        self._track(_make_task("active-task", "Administrator",
                               pdca_phase="DO", kanban_status="In Progress"))
        from vernon_tasks.task.page.my_dashboard.my_dashboard import get_employee_stats
        result = get_employee_stats()
        self.assertEqual(result["done_today"], before)

    def _get_done_today_count(self):
        from vernon_tasks.task.page.my_dashboard.my_dashboard import get_employee_stats
        return get_employee_stats()["done_today"]

    def test_points_month_sums_earned_points_this_month(self):
        self._track(_make_task("points-task", "Administrator",
                               pdca_phase="DONE", kanban_status="Done",
                               completion_date=today(), earned_points=10.0))
        from vernon_tasks.task.page.my_dashboard.my_dashboard import get_employee_stats
        result = get_employee_stats()
        self.assertGreaterEqual(result["points_month"], 10.0)

    def test_blocked_counts_tasks_with_active_blockers(self):
        blocker = self._track(_make_task("blocker", "Administrator",
                                         pdca_phase="DO", kanban_status="In Progress"))
        blocked = self._track(_make_task("blocked", "Administrator"))
        blocked_doc = frappe.get_doc("VT Task", blocked.name)
        blocked_doc.append("dependencies", {"blocked_by": blocker.name})
        blocked_doc.save(ignore_permissions=True)

        from vernon_tasks.task.page.my_dashboard.my_dashboard import get_employee_stats
        result = get_employee_stats()
        self.assertGreaterEqual(result["blocked"], 1)

    # --- get_daily_completions ---

    def test_get_daily_completions_returns_7_entries(self):
        from vernon_tasks.task.page.my_dashboard.my_dashboard import get_daily_completions
        result = get_daily_completions()
        self.assertEqual(len(result), 7)

    def test_get_daily_completions_has_date_and_count_keys(self):
        from vernon_tasks.task.page.my_dashboard.my_dashboard import get_daily_completions
        result = get_daily_completions()
        for row in result:
            self.assertIn("date", row)
            self.assertIn("count", row)

    def test_get_daily_completions_counts_todays_completions(self):
        self._track(_make_task("daily-done", "Administrator",
                               pdca_phase="DONE", kanban_status="Done",
                               completion_date=today(), earned_points=3.0))
        from vernon_tasks.task.page.my_dashboard.my_dashboard import get_daily_completions
        result = get_daily_completions()
        today_row = next((r for r in result if r["date"] == today()), None)
        self.assertIsNotNone(today_row)
        self.assertGreaterEqual(today_row["count"], 1)

    # --- get_hours_summary ---

    def test_get_hours_summary_returns_actual_and_estimated(self):
        from vernon_tasks.task.page.my_dashboard.my_dashboard import get_hours_summary
        result = get_hours_summary()
        self.assertIn("actual_hours", result)
        self.assertIn("estimated_hours", result)

    def test_get_hours_summary_sums_active_tasks(self):
        self._track(_make_task("hours-active", "Administrator",
                               pdca_phase="DO", kanban_status="In Progress",
                               estimated_hours=8.0, actual_hours=3.0))
        from vernon_tasks.task.page.my_dashboard.my_dashboard import get_hours_summary
        result = get_hours_summary()
        self.assertGreaterEqual(result["actual_hours"], 3.0)
        self.assertGreaterEqual(result["estimated_hours"], 8.0)

    def test_get_hours_summary_excludes_done_tasks(self):
        before = self._get_hours_summary_actual()
        self._track(_make_task("hours-done", "Administrator",
                               pdca_phase="DONE", kanban_status="Done",
                               estimated_hours=8.0, actual_hours=8.0,
                               completion_date=today()))
        from vernon_tasks.task.page.my_dashboard.my_dashboard import get_hours_summary
        result = get_hours_summary()
        self.assertEqual(result["actual_hours"], before)

    def _get_hours_summary_actual(self):
        from vernon_tasks.task.page.my_dashboard.my_dashboard import get_hours_summary
        return get_hours_summary()["actual_hours"]
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /Users/erickmo/Desktop/Project/frappe && python -m pytest apps/vernon_tasks/vernon_tasks/task/page/my_dashboard/test_my_dashboard.py -v 2>&1 | tail -20
```
Expected: `ModuleNotFoundError` or `ImportError` (module doesn't exist yet)

- [ ] **Step 4: Implement `my_dashboard.py`**

Create `vernon_tasks/task/page/my_dashboard/my_dashboard.py`:

```python
import frappe
from frappe.utils import today, add_days


@frappe.whitelist()
def get_employee_stats() -> dict:
    user = frappe.session.user
    done_today = frappe.db.sql("""
        SELECT COUNT(*) FROM `tabVT Task`
        WHERE assigned_to = %(user)s
          AND pdca_phase = 'DONE'
          AND completion_date = %(today)s
    """, {"user": user, "today": today()}, as_list=True)[0][0]

    done_week = frappe.db.sql("""
        SELECT COUNT(*) FROM `tabVT Task`
        WHERE assigned_to = %(user)s
          AND pdca_phase = 'DONE'
          AND YEARWEEK(completion_date, 1) = YEARWEEK(%(today)s, 1)
    """, {"user": user, "today": today()}, as_list=True)[0][0]

    points_month = frappe.db.sql("""
        SELECT COALESCE(SUM(earned_points), 0) FROM `tabVT Task`
        WHERE assigned_to = %(user)s
          AND pdca_phase = 'DONE'
          AND YEAR(completion_date) = YEAR(%(today)s)
          AND MONTH(completion_date) = MONTH(%(today)s)
    """, {"user": user, "today": today()}, as_list=True)[0][0]

    blocked = frappe.db.sql("""
        SELECT COUNT(DISTINCT t.name) FROM `tabVT Task` t
        INNER JOIN `tabTask Dependency` td ON td.parent = t.name
        INNER JOIN `tabVT Task` bt ON bt.name = td.blocked_by
        WHERE t.assigned_to = %(user)s
          AND t.pdca_phase NOT IN ('DONE')
          AND bt.pdca_phase != 'DONE'
    """, {"user": user}, as_list=True)[0][0]

    return {
        "done_today": int(done_today),
        "done_week": int(done_week),
        "points_month": float(points_month),
        "blocked": int(blocked),
    }


@frappe.whitelist()
def get_daily_completions() -> list:
    user = frappe.session.user
    days = 7
    start = add_days(today(), -(days - 1))
    rows = frappe.db.sql("""
        SELECT completion_date AS date, COUNT(*) AS count
        FROM `tabVT Task`
        WHERE assigned_to = %(user)s
          AND pdca_phase = 'DONE'
          AND completion_date >= %(start)s
          AND completion_date <= %(today)s
        GROUP BY completion_date
    """, {"user": user, "start": start, "today": today()}, as_dict=True)

    counts_by_date = {r["date"]: r["count"] for r in rows}
    result = []
    for i in range(days):
        d = add_days(today(), -(days - 1 - i))
        result.append({"date": str(d), "count": int(counts_by_date.get(d, 0))})
    return result


@frappe.whitelist()
def get_hours_summary() -> dict:
    user = frappe.session.user
    row = frappe.db.sql("""
        SELECT
            COALESCE(SUM(actual_hours), 0) AS actual_hours,
            COALESCE(SUM(estimated_hours), 0) AS estimated_hours
        FROM `tabVT Task`
        WHERE assigned_to = %(user)s
          AND pdca_phase NOT IN ('DONE', 'ACT')
    """, {"user": user}, as_dict=True)
    return {
        "actual_hours": float(row[0]["actual_hours"]),
        "estimated_hours": float(row[0]["estimated_hours"]),
    }
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/erickmo/Desktop/Project/frappe && python -m pytest apps/vernon_tasks/vernon_tasks/task/page/my_dashboard/test_my_dashboard.py -v 2>&1 | tail -30
```
Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add vernon_tasks/task/page/my_dashboard/__init__.py \
        vernon_tasks/task/page/my_dashboard/my_dashboard.py \
        vernon_tasks/task/page/my_dashboard/test_my_dashboard.py
git commit -m "feat(page/my_dashboard): add employee dashboard Python APIs + tests"
```

---

## Task 2: Employee Dashboard — JSON + JS

**Files:**
- Create: `vernon_tasks/task/page/my_dashboard/my_dashboard.json`
- Create: `vernon_tasks/task/page/my_dashboard/my_dashboard.js`

- [ ] **Step 1: Create page fixture JSON**

Create `vernon_tasks/task/page/my_dashboard/my_dashboard.json`:

```json
{
 "creation": "2026-05-08 00:00:00.000000",
 "doctype": "Page",
 "module": "Task",
 "name": "my-dashboard",
 "page_name": "my-dashboard",
 "roles": [
  {"role": "VT Member"},
  {"role": "VT Leader"},
  {"role": "VT Manager"}
 ],
 "title": "My Dashboard"
}
```

- [ ] **Step 2: Create `my_dashboard.js`**

Create `vernon_tasks/task/page/my_dashboard/my_dashboard.js`:

```javascript
frappe.pages["my-dashboard"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: "My Dashboard",
        single_column: true,
    });

    page.add_button(__("Refresh"), () => render_all(), { icon: "refresh" });

    const container = $('<div class="my-dashboard-container" style="padding: 0 20px 40px;"></div>')
        .appendTo(page.main);

    // ── Number cards ──────────────────────────────────────────────────────────

    const cards_row = $('<div style="display:flex; gap:16px; flex-wrap:wrap; margin-top:20px;"></div>')
        .appendTo(container);

    function make_card(id, label, color) {
        const card = $(`
            <div class="frappe-card" style="flex:1; min-width:160px; padding:20px; text-align:center;">
                <div style="font-size:13px; color:var(--text-muted); margin-bottom:6px;">${label}</div>
                <div id="${id}" style="font-size:28px; font-weight:700; color:var(--${color}-500);">—</div>
            </div>
        `).appendTo(cards_row);
        return card;
    }

    make_card("md-done-today", "Done Today", "green");
    make_card("md-done-week", "Done This Week", "blue");
    make_card("md-points-month", "Points This Month", "orange");
    make_card("md-blocked", "Blocked Tasks", "red");

    function render_stats() {
        frappe.call({
            method: "vernon_tasks.task.page.my_dashboard.my_dashboard.get_employee_stats",
            callback(r) {
                const d = r.message || {};
                $("#md-done-today").text(d.done_today ?? 0);
                $("#md-done-week").text(d.done_week ?? 0);
                $("#md-points-month").text(
                    typeof d.points_month === "number" ? d.points_month.toFixed(1) : "0"
                );
                $("#md-blocked").text(d.blocked ?? 0);
            },
        });
    }

    // ── Charts row ────────────────────────────────────────────────────────────

    const charts_row = $('<div style="display:flex; gap:16px; margin-top:20px; flex-wrap:wrap;"></div>')
        .appendTo(container);

    const bar_card = $(`
        <div class="frappe-card" style="flex:2; min-width:300px; padding:16px;">
            <h5 style="margin:0 0 12px;">Tasks Completed — Last 7 Days</h5>
            <div id="md-bar-chart"></div>
        </div>
    `).appendTo(charts_row);

    const donut_card = $(`
        <div class="frappe-card" style="flex:1; min-width:220px; padding:16px;">
            <h5 style="margin:0 0 12px;">Hours: Logged vs Remaining</h5>
            <div id="md-donut-chart"></div>
        </div>
    `).appendTo(charts_row);

    let bar_chart = null;
    let donut_chart = null;

    function render_bar_chart() {
        frappe.call({
            method: "vernon_tasks.task.page.my_dashboard.my_dashboard.get_daily_completions",
            callback(r) {
                const data = r.message || [];
                const labels = data.map(d => frappe.datetime.str_to_user(d.date));
                const values = data.map(d => d.count);

                if (bar_chart) {
                    bar_chart.update({ labels, datasets: [{ values }] });
                } else {
                    bar_chart = new frappe.Chart("#md-bar-chart", {
                        type: "bar",
                        height: 180,
                        colors: ["#5e64ff"],
                        data: { labels, datasets: [{ values }] },
                        tooltipOptions: { formatTooltipY: d => d + " tasks" },
                    });
                }
            },
        });
    }

    function render_donut_chart() {
        frappe.call({
            method: "vernon_tasks.task.page.my_dashboard.my_dashboard.get_hours_summary",
            callback(r) {
                const d = r.message || { actual_hours: 0, estimated_hours: 0 };
                const remaining = Math.max(0, d.estimated_hours - d.actual_hours);

                if (d.actual_hours === 0 && remaining === 0) {
                    $("#md-donut-chart").html(
                        '<p class="text-muted" style="padding:12px 0;">No active tasks.</p>'
                    );
                    return;
                }

                const chart_data = {
                    labels: ["Logged", "Remaining"],
                    datasets: [{ values: [d.actual_hours, remaining] }],
                };

                if (donut_chart) {
                    donut_chart.update(chart_data);
                } else {
                    donut_chart = new frappe.Chart("#md-donut-chart", {
                        type: "donut",
                        height: 180,
                        colors: ["#5e64ff", "#e0e0e0"],
                        data: chart_data,
                        tooltipOptions: { formatTooltipY: d => d.toFixed(1) + "h" },
                    });
                }
            },
        });
    }

    // ── Render all ────────────────────────────────────────────────────────────

    function render_all() {
        render_stats();
        render_bar_chart();
        render_donut_chart();
    }

    render_all();
};
```

- [ ] **Step 3: Verify page loads in browser**

Run bench and navigate to `/app/my-dashboard`. Verify:
- 4 number cards show (Done Today, Done This Week, Points This Month, Blocked)
- Bar chart renders with 7-day labels
- Donut chart renders (or shows "No active tasks" if none)
- Refresh button rerenders

```bash
cd /Users/erickmo/Desktop/Project/frappe && bench --site inti.localhost migrate 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add vernon_tasks/task/page/my_dashboard/my_dashboard.json \
        vernon_tasks/task/page/my_dashboard/my_dashboard.js
git commit -m "feat(page/my_dashboard): add employee dashboard page JSON and JS UI"
```

---

## Task 3: Leader Dashboard — Python APIs + Tests

**Files:**
- Create: `vernon_tasks/task/page/leader_dashboard/__init__.py`
- Create: `vernon_tasks/task/page/leader_dashboard/leader_dashboard.py`
- Create: `vernon_tasks/task/page/leader_dashboard/test_leader_dashboard.py`

- [ ] **Step 1: Create package marker**

```bash
touch vernon_tasks/task/page/leader_dashboard/__init__.py
```

- [ ] **Step 2: Write failing tests**

Create `vernon_tasks/task/page/leader_dashboard/test_leader_dashboard.py`:

```python
import frappe
import unittest
from frappe.utils import today, add_days

_PROJECT_NAME = None
_PROJECT_TITLE = "Test Leader Dashboard Project - LD"


def _make_project():
    global _PROJECT_NAME
    if _PROJECT_NAME and frappe.db.exists("VT Project", _PROJECT_NAME):
        return frappe.get_doc("VT Project", _PROJECT_NAME)
    existing = frappe.db.get_value("VT Project", {"title": _PROJECT_TITLE}, "name")
    if existing:
        _PROJECT_NAME = existing
        return frappe.get_doc("VT Project", _PROJECT_NAME)
    doc = frappe.get_doc({
        "doctype": "VT Project",
        "title": _PROJECT_TITLE,
        "project_owner": "Administrator",
        "start_date": today(),
        "end_date": add_days(today(), 30),
        "pdca_phase": "DO",
    }).insert(ignore_permissions=True)
    _PROJECT_NAME = doc.name
    return doc


def _get_project_name():
    global _PROJECT_NAME
    if _PROJECT_NAME:
        return _PROJECT_NAME
    existing = frappe.db.get_value("VT Project", {"title": _PROJECT_TITLE}, "name")
    if existing:
        _PROJECT_NAME = existing
    return _PROJECT_NAME


def _make_task(suffix, assigned_to, pdca_phase="PLAN", kanban_status="Scheduled",
               earned_points=0.0, completion_date=None, revision_count=0,
               deadline_offset=5):
    doc = frappe.get_doc({
        "doctype": "VT Task",
        "title": f"LD Task {suffix}",
        "project": _get_project_name(),
        "assigned_to": assigned_to,
        "pdca_phase": pdca_phase,
        "kanban_status": kanban_status,
        "start_date": today(),
        "deadline": add_days(today(), deadline_offset),
        "weight": 3.0,
        "priority": "Medium",
        "earned_points": earned_points,
        "revision_count": revision_count,
    }).insert(ignore_permissions=True)
    if completion_date:
        frappe.db.set_value("VT Task", doc.name, "completion_date", completion_date)
    return doc


class TestLeaderDashboardAPI(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        frappe.set_user("Administrator")
        _make_project()
        cls._created_tasks = []

    @classmethod
    def tearDownClass(cls):
        for name in cls._created_tasks:
            if frappe.db.exists("VT Task", name):
                frappe.delete_doc("VT Task", name, force=True)
        pn = _get_project_name()
        if pn and frappe.db.exists("VT Project", pn):
            frappe.delete_doc("VT Project", pn, force=True)
        frappe.db.commit()

    def setUp(self):
        frappe.set_user("Administrator")
        self._test_tasks = []

    def tearDown(self):
        for name in self._test_tasks:
            if frappe.db.exists("VT Task", name):
                frappe.delete_doc("VT Task", name, force=True)
        frappe.db.commit()

    def _track(self, doc):
        self._test_tasks.append(doc.name)
        self.__class__._created_tasks.append(doc.name)
        return doc

    # --- get_leader_stats ---

    def test_get_leader_stats_returns_required_keys(self):
        from vernon_tasks.task.page.leader_dashboard.leader_dashboard import get_leader_stats
        result = get_leader_stats()
        for key in ("pending_review", "approval_rate", "team_points_month"):
            self.assertIn(key, result)

    def test_pending_review_counts_in_review_tasks(self):
        self._track(_make_task("review-1", "Administrator",
                               pdca_phase="CHECK", kanban_status="In Review"))
        from vernon_tasks.task.page.leader_dashboard.leader_dashboard import get_leader_stats
        result = get_leader_stats()
        self.assertGreaterEqual(result["pending_review"], 1)

    def test_pending_review_excludes_non_check_tasks(self):
        before = self._get_pending_count()
        self._track(_make_task("not-review", "Administrator",
                               pdca_phase="DO", kanban_status="In Progress"))
        from vernon_tasks.task.page.leader_dashboard.leader_dashboard import get_leader_stats
        result = get_leader_stats()
        self.assertEqual(result["pending_review"], before)

    def _get_pending_count(self):
        from vernon_tasks.task.page.leader_dashboard.leader_dashboard import get_leader_stats
        return get_leader_stats()["pending_review"]

    def test_team_points_month_sums_all_members(self):
        self._track(_make_task("points-a", "Administrator",
                               pdca_phase="DONE", kanban_status="Done",
                               earned_points=15.0, completion_date=today()))
        from vernon_tasks.task.page.leader_dashboard.leader_dashboard import get_leader_stats
        result = get_leader_stats()
        self.assertGreaterEqual(result["team_points_month"], 15.0)

    def test_approval_rate_is_between_0_and_100(self):
        from vernon_tasks.task.page.leader_dashboard.leader_dashboard import get_leader_stats
        result = get_leader_stats()
        self.assertGreaterEqual(result["approval_rate"], 0)
        self.assertLessEqual(result["approval_rate"], 100)

    # --- get_phase_distribution ---

    def test_get_phase_distribution_returns_list_of_dicts(self):
        from vernon_tasks.task.page.leader_dashboard.leader_dashboard import get_phase_distribution
        result = get_phase_distribution()
        self.assertIsInstance(result, list)
        for row in result:
            self.assertIn("phase", row)
            self.assertIn("count", row)

    def test_get_phase_distribution_includes_task_phase(self):
        self._track(_make_task("phase-do", "Administrator",
                               pdca_phase="DO", kanban_status="In Progress"))
        from vernon_tasks.task.page.leader_dashboard.leader_dashboard import get_phase_distribution
        result = get_phase_distribution()
        phases = [r["phase"] for r in result]
        self.assertIn("DO", phases)

    # --- get_team_leaderboard ---

    def test_get_team_leaderboard_returns_list(self):
        from vernon_tasks.task.page.leader_dashboard.leader_dashboard import get_team_leaderboard
        result = get_team_leaderboard()
        self.assertIsInstance(result, list)

    def test_get_team_leaderboard_has_member_and_points(self):
        self._track(_make_task("lb-task", "Administrator",
                               pdca_phase="DONE", kanban_status="Done",
                               earned_points=20.0, completion_date=today()))
        from vernon_tasks.task.page.leader_dashboard.leader_dashboard import get_team_leaderboard
        result = get_team_leaderboard()
        if result:
            self.assertIn("member", result[0])
            self.assertIn("points", result[0])

    def test_get_team_leaderboard_max_10_results(self):
        from vernon_tasks.task.page.leader_dashboard.leader_dashboard import get_team_leaderboard
        result = get_team_leaderboard()
        self.assertLessEqual(len(result), 10)

    # --- get_overdue_tasks ---

    def test_get_overdue_tasks_returns_list(self):
        from vernon_tasks.task.page.leader_dashboard.leader_dashboard import get_overdue_tasks
        result = get_overdue_tasks()
        self.assertIsInstance(result, list)

    def test_get_overdue_tasks_includes_past_deadline_active_task(self):
        self._track(_make_task("overdue-1", "Administrator",
                               pdca_phase="DO", kanban_status="In Progress",
                               deadline_offset=-3))
        from vernon_tasks.task.page.leader_dashboard.leader_dashboard import get_overdue_tasks
        result = get_overdue_tasks()
        self.assertGreaterEqual(len(result), 1)
        for row in result:
            self.assertIn("member", row)
            self.assertIn("task_title", row)
            self.assertIn("deadline", row)
            self.assertIn("days_overdue", row)
            self.assertIn("phase", row)

    def test_get_overdue_tasks_excludes_done_tasks(self):
        done_task = self._track(_make_task("overdue-done", "Administrator",
                                            pdca_phase="DONE", kanban_status="Done",
                                            deadline_offset=-3, completion_date=today()))
        from vernon_tasks.task.page.leader_dashboard.leader_dashboard import get_overdue_tasks
        result = get_overdue_tasks()
        names = [r.get("task_name") for r in result]
        self.assertNotIn(done_task.name, names)
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /Users/erickmo/Desktop/Project/frappe && python -m pytest apps/vernon_tasks/vernon_tasks/task/page/leader_dashboard/test_leader_dashboard.py -v 2>&1 | tail -20
```
Expected: `ModuleNotFoundError` or `ImportError`

- [ ] **Step 4: Implement `leader_dashboard.py`**

Create `vernon_tasks/task/page/leader_dashboard/leader_dashboard.py`:

```python
import frappe
from frappe.utils import today, add_days


@frappe.whitelist()
def get_leader_stats() -> dict:
    pending_review = frappe.db.sql("""
        SELECT COUNT(*) FROM `tabVT Task`
        WHERE kanban_status = 'In Review'
    """, as_list=True)[0][0]

    month_done = frappe.db.sql("""
        SELECT COUNT(*) FROM `tabVT Task`
        WHERE pdca_phase = 'DONE'
          AND YEAR(completion_date) = YEAR(%(today)s)
          AND MONTH(completion_date) = MONTH(%(today)s)
    """, {"today": today()}, as_list=True)[0][0]

    approved = frappe.db.sql("""
        SELECT COUNT(*) FROM `tabVT Task`
        WHERE pdca_phase = 'DONE'
          AND revision_count = 0
          AND YEAR(completion_date) = YEAR(%(today)s)
          AND MONTH(completion_date) = MONTH(%(today)s)
    """, {"today": today()}, as_list=True)[0][0]

    approval_rate = round((int(approved) / int(month_done) * 100), 1) if int(month_done) > 0 else 0.0

    team_points_month = frappe.db.sql("""
        SELECT COALESCE(SUM(earned_points), 0) FROM `tabVT Task`
        WHERE pdca_phase = 'DONE'
          AND YEAR(completion_date) = YEAR(%(today)s)
          AND MONTH(completion_date) = MONTH(%(today)s)
    """, {"today": today()}, as_list=True)[0][0]

    return {
        "pending_review": int(pending_review),
        "approval_rate": float(approval_rate),
        "team_points_month": float(team_points_month),
    }


@frappe.whitelist()
def get_phase_distribution() -> list:
    rows = frappe.db.sql("""
        SELECT pdca_phase AS phase, COUNT(*) AS count
        FROM `tabVT Task`
        GROUP BY pdca_phase
        ORDER BY FIELD(pdca_phase, 'BACKLOG', 'PLAN', 'DO', 'CHECK', 'ACT', 'DONE')
    """, as_dict=True)
    return [{"phase": r["phase"], "count": int(r["count"])} for r in rows]


@frappe.whitelist()
def get_team_leaderboard() -> list:
    rows = frappe.db.sql("""
        SELECT
            assigned_to AS member,
            COALESCE(SUM(earned_points), 0) AS points
        FROM `tabVT Task`
        WHERE pdca_phase = 'DONE'
          AND YEAR(completion_date) = YEAR(%(today)s)
          AND MONTH(completion_date) = MONTH(%(today)s)
        GROUP BY assigned_to
        ORDER BY points DESC
        LIMIT 10
    """, {"today": today()}, as_dict=True)
    return [{"member": r["member"], "points": float(r["points"])} for r in rows]


@frappe.whitelist()
def get_overdue_tasks() -> list:
    rows = frappe.db.sql("""
        SELECT
            t.name AS task_name,
            t.title AS task_title,
            t.assigned_to AS member,
            t.deadline,
            t.pdca_phase AS phase,
            DATEDIFF(%(today)s, t.deadline) AS days_overdue
        FROM `tabVT Task` t
        WHERE t.deadline < %(today)s
          AND t.pdca_phase NOT IN ('DONE', 'ACT')
        ORDER BY days_overdue DESC
    """, {"today": today()}, as_dict=True)
    return [
        {
            "task_name": r["task_name"],
            "task_title": r["task_title"],
            "member": r["member"],
            "deadline": str(r["deadline"]),
            "phase": r["phase"],
            "days_overdue": int(r["days_overdue"]),
        }
        for r in rows
    ]
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/erickmo/Desktop/Project/frappe && python -m pytest apps/vernon_tasks/vernon_tasks/task/page/leader_dashboard/test_leader_dashboard.py -v 2>&1 | tail -30
```
Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add vernon_tasks/task/page/leader_dashboard/__init__.py \
        vernon_tasks/task/page/leader_dashboard/leader_dashboard.py \
        vernon_tasks/task/page/leader_dashboard/test_leader_dashboard.py
git commit -m "feat(page/leader_dashboard): add leader dashboard Python APIs + tests"
```

---

## Task 4: Leader Dashboard — JSON + JS

**Files:**
- Create: `vernon_tasks/task/page/leader_dashboard/leader_dashboard.json`
- Create: `vernon_tasks/task/page/leader_dashboard/leader_dashboard.js`

- [ ] **Step 1: Create page fixture JSON**

Create `vernon_tasks/task/page/leader_dashboard/leader_dashboard.json`:

```json
{
 "creation": "2026-05-08 00:00:00.000000",
 "doctype": "Page",
 "module": "Task",
 "name": "leader-dashboard",
 "page_name": "leader-dashboard",
 "roles": [
  {"role": "VT Leader"},
  {"role": "VT Manager"}
 ],
 "title": "Leader Dashboard"
}
```

- [ ] **Step 2: Create `leader_dashboard.js`**

Create `vernon_tasks/task/page/leader_dashboard/leader_dashboard.js`:

```javascript
frappe.pages["leader-dashboard"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: "Leader Dashboard",
        single_column: true,
    });

    page.add_button(__("Refresh"), () => render_all(), { icon: "refresh" });

    const container = $('<div class="leader-dashboard-container" style="padding: 0 20px 40px;"></div>')
        .appendTo(page.main);

    const esc = (s) => frappe.utils.escape_html(String(s || ""));

    function fmt_deadline(d) {
        if (!d) return "—";
        const diff = frappe.datetime.get_diff(d, frappe.datetime.get_today());
        if (diff < 0) return `<span style="color:var(--red-500)">Overdue ${Math.abs(diff)}d</span>`;
        return frappe.datetime.str_to_user(d);
    }

    // ── Number cards ──────────────────────────────────────────────────────────

    const cards_row = $('<div style="display:flex; gap:16px; flex-wrap:wrap; margin-top:20px;"></div>')
        .appendTo(container);

    function make_card(id, label, color) {
        $(`
            <div class="frappe-card" style="flex:1; min-width:160px; padding:20px; text-align:center;">
                <div style="font-size:13px; color:var(--text-muted); margin-bottom:6px;">${label}</div>
                <div id="${id}" style="font-size:28px; font-weight:700; color:var(--${color}-500);">—</div>
            </div>
        `).appendTo(cards_row);
    }

    make_card("ld-pending", "Pending Review", "orange");
    make_card("ld-approval", "Approval Rate %", "green");
    make_card("ld-points", "Team Points (Month)", "blue");

    function render_stats() {
        frappe.call({
            method: "vernon_tasks.task.page.leader_dashboard.leader_dashboard.get_leader_stats",
            callback(r) {
                const d = r.message || {};
                $("#ld-pending").text(d.pending_review ?? 0);
                $("#ld-approval").text(
                    typeof d.approval_rate === "number" ? d.approval_rate.toFixed(1) + "%" : "—"
                );
                $("#ld-points").text(
                    typeof d.team_points_month === "number" ? d.team_points_month.toFixed(1) : "0"
                );
            },
        });
    }

    // ── Charts row ────────────────────────────────────────────────────────────

    const charts_row = $('<div style="display:flex; gap:16px; margin-top:20px; flex-wrap:wrap;"></div>')
        .appendTo(container);

    $(`
        <div class="frappe-card" style="flex:1; min-width:220px; padding:16px;">
            <h5 style="margin:0 0 12px;">PDCA Phase Distribution</h5>
            <div id="ld-donut-chart"></div>
        </div>
    `).appendTo(charts_row);

    $(`
        <div class="frappe-card" style="flex:2; min-width:300px; padding:16px;">
            <h5 style="margin:0 0 12px;">Team Points Leaderboard (This Month)</h5>
            <div id="ld-bar-chart"></div>
        </div>
    `).appendTo(charts_row);

    const PHASE_COLORS = {
        BACKLOG: "#b0bec5", PLAN: "#5e64ff", DO: "#ff9800",
        CHECK: "#7c4dff", ACT: "#00bcd4", DONE: "#4caf50",
    };

    let donut_chart = null;
    let bar_chart = null;

    function render_donut_chart() {
        frappe.call({
            method: "vernon_tasks.task.page.leader_dashboard.leader_dashboard.get_phase_distribution",
            callback(r) {
                const data = r.message || [];
                if (!data.length) {
                    $("#ld-donut-chart").html('<p class="text-muted" style="padding:12px 0;">No tasks found.</p>');
                    return;
                }
                const labels = data.map(d => d.phase);
                const values = data.map(d => d.count);
                const colors = labels.map(p => PHASE_COLORS[p] || "#9e9e9e");
                const chart_data = { labels, datasets: [{ values }] };

                if (donut_chart) {
                    donut_chart.update(chart_data);
                } else {
                    donut_chart = new frappe.Chart("#ld-donut-chart", {
                        type: "donut",
                        height: 200,
                        colors,
                        data: chart_data,
                    });
                }
            },
        });
    }

    function render_bar_chart() {
        frappe.call({
            method: "vernon_tasks.task.page.leader_dashboard.leader_dashboard.get_team_leaderboard",
            callback(r) {
                const data = r.message || [];
                if (!data.length) {
                    $("#ld-bar-chart").html('<p class="text-muted" style="padding:12px 0;">No data this month.</p>');
                    return;
                }
                const labels = data.map(d => d.member.split("@")[0]);
                const values = data.map(d => d.points);
                const chart_data = { labels, datasets: [{ values }] };

                if (bar_chart) {
                    bar_chart.update(chart_data);
                } else {
                    bar_chart = new frappe.Chart("#ld-bar-chart", {
                        type: "bar",
                        height: 200,
                        colors: ["#5e64ff"],
                        data: chart_data,
                        tooltipOptions: { formatTooltipY: d => d.toFixed(1) + " pts" },
                    });
                }
            },
        });
    }

    // ── Overdue tasks table ───────────────────────────────────────────────────

    $(`
        <div class="frappe-card" style="margin-top:20px; padding:16px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <h5 style="margin:0;">Overdue Tasks <span class="badge badge-secondary" id="ld-overdue-count">0</span></h5>
            </div>
            <div id="ld-overdue-body"></div>
        </div>
    `).appendTo(container);

    function render_overdue_table() {
        frappe.call({
            method: "vernon_tasks.task.page.leader_dashboard.leader_dashboard.get_overdue_tasks",
            callback(r) {
                const data = r.message || [];
                $("#ld-overdue-count").text(data.length);
                if (!data.length) {
                    $("#ld-overdue-body").html('<p class="text-muted" style="padding:12px 0;">No overdue tasks.</p>');
                    return;
                }
                const rows = data.map(t => `
                    <tr>
                        <td>${esc(t.member)}</td>
                        <td><a href="/app/vt-task/${esc(t.task_name)}" target="_blank">${esc(t.task_title)}</a></td>
                        <td>${fmt_deadline(t.deadline)}</td>
                        <td><span style="color:var(--red-500); font-weight:600;">${t.days_overdue}d</span></td>
                        <td>${esc(t.phase)}</td>
                    </tr>
                `).join("");
                $("#ld-overdue-body").html(`
                    <table class="table table-sm" style="margin:0;">
                        <thead><tr>
                            <th>Member</th><th>Task</th><th>Deadline</th>
                            <th>Days Overdue</th><th>Phase</th>
                        </tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                `);
            },
        });
    }

    // ── Render all ────────────────────────────────────────────────────────────

    function render_all() {
        render_stats();
        render_donut_chart();
        render_bar_chart();
        render_overdue_table();
    }

    render_all();
};
```

- [ ] **Step 3: Verify page loads in browser**

Run bench migrate and navigate to `/app/leader-dashboard`. Verify:
- 3 number cards (Pending Review, Approval Rate, Team Points)
- PDCA donut chart renders
- Leaderboard bar chart renders
- Overdue tasks table renders (or empty state)
- Refresh button works

```bash
cd /Users/erickmo/Desktop/Project/frappe && bench --site inti.localhost migrate 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add vernon_tasks/task/page/leader_dashboard/leader_dashboard.json \
        vernon_tasks/task/page/leader_dashboard/leader_dashboard.js
git commit -m "feat(page/leader_dashboard): add leader dashboard page JSON and JS UI"
```

---

## Task 5: Workspace Shortcuts

**Files:**
- Modify: `vernon_tasks/workspace/my_tasks/my_tasks.json`
- Modify: `vernon_tasks/workspace/overview/overview.json`

- [ ] **Step 1: Add My Dashboard shortcut to `my_tasks.json`**

Open `vernon_tasks/workspace/my_tasks/my_tasks.json`. Find the `"shortcuts"` array and append:

```json
{
  "color": "Green",
  "icon": "bar-chart",
  "label": "My Dashboard",
  "link_to": "my-dashboard",
  "type": "Page"
}
```

- [ ] **Step 2: Add Leader Dashboard shortcut to `overview.json`**

Open `vernon_tasks/workspace/overview/overview.json`. Find the `"shortcuts"` array and append:

```json
{
  "color": "Purple",
  "icon": "bar-chart",
  "label": "Leader Dashboard",
  "link_to": "leader-dashboard",
  "type": "Page"
}
```

- [ ] **Step 3: Migrate and verify shortcuts appear**

```bash
cd /Users/erickmo/Desktop/Project/frappe && bench --site inti.localhost migrate 2>&1 | tail -5
```

Navigate to My Tasks workspace — verify "My Dashboard" shortcut visible.
Navigate to Overview workspace — verify "Leader Dashboard" shortcut visible.

- [ ] **Step 4: Commit**

```bash
git add vernon_tasks/workspace/my_tasks/my_tasks.json \
        vernon_tasks/workspace/overview/overview.json
git commit -m "feat(workspace): add My Dashboard and Leader Dashboard shortcuts"
```

---

## Self-Review Checklist

- [x] Spec coverage: done_today ✓, done_week ✓, points_month ✓, blocked ✓, bar chart 7-day ✓, donut hours ✓, pending_review ✓, approval_rate ✓, team_points_month ✓, PDCA donut ✓, leaderboard ✓, overdue table ✓, workspace shortcuts ✓
- [x] No TBD/TODO placeholders in any task
- [x] `get_employee_stats` returns same keys (`done_today`, `done_week`, `points_month`, `blocked`) used in JS `render_stats()`
- [x] `get_leader_stats` returns same keys (`pending_review`, `approval_rate`, `team_points_month`) used in JS
- [x] `get_overdue_tasks` returns `task_name`, `task_title`, `member`, `deadline`, `phase`, `days_overdue` — all used in JS table
- [x] `get_phase_distribution` returns `phase`, `count` — used in donut chart
- [x] `get_team_leaderboard` returns `member`, `points` — used in bar chart
- [x] Test helper `_make_task` signature consistent across all uses
- [x] Frappe Charts API: `new frappe.Chart(selector, config)` + `.update(data)` — standard v15 API

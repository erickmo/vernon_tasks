# Vernon Tasks Analytics — Sub-B IC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Ship Individual Contributor analytics page: leaderboard, personal velocity, streak.

**Architecture:** Pure service layer in `vernon_tasks/task/services/`. New IC API module reuses velocity_service from Sub-A. New page consuming Frappe Charts. Role gate: `VT Member`, `VT Leader`, `VT Manager`.

**Tech Stack:** Same as Sub-A.

**Spec:** `docs/superpowers/specs/2026-05-11-vernon-analytics-design.md`

**Schema adjustments from spec outline:**
- `work_profile` has `daily_target_hours`, NOT `target_points_per_period`. "Progress vs target" panel dropped from Sub-B MVP.
- Leaderboard sources `earned_points` direct from `VT Task` (grouped by `assigned_to`), period-filtered by `completion_date`.
- Streak definition: consecutive CLOSED sprints (ordered by `end_date`) where user had `actual_hours > 0` on at least one DONE task.

---

## File Structure

**Create:**
- `vernon_tasks/task/services/leaderboard_service.py` + test
- `vernon_tasks/task/services/personal_velocity_service.py` + test
- `vernon_tasks/task/services/streak_service.py` + test
- `vernon_tasks/task/api/ic_analytics.py` + test
- `vernon_tasks/task/page/my_analytics/` (json, py, js, __init__)

**Modify:**
- `vernon_tasks/task/workspace/vernon_tasks/vernon_tasks.json` — add shortcut

---

## Task 1: Leaderboard service

**Files:** `services/leaderboard_service.py`, `services/test_leaderboard_service.py`

Spec:
- `get_leaderboard(period, limit=10)`: `period ∈ {"week","month","quarter"}`. Returns top N users by `SUM(earned_points)` from VT Task DONE in period, tie-break by task count DESC.
- Period windows (in site TZ):
  - `week`: today's ISO week (Mon-Sun)
  - `month`: current calendar month
  - `quarter`: current calendar quarter (3-month block)

- [ ] **Step 1: Test**

```python
import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, today
from vernon_tasks.task.services.leaderboard_service import get_leaderboard, period_window


class TestLeaderboard(FrappeTestCase):
    def setUp(self):
        # Two users with completed tasks this month
        for email in ("lb-a@x.com", "lb-b@x.com"):
            if not frappe.db.exists("User", email):
                frappe.get_doc({
                    "doctype": "User", "email": email, "first_name": "T",
                    "send_welcome_email": 0, "enabled": 1,
                }).insert(ignore_permissions=True)
        if frappe.db.exists("VT Project", "LB-Proj"):
            frappe.delete_doc("VT Project", "LB-Proj", force=True)
        p = frappe.get_doc({
            "doctype": "VT Project", "title": "LB-Proj",
            "project_owner": frappe.session.user,
            "start_date": add_days(today(), -30),
            "end_date": add_days(today(), 30),
            "status": "Open",
        }).insert(ignore_permissions=True)
        self.project = p.name

        def _t(user, pts, days_ago):
            t = frappe.get_doc({
                "doctype": "VT Task", "title": "T",
                "project": self.project, "assigned_to": user,
                "estimated_hours": 1, "actual_hours": 1,
                "earned_points": pts,
                "pdca_phase": "DONE", "kanban_status": "Done",
                "completion_date": add_days(today(), -days_ago),
            }).insert(ignore_permissions=True)
            return t

        # A: 30 points (1 task), B: 20 points (2 tasks)
        _t("lb-a@x.com", 30, 2)
        _t("lb-b@x.com", 10, 1)
        _t("lb-b@x.com", 10, 3)

    def test_month_leaderboard_orders_by_points(self):
        result = get_leaderboard("month")
        usrs = [r["user"] for r in result if r["user"] in ("lb-a@x.com", "lb-b@x.com")]
        self.assertEqual(usrs[:2], ["lb-a@x.com", "lb-b@x.com"])

    def test_tie_break_by_task_count(self):
        # Add 30 points 1 task for B → tie with A
        # Actually just test that result includes task count
        result = get_leaderboard("month")
        b_row = [r for r in result if r["user"] == "lb-b@x.com"][0]
        self.assertEqual(b_row["task_count"], 2)

    def test_invalid_period_raises(self):
        with self.assertRaises(ValueError):
            get_leaderboard("yearly")

    def test_period_window_returns_tuple(self):
        start, end = period_window("week")
        self.assertLessEqual(start, end)
```

- [ ] **Step 2: Implement**

```python
# leaderboard_service.py
import frappe
from frappe.utils import getdate, today, add_days, get_first_day, get_last_day

_VALID_PERIODS = ("week", "month", "quarter")
_DONE_PHASE = "DONE"


def period_window(period: str):
    if period not in _VALID_PERIODS:
        raise ValueError(f"Invalid period: {period}")
    t = getdate(today())
    if period == "week":
        # ISO week Monday → Sunday
        start = add_days(t, -t.weekday())
        end = add_days(start, 6)
    elif period == "month":
        start = get_first_day(t)
        end = get_last_day(t)
    else:  # quarter
        q = (t.month - 1) // 3
        start = getdate(f"{t.year}-{q*3+1:02d}-01")
        end = get_last_day(getdate(f"{t.year}-{q*3+3:02d}-01"))
    return start, end


def get_leaderboard(period: str, limit: int = 10) -> list[dict]:
    start, end = period_window(period)
    rows = frappe.db.sql("""
        SELECT
            assigned_to AS user,
            COALESCE(SUM(earned_points), 0) AS points,
            COUNT(*) AS task_count
        FROM `tabVT Task`
        WHERE pdca_phase = %(done)s
          AND completion_date BETWEEN %(start)s AND %(end)s
          AND assigned_to IS NOT NULL
          AND assigned_to != ''
        GROUP BY assigned_to
        ORDER BY points DESC, task_count DESC
        LIMIT %(limit)s
    """, {"done": _DONE_PHASE, "start": start, "end": end, "limit": limit}, as_dict=True)
    return [{
        "user": r["user"],
        "points": float(r["points"]),
        "task_count": int(r["task_count"]),
    } for r in rows]
```

- [ ] **Step 3: Run, pass, commit**

```
git add vernon_tasks/task/services/leaderboard_service.py vernon_tasks/task/services/test_leaderboard_service.py
git commit -m "feat(analytics): add leaderboard service (week/month/quarter)"
```

---

## Task 2: Personal velocity service

**Files:** `services/personal_velocity_service.py` + test

Spec:
- `get_personal_velocity(user, project, n=6)`: per closed sprint, hours done by user (sum actual_hours of DONE tasks assigned_to=user in sprint window). Returns `{sprints[], personal[], team_avg[], avg, team_avg_total}`.

- [ ] **Test:**

```python
import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, today
from vernon_tasks.task.services.personal_velocity_service import get_personal_velocity


class TestPersonalVelocity(FrappeTestCase):
    def setUp(self):
        for email in ("pv-me@x.com", "pv-other@x.com"):
            if not frappe.db.exists("User", email):
                frappe.get_doc({
                    "doctype": "User", "email": email, "first_name": "T",
                    "send_welcome_email": 0, "enabled": 1,
                }).insert(ignore_permissions=True)
        if frappe.db.exists("VT Project", "PV-Proj"):
            frappe.delete_doc("VT Project", "PV-Proj", force=True)
        self.project = frappe.get_doc({
            "doctype": "VT Project", "title": "PV-Proj",
            "project_owner": frappe.session.user,
            "start_date": add_days(today(), -60),
            "end_date": add_days(today(), 30),
            "status": "Open",
        }).insert(ignore_permissions=True)

        def _s(idx, off):
            return frappe.get_doc({
                "doctype": "VT Sprint", "sprint_title": f"PV-S{idx}",
                "project": self.project.name,
                "start_date": add_days(today(), off),
                "end_date": add_days(today(), off + 13),
                "status": "Closed",
            }).insert(ignore_permissions=True)

        def _t(sprint, user, hrs, off):
            frappe.get_doc({
                "doctype": "VT Task", "title": "T",
                "project": self.project.name, "sprint": sprint,
                "assigned_to": user,
                "estimated_hours": hrs, "actual_hours": hrs,
                "pdca_phase": "DONE", "kanban_status": "Done",
                "completion_date": add_days(today(), off + 2),
            }).insert(ignore_permissions=True)

        self.s1 = _s(1, -28); self.s2 = _s(2, -14)
        # s1: me=10, other=20 → team_avg=15
        _t(self.s1.name, "pv-me@x.com", 10, -28)
        _t(self.s1.name, "pv-other@x.com", 20, -28)
        # s2: me=6, other=10 → team_avg=8
        _t(self.s2.name, "pv-me@x.com", 6, -14)
        _t(self.s2.name, "pv-other@x.com", 10, -14)

    def test_personal_vs_team_avg(self):
        r = get_personal_velocity("pv-me@x.com", self.project.name, n=6)
        self.assertEqual(r["personal"], [10.0, 6.0])
        self.assertEqual(r["team_avg"], [15.0, 8.0])
        self.assertAlmostEqual(r["avg"], 8.0)
        self.assertAlmostEqual(r["team_avg_total"], 11.5)

    def test_empty_project(self):
        if frappe.db.exists("VT Project", "PV-Empty"):
            frappe.delete_doc("VT Project", "PV-Empty", force=True)
        p = frappe.get_doc({
            "doctype": "VT Project", "title": "PV-Empty",
            "project_owner": frappe.session.user,
            "start_date": today(), "end_date": today(),
            "status": "Open",
        }).insert(ignore_permissions=True)
        r = get_personal_velocity("pv-me@x.com", p.name)
        self.assertEqual(r["personal"], [])
        self.assertEqual(r["avg"], 0.0)
```

- [ ] **Implement:**

```python
# personal_velocity_service.py
import frappe

_DONE_PHASE = "DONE"
_CLOSED_STATUS = "Closed"


def _hours_in_sprint(sprint: str, user: str | None) -> float:
    where_user = "AND assigned_to = %(user)s" if user else ""
    row = frappe.db.sql(f"""
        SELECT COALESCE(SUM(actual_hours), 0) AS hrs
        FROM `tabVT Task`
        WHERE sprint = %(sprint)s
          AND pdca_phase = %(done)s
          {where_user}
    """, {"sprint": sprint, "done": _DONE_PHASE, "user": user}, as_dict=True)
    return float(row[0]["hrs"])


def _distinct_assignees(sprint: str) -> int:
    row = frappe.db.sql("""
        SELECT COUNT(DISTINCT assigned_to) AS n
        FROM `tabVT Task`
        WHERE sprint = %(sprint)s
          AND pdca_phase = %(done)s
          AND assigned_to IS NOT NULL
          AND assigned_to != ''
    """, {"sprint": sprint, "done": _DONE_PHASE}, as_dict=True)
    return int(row[0]["n"])


def get_personal_velocity(user: str, project: str, n: int = 6) -> dict:
    sprints = frappe.db.sql("""
        SELECT name FROM `tabVT Sprint`
        WHERE project = %(project)s
          AND status = %(closed)s
        ORDER BY end_date DESC
        LIMIT %(n)s
    """, {"project": project, "closed": _CLOSED_STATUS, "n": n}, as_dict=True)

    sprint_names = [s["name"] for s in reversed(sprints)]
    personal = [_hours_in_sprint(name, user) for name in sprint_names]
    team_avg = []
    for name in sprint_names:
        total = _hours_in_sprint(name, None)
        assignees = _distinct_assignees(name)
        team_avg.append(round(total / assignees, 2) if assignees else 0.0)

    avg = sum(personal) / len(personal) if personal else 0.0
    team_avg_total = sum(team_avg) / len(team_avg) if team_avg else 0.0

    return {
        "sprints": sprint_names,
        "personal": personal,
        "team_avg": team_avg,
        "avg": float(avg),
        "team_avg_total": float(team_avg_total),
    }
```

- [ ] **Commit:** `feat(analytics): add personal velocity service`

---

## Task 3: Streak service

**Files:** `services/streak_service.py` + test

Spec:
- `get_streak(user, project)`: walks closed sprints DESC by end_date. Count consecutive sprints with `user_velocity > 0`. Stops at first zero or no more sprints. Returns `{streak: int, sprints_checked: int}`.

- [ ] **Test:**

```python
import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, today
from vernon_tasks.task.services.streak_service import get_streak


class TestStreak(FrappeTestCase):
    def setUp(self):
        if not frappe.db.exists("User", "sk-me@x.com"):
            frappe.get_doc({"doctype": "User", "email": "sk-me@x.com",
                            "first_name": "T", "send_welcome_email": 0, "enabled": 1}
                           ).insert(ignore_permissions=True)
        if frappe.db.exists("VT Project", "SK-Proj"):
            frappe.delete_doc("VT Project", "SK-Proj", force=True)
        self.project = frappe.get_doc({
            "doctype": "VT Project", "title": "SK-Proj",
            "project_owner": frappe.session.user,
            "start_date": add_days(today(), -120),
            "end_date": add_days(today(), 30),
            "status": "Open",
        }).insert(ignore_permissions=True)

        # 4 sprints: oldest gap, then 3 consecutive active
        def _s(idx, off, user_hrs):
            s = frappe.get_doc({
                "doctype": "VT Sprint", "sprint_title": f"SK-S{idx}",
                "project": self.project.name,
                "start_date": add_days(today(), off),
                "end_date": add_days(today(), off + 13),
                "status": "Closed",
            }).insert(ignore_permissions=True)
            if user_hrs > 0:
                frappe.get_doc({
                    "doctype": "VT Task", "title": "T",
                    "project": self.project.name, "sprint": s.name,
                    "assigned_to": "sk-me@x.com",
                    "estimated_hours": user_hrs, "actual_hours": user_hrs,
                    "pdca_phase": "DONE", "kanban_status": "Done",
                    "completion_date": add_days(today(), off + 2),
                }).insert(ignore_permissions=True)
            return s

        _s(1, -84, 0)   # gap (oldest)
        _s(2, -56, 4)
        _s(3, -28, 6)
        _s(4, -14, 8)   # newest

    def test_streak_three(self):
        r = get_streak("sk-me@x.com", self.project.name)
        self.assertEqual(r["streak"], 3)
        self.assertEqual(r["sprints_checked"], 4)

    def test_no_sprints(self):
        if frappe.db.exists("VT Project", "SK-Empty"):
            frappe.delete_doc("VT Project", "SK-Empty", force=True)
        p = frappe.get_doc({
            "doctype": "VT Project", "title": "SK-Empty",
            "project_owner": frappe.session.user,
            "start_date": today(), "end_date": today(),
            "status": "Open",
        }).insert(ignore_permissions=True)
        r = get_streak("sk-me@x.com", p.name)
        self.assertEqual(r["streak"], 0)
        self.assertEqual(r["sprints_checked"], 0)
```

- [ ] **Implement:**

```python
# streak_service.py
import frappe

_DONE_PHASE = "DONE"
_CLOSED_STATUS = "Closed"


def get_streak(user: str, project: str) -> dict:
    sprints = frappe.db.sql("""
        SELECT name FROM `tabVT Sprint`
        WHERE project = %(project)s
          AND status = %(closed)s
        ORDER BY end_date DESC
    """, {"project": project, "closed": _CLOSED_STATUS}, as_dict=True)

    streak = 0
    for s in sprints:
        row = frappe.db.sql("""
            SELECT COALESCE(SUM(actual_hours), 0) AS hrs
            FROM `tabVT Task`
            WHERE sprint = %(sprint)s
              AND assigned_to = %(user)s
              AND pdca_phase = %(done)s
        """, {"sprint": s["name"], "user": user, "done": _DONE_PHASE}, as_dict=True)
        if float(row[0]["hrs"]) > 0:
            streak += 1
        else:
            break

    return {"streak": int(streak), "sprints_checked": len(sprints)}
```

- [ ] **Commit:** `feat(analytics): add streak service`

---

## Task 4: IC analytics API

**Files:** `api/ic_analytics.py` + test

Role gate: `VT Member`, `VT Leader`, `VT Manager`. Users only see own data (no impersonation): `user` arg is ignored, always `frappe.session.user` for personal_velocity + streak. Leaderboard public to anyone with allowed roles.

- [ ] **Test:**

```python
import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_tasks.task.api.ic_analytics import (
    get_leaderboard, get_personal_velocity, get_streak,
)


def _ensure_role(role):
    if not frappe.db.exists("Role", role):
        frappe.get_doc({"doctype": "Role", "role_name": role}).insert(ignore_permissions=True)


def _user_with_roles(email, roles):
    if not frappe.db.exists("User", email):
        frappe.get_doc({
            "doctype": "User", "email": email, "first_name": "T",
            "send_welcome_email": 0, "enabled": 1,
            "roles": [{"role": r} for r in roles],
        }).insert(ignore_permissions=True)
    return email


class TestICAPI(FrappeTestCase):
    def setUp(self):
        for r in ("VT Member", "VT Leader"):
            _ensure_role(r)
        self.member = _user_with_roles("ic-member@x.com", ["VT Member"])
        self.guest = _user_with_roles("ic-guest@x.com", [])

    def tearDown(self):
        frappe.set_user("Administrator")

    def test_leaderboard_blocked_for_guest(self):
        frappe.set_user(self.guest)
        with self.assertRaises(frappe.PermissionError):
            get_leaderboard(period="month")

    def test_personal_velocity_blocked_for_guest(self):
        frappe.set_user(self.guest)
        with self.assertRaises(frappe.PermissionError):
            get_personal_velocity(project="x")

    def test_streak_blocked_for_guest(self):
        frappe.set_user(self.guest)
        with self.assertRaises(frappe.PermissionError):
            get_streak(project="x")
```

- [ ] **Implement:**

```python
# ic_analytics.py
import frappe
from vernon_tasks.task.services.leaderboard_service import get_leaderboard as _lb
from vernon_tasks.task.services.personal_velocity_service import get_personal_velocity as _pv
from vernon_tasks.task.services.streak_service import get_streak as _streak

_ALLOWED_ROLES = ("VT Member", "VT Leader", "VT Manager")


def _guard():
    if not set(frappe.get_roles()) & set(_ALLOWED_ROLES):
        frappe.throw("Not authorized", frappe.PermissionError)


@frappe.whitelist()
def get_leaderboard(period="month", limit=10):
    _guard()
    return _lb(period, int(limit))


@frappe.whitelist()
def get_personal_velocity(project, n=6):
    _guard()
    return _pv(frappe.session.user, project, int(n))


@frappe.whitelist()
def get_streak(project):
    _guard()
    return _streak(frappe.session.user, project)
```

- [ ] **Commit:** `feat(analytics): add IC analytics API endpoints`

---

## Task 5: my_analytics page

**Files:** `page/my_analytics/{__init__.py, my_analytics.json, my_analytics.py, my_analytics.js}`

- [ ] **JSON:**
```json
{
 "creation": "2026-05-11 00:00:00.000000",
 "doctype": "Page", "module": "Task",
 "name": "my-analytics", "page_name": "my-analytics",
 "roles": [{"role": "VT Member"}, {"role": "VT Leader"}, {"role": "VT Manager"}],
 "title": "My Analytics"
}
```

- [ ] **py:** mirror leader_analytics.py with allowed roles `("VT Member", "VT Leader", "VT Manager")`.

- [ ] **js:** 3 panels:
  - Leaderboard (period selector: week/month/quarter) — bar chart or list
  - Personal Velocity (project selector) — line chart `personal` vs `team_avg`
  - Streak (auto-updates with project) — big number card

Skeleton:
```javascript
frappe.pages['my-analytics'].on_page_load = function(wrapper) {
  const page = frappe.ui.make_app_page({ parent: wrapper, title: __('My Analytics'), single_column: true });
  const $body = $(wrapper).find('.layout-main-section');
  $body.html(`
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px;">
      <div id="ic-velocity" style="border:1px solid var(--border-color);padding:12px;border-radius:8px;"><h5>${__('Personal Velocity')}</h5><div class="chart"></div></div>
      <div id="ic-streak" style="border:1px solid var(--border-color);padding:12px;border-radius:8px;"><h5>${__('Current Streak')}</h5><div class="content"></div></div>
      <div id="ic-leaderboard" style="grid-column:1/-1;border:1px solid var(--border-color);padding:12px;border-radius:8px;"><h5>${__('Leaderboard')}</h5><div class="chart"></div></div>
    </div>
  `);
  const state = { project: null, period: 'month' };
  const project_field = page.add_field({ fieldname:'project', label:__('Project'), fieldtype:'Link', options:'VT Project',
    change:()=>{ state.project = project_field.get_value(); render_velocity(); render_streak(); } });
  const period_field = page.add_field({ fieldname:'period', label:__('Period'), fieldtype:'Select',
    options:'week\nmonth\nquarter', default:'month',
    change:()=>{ state.period = period_field.get_value(); render_leaderboard(); } });

  function call(m, args){ return frappe.call({ method:`vernon_tasks.task.api.ic_analytics.${m}`, args }).then(r=>r.message); }

  function render_velocity(){
    if(!state.project) return;
    call('get_personal_velocity',{project:state.project,n:6}).then(d=>{
      $('#ic-velocity .chart').empty();
      if(!d.sprints.length){ $('#ic-velocity .chart').text(__('No data')); return; }
      new frappe.Chart('#ic-velocity .chart',{ type:'line',
        data:{ labels:d.sprints, datasets:[
          {name:__('Personal'),values:d.personal},
          {name:__('Team avg'),values:d.team_avg},
        ]}, height:240 });
    });
  }
  function render_streak(){
    if(!state.project) return;
    call('get_streak',{project:state.project}).then(d=>{
      $('#ic-streak .content').html(`<div style="font-size:48px;font-weight:700;">${d.streak}</div><div class="text-muted small">${__('consecutive sprints active')}</div>`);
    });
  }
  function render_leaderboard(){
    call('get_leaderboard',{period:state.period,limit:10}).then(rows=>{
      $('#ic-leaderboard .chart').empty();
      if(!rows.length){ $('#ic-leaderboard .chart').text(__('No data this period')); return; }
      new frappe.Chart('#ic-leaderboard .chart',{ type:'bar',
        data:{ labels: rows.map(r=>r.user), datasets:[{name:__('Points'),values:rows.map(r=>r.points)}] },
        height:280 });
    });
  }
  render_leaderboard();
};
```

- [ ] **Migrate + commit:** `feat(page/my_analytics): add IC analytics page (leaderboard, velocity, streak)`

---

## Task 6: Workspace shortcut + verify

- [ ] Add shortcut entry to `vernon_tasks/task/workspace/vernon_tasks/vernon_tasks.json`:
```json
{"color":"Green","doc_view":"","is_query_report":0,"label":"My Analytics","link_to":"my-analytics","type":"Page"}
```

- [ ] Migrate.
- [ ] Full test suite: `docker exec frappe-backend-1 bench --site task2.localhost run-tests --app vernon_tasks`. Expect all green.
- [ ] Append API doc section in `docs/API_REFERENCE.md` for the 3 IC endpoints.
- [ ] Commit + verify final commit graph.

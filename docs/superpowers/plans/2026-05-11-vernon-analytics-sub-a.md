# Vernon Tasks Analytics — Sub-A Leader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Sub-A Leader Analytics page (burndown, velocity trend, forecast, risk alerts) using hours as the metric unit.

**Architecture:** Pure service layer in `vernon_tasks/task/services/`, whitelisted API in `vernon_tasks/task/api/`, single Frappe Page consuming Frappe Charts. Cache velocity/forecast via `frappe.cache()`, invalidate on sprint/task hooks. Risk thresholds: per-project override → VT Settings default → hardcoded fallback.

**Tech Stack:** Frappe Framework (Python), MariaDB, Frappe Charts (JS), pytest/unittest via `bench run-tests`.

**Spec:** `docs/superpowers/specs/2026-05-11-vernon-analytics-design.md`

**Conventions discovered in repo:**
- Roles used: `VT Leader`, `VT Manager` (NOT `Leader`).
- Tests sit next to source as `test_<module>.py` (no separate `tests/` dir).
- SQL: parameterized `frappe.db.sql(..., as_dict=True)`.
- Whitelisted API endpoints live in module Python files; pages call via `frappe.call("vernon_tasks.task.api.analytics.<fn>")`.

---

## File Structure

**Create:**
- `vernon_tasks/task/services/threshold.py` — `get_project_threshold(project, key)` resolver
- `vernon_tasks/task/services/test_threshold.py`
- `vernon_tasks/task/services/velocity_service.py` — `get_sprint_velocity`, `get_velocity_trend`
- `vernon_tasks/task/services/test_velocity_service.py`
- `vernon_tasks/task/services/burndown_service.py` — `get_burndown`
- `vernon_tasks/task/services/test_burndown_service.py`
- `vernon_tasks/task/services/forecast_service.py` — `get_forecast`
- `vernon_tasks/task/services/test_forecast_service.py`
- `vernon_tasks/task/services/risk_evaluator.py` — `evaluate_risks`
- `vernon_tasks/task/services/test_risk_evaluator.py`
- `vernon_tasks/task/api/__init__.py`
- `vernon_tasks/task/api/analytics.py` — whitelisted endpoints
- `vernon_tasks/task/api/test_analytics.py`
- `vernon_tasks/task/page/leader_analytics/__init__.py`
- `vernon_tasks/task/page/leader_analytics/leader_analytics.json`
- `vernon_tasks/task/page/leader_analytics/leader_analytics.js`
- `vernon_tasks/task/page/leader_analytics/leader_analytics.py`

**Modify:**
- `vernon_tasks/project/doctype/vt_project/vt_project.json` — append 3 override fields
- `vernon_tasks/vt_settings/doctype/vt_settings/vt_settings.json` — append 3 default fields
- `vernon_tasks/hooks.py` — register doc_events for cache invalidation
- `vernon_tasks/task/workspace/vernon_tasks/vernon_tasks.json` — add shortcut for Leader Analytics page

---

## Task 1: VT Settings defaults

**Files:**
- Modify: `vernon_tasks/vt_settings/doctype/vt_settings/vt_settings.json`

- [ ] **Step 1: Inspect current schema**

Run: `cat vernon_tasks/vt_settings/doctype/vt_settings/vt_settings.json`

Note the existing `field_order` and `fields` arrays.

- [ ] **Step 2: Append 3 new fields**

Append to `field_order` (after existing entries):
```
"analytics_defaults_section",
"default_blocked_days_threshold",
"default_slip_pct_threshold",
"default_capacity_pct_threshold"
```

Append to `fields`:
```json
{"fieldname": "analytics_defaults_section", "fieldtype": "Section Break", "label": "Analytics Defaults"},
{"fieldname": "default_blocked_days_threshold", "fieldtype": "Int", "label": "Default Blocked Days Threshold", "default": "3"},
{"fieldname": "default_slip_pct_threshold", "fieldtype": "Percent", "label": "Default Sprint Slip % Threshold", "default": "20"},
{"fieldname": "default_capacity_pct_threshold", "fieldtype": "Percent", "label": "Default Capacity % Threshold", "default": "120"}
```

- [ ] **Step 3: Run migration**

Run: `bench --site <site> migrate`
Expected: Migration completes; no errors.

- [ ] **Step 4: Commit**

```bash
git add vernon_tasks/vt_settings/doctype/vt_settings/vt_settings.json
git commit -m "feat(settings): add analytics threshold defaults"
```

---

## Task 2: VT Project override fields

**Files:**
- Modify: `vernon_tasks/project/doctype/vt_project/vt_project.json`

- [ ] **Step 1: Append 3 override fields**

Append to `field_order`:
```
"analytics_overrides_section",
"blocked_days_threshold",
"slip_pct_threshold",
"capacity_pct_threshold"
```

Append to `fields`:
```json
{"fieldname": "analytics_overrides_section", "fieldtype": "Section Break", "label": "Analytics Overrides", "collapsible": 1},
{"fieldname": "blocked_days_threshold", "fieldtype": "Int", "label": "Blocked Days Threshold", "description": "Leave blank to inherit from VT Settings"},
{"fieldname": "slip_pct_threshold", "fieldtype": "Percent", "label": "Sprint Slip % Threshold", "description": "Leave blank to inherit"},
{"fieldname": "capacity_pct_threshold", "fieldtype": "Percent", "label": "Capacity % Threshold", "description": "Leave blank to inherit"}
```

- [ ] **Step 2: Run migration**

Run: `bench --site <site> migrate`
Expected: Migration completes.

- [ ] **Step 3: Commit**

```bash
git add vernon_tasks/project/doctype/vt_project/vt_project.json
git commit -m "feat(project): add per-project analytics override fields"
```

---

## Task 3: Threshold resolver service

**Files:**
- Create: `vernon_tasks/task/services/threshold.py`
- Create: `vernon_tasks/task/services/test_threshold.py`

- [ ] **Step 1: Write failing test**

`vernon_tasks/task/services/test_threshold.py`:
```python
import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_tasks.task.services.threshold import get_project_threshold, THRESHOLD_KEYS


class TestThreshold(FrappeTestCase):
    def setUp(self):
        settings = frappe.get_single("VT Settings")
        settings.default_blocked_days_threshold = 3
        settings.default_slip_pct_threshold = 20
        settings.default_capacity_pct_threshold = 120
        settings.save(ignore_permissions=True)

    def test_unknown_key_raises(self):
        with self.assertRaises(ValueError):
            get_project_threshold(None, "unknown_key")

    def test_no_project_returns_settings_default(self):
        self.assertEqual(get_project_threshold(None, "blocked_days"), 3)
        self.assertEqual(get_project_threshold(None, "slip_pct"), 20)
        self.assertEqual(get_project_threshold(None, "capacity_pct"), 120)

    def test_threshold_keys_complete(self):
        self.assertEqual(set(THRESHOLD_KEYS), {"blocked_days", "slip_pct", "capacity_pct"})
```

- [ ] **Step 2: Run, verify fail**

Run: `bench --site <site> run-tests --app vernon_tasks --module vernon_tasks.task.services.test_threshold`
Expected: ImportError or ModuleNotFoundError.

- [ ] **Step 3: Implement**

`vernon_tasks/task/services/threshold.py`:
```python
import frappe

THRESHOLD_KEYS = ("blocked_days", "slip_pct", "capacity_pct")

_PROJECT_FIELD = {
    "blocked_days": "blocked_days_threshold",
    "slip_pct": "slip_pct_threshold",
    "capacity_pct": "capacity_pct_threshold",
}

_SETTINGS_FIELD = {
    "blocked_days": "default_blocked_days_threshold",
    "slip_pct": "default_slip_pct_threshold",
    "capacity_pct": "default_capacity_pct_threshold",
}

_HARDCODED_FALLBACK = {
    "blocked_days": 3,
    "slip_pct": 20.0,
    "capacity_pct": 120.0,
}


def get_project_threshold(project: str | None, key: str) -> float:
    if key not in THRESHOLD_KEYS:
        raise ValueError(f"Unknown threshold key: {key}")

    if project:
        val = frappe.db.get_value("VT Project", project, _PROJECT_FIELD[key])
        if val not in (None, 0, ""):
            return float(val)

    settings = frappe.get_single("VT Settings")
    val = getattr(settings, _SETTINGS_FIELD[key], None)
    if val not in (None, 0, ""):
        return float(val)

    return float(_HARDCODED_FALLBACK[key])
```

Note: treat `0` as "unset" (Frappe Int/Percent default to 0 when blank).

- [ ] **Step 4: Run, verify pass**

Run: `bench --site <site> run-tests --app vernon_tasks --module vernon_tasks.task.services.test_threshold`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add vernon_tasks/task/services/threshold.py vernon_tasks/task/services/test_threshold.py
git commit -m "feat(analytics): add threshold resolver with project/settings/hardcoded fallback"
```

---

## Task 4: Velocity service

**Files:**
- Create: `vernon_tasks/task/services/velocity_service.py`
- Create: `vernon_tasks/task/services/test_velocity_service.py`

Behavior:
- `get_sprint_velocity(sprint)` → sum of `actual_hours` for tasks where `sprint == <sprint>`, `pdca_phase == 'DONE'`, `completion_date` between sprint start/end.
- `get_velocity_trend(project, n=6)` → last n COMPLETED sprints (`status == 'Closed'`), ordered ASC by `end_date`. Returns `{sprints, velocity, avg, trend_pct}`. `trend_pct` = `(last - first) / first * 100`, 0 if first is 0 or n < 2.

- [ ] **Step 1: Write failing tests**

`vernon_tasks/task/services/test_velocity_service.py`:
```python
import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, today
from vernon_tasks.task.services.velocity_service import (
    get_sprint_velocity,
    get_velocity_trend,
)


def _make_project(name="Test-Proj-Vel"):
    if frappe.db.exists("VT Project", name):
        frappe.delete_doc("VT Project", name, force=True)
    return frappe.get_doc({
        "doctype": "VT Project",
        "title": name,
        "start_date": add_days(today(), -60),
        "end_date": add_days(today(), 60),
        "status": "Active",
    }).insert(ignore_permissions=True)


def _make_sprint(project, idx, start_offset):
    return frappe.get_doc({
        "doctype": "VT Sprint",
        "sprint_title": f"S{idx}",
        "project": project,
        "start_date": add_days(today(), start_offset),
        "end_date": add_days(today(), start_offset + 13),
        "status": "Closed",
    }).insert(ignore_permissions=True)


def _make_task(project, sprint, hours, completion_offset, phase="DONE"):
    return frappe.get_doc({
        "doctype": "VT Task",
        "title": "T",
        "project": project,
        "sprint": sprint,
        "estimated_hours": hours,
        "actual_hours": hours,
        "completion_date": add_days(today(), completion_offset) if phase == "DONE" else None,
        "pdca_phase": phase,
        "kanban_status": "Done" if phase == "DONE" else "Todo",
    }).insert(ignore_permissions=True)


class TestVelocityService(FrappeTestCase):
    def setUp(self):
        self.project = _make_project()
        self.s1 = _make_sprint(self.project.name, 1, -42)
        self.s2 = _make_sprint(self.project.name, 2, -28)
        self.s3 = _make_sprint(self.project.name, 3, -14)
        _make_task(self.project.name, self.s1.name, 10, -32)
        _make_task(self.project.name, self.s1.name, 5, -30)  # 15 total
        _make_task(self.project.name, self.s2.name, 8, -18)  # 8 total
        _make_task(self.project.name, self.s3.name, 12, -4)  # 12 total
        _make_task(self.project.name, self.s3.name, 7, -10, phase="DO")  # excluded

    def test_sprint_velocity_sums_done_actual_hours(self):
        self.assertEqual(get_sprint_velocity(self.s1.name), 15.0)
        self.assertEqual(get_sprint_velocity(self.s2.name), 8.0)
        self.assertEqual(get_sprint_velocity(self.s3.name), 12.0)

    def test_velocity_trend_returns_last_n_closed_sprints_in_order(self):
        result = get_velocity_trend(self.project.name, n=6)
        self.assertEqual(result["velocity"], [15.0, 8.0, 12.0])
        self.assertEqual(result["sprints"], [self.s1.name, self.s2.name, self.s3.name])
        self.assertAlmostEqual(result["avg"], (15 + 8 + 12) / 3)

    def test_trend_pct_first_to_last(self):
        result = get_velocity_trend(self.project.name, n=6)
        self.assertAlmostEqual(result["trend_pct"], (12 - 15) / 15 * 100)

    def test_velocity_trend_empty(self):
        empty = _make_project("Empty-Proj-Vel")
        result = get_velocity_trend(empty.name, n=6)
        self.assertEqual(result["velocity"], [])
        self.assertEqual(result["avg"], 0.0)
        self.assertEqual(result["trend_pct"], 0.0)
```

- [ ] **Step 2: Run, verify fail**

Run: `bench --site <site> run-tests --app vernon_tasks --module vernon_tasks.task.services.test_velocity_service`
Expected: ImportError.

- [ ] **Step 3: Implement**

`vernon_tasks/task/services/velocity_service.py`:
```python
import frappe

_DONE_PHASE = "DONE"
_CLOSED_STATUS = "Closed"


def get_sprint_velocity(sprint: str) -> float:
    row = frappe.db.sql("""
        SELECT COALESCE(SUM(actual_hours), 0) AS hours
        FROM `tabVT Task`
        WHERE sprint = %(sprint)s
          AND pdca_phase = %(done)s
    """, {"sprint": sprint, "done": _DONE_PHASE}, as_dict=True)
    return float(row[0]["hours"])


def get_velocity_trend(project: str, n: int = 6) -> dict:
    sprints = frappe.db.sql("""
        SELECT name FROM `tabVT Sprint`
        WHERE project = %(project)s
          AND status = %(closed)s
        ORDER BY end_date DESC
        LIMIT %(n)s
    """, {"project": project, "closed": _CLOSED_STATUS, "n": n}, as_dict=True)

    sprint_names = [s["name"] for s in reversed(sprints)]
    velocities = [get_sprint_velocity(name) for name in sprint_names]

    avg = sum(velocities) / len(velocities) if velocities else 0.0
    if len(velocities) >= 2 and velocities[0] > 0:
        trend_pct = (velocities[-1] - velocities[0]) / velocities[0] * 100
    else:
        trend_pct = 0.0

    return {
        "sprints": sprint_names,
        "velocity": velocities,
        "avg": float(avg),
        "trend_pct": float(trend_pct),
    }
```

- [ ] **Step 4: Run, verify pass**

Run: `bench --site <site> run-tests --app vernon_tasks --module vernon_tasks.task.services.test_velocity_service`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add vernon_tasks/task/services/velocity_service.py vernon_tasks/task/services/test_velocity_service.py
git commit -m "feat(analytics): add velocity service (per-sprint + trend)"
```

---

## Task 5: Burndown service

**Files:**
- Create: `vernon_tasks/task/services/burndown_service.py`
- Create: `vernon_tasks/task/services/test_burndown_service.py`

Behavior:
- `get_burndown(sprint)` → for each day `d` from sprint.start_date to sprint.end_date:
  - `remaining[d]` = sum of `estimated_hours` of tasks where `sprint=<sprint>` AND (`completion_date IS NULL` OR `completion_date > d`) AND `estimated_hours > 0`.
  - `ideal[d]` = linear from `total` at start to `0` at end.
- Return `{labels, ideal, remaining, unestimated_count}`. `unestimated_count` = tasks in sprint with `estimated_hours == 0`.

- [ ] **Step 1: Write failing tests**

`vernon_tasks/task/services/test_burndown_service.py`:
```python
import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, today, getdate
from vernon_tasks.task.services.burndown_service import get_burndown


class TestBurndownService(FrappeTestCase):
    def setUp(self):
        if frappe.db.exists("VT Project", "BD-Proj"):
            frappe.delete_doc("VT Project", "BD-Proj", force=True)
        self.project = frappe.get_doc({
            "doctype": "VT Project",
            "title": "BD-Proj",
            "start_date": add_days(today(), -10),
            "end_date": add_days(today(), 10),
            "status": "Active",
        }).insert(ignore_permissions=True)
        # 5-day sprint starting 4 days ago
        self.sprint = frappe.get_doc({
            "doctype": "VT Sprint",
            "sprint_title": "BD-S1",
            "project": self.project.name,
            "start_date": add_days(today(), -4),
            "end_date": add_days(today(), 0),
            "status": "Active",
        }).insert(ignore_permissions=True)
        # 3 tasks, 10h each = 30h total
        for offset in (-2, -1, None):
            frappe.get_doc({
                "doctype": "VT Task",
                "title": "T",
                "project": self.project.name,
                "sprint": self.sprint.name,
                "estimated_hours": 10,
                "actual_hours": 10,
                "completion_date": add_days(today(), offset) if offset is not None else None,
                "pdca_phase": "DONE" if offset is not None else "DO",
                "kanban_status": "Done" if offset is not None else "In Progress",
            }).insert(ignore_permissions=True)
        # Unestimated task
        frappe.get_doc({
            "doctype": "VT Task",
            "title": "U",
            "project": self.project.name,
            "sprint": self.sprint.name,
            "estimated_hours": 0,
            "actual_hours": 0,
            "pdca_phase": "DO",
            "kanban_status": "In Progress",
        }).insert(ignore_permissions=True)

    def test_labels_cover_sprint_window_inclusive(self):
        result = get_burndown(self.sprint.name)
        self.assertEqual(len(result["labels"]), 5)
        self.assertEqual(result["labels"][0], str(getdate(add_days(today(), -4))))
        self.assertEqual(result["labels"][-1], str(getdate(today())))

    def test_ideal_starts_at_total_ends_at_zero(self):
        result = get_burndown(self.sprint.name)
        self.assertEqual(result["ideal"][0], 30.0)
        self.assertEqual(result["ideal"][-1], 0.0)

    def test_remaining_decreases_as_tasks_complete(self):
        result = get_burndown(self.sprint.name)
        # Day 0 (-4): nothing done yet → 30
        self.assertEqual(result["remaining"][0], 30.0)
        # Final day: 2 tasks done (offset -2 and -1), 1 still open → 10
        self.assertEqual(result["remaining"][-1], 10.0)

    def test_unestimated_count(self):
        result = get_burndown(self.sprint.name)
        self.assertEqual(result["unestimated_count"], 1)
```

- [ ] **Step 2: Run, verify fail**

Run: `bench --site <site> run-tests --app vernon_tasks --module vernon_tasks.task.services.test_burndown_service`
Expected: ImportError.

- [ ] **Step 3: Implement**

`vernon_tasks/task/services/burndown_service.py`:
```python
import frappe
from frappe.utils import add_days, getdate


def get_burndown(sprint: str) -> dict:
    sprint_doc = frappe.get_doc("VT Sprint", sprint)
    start = getdate(sprint_doc.start_date)
    end = getdate(sprint_doc.end_date)
    days = (end - start).days + 1
    if days <= 0:
        return {"labels": [], "ideal": [], "remaining": [], "unestimated_count": 0}

    tasks = frappe.db.sql("""
        SELECT estimated_hours, completion_date
        FROM `tabVT Task`
        WHERE sprint = %(sprint)s
          AND estimated_hours > 0
    """, {"sprint": sprint}, as_dict=True)

    total = sum(float(t["estimated_hours"]) for t in tasks)

    labels, ideal, remaining = [], [], []
    for i in range(days):
        d = add_days(start, i)
        d_date = getdate(d)
        labels.append(str(d_date))
        ideal.append(round(total * (1 - i / (days - 1)) if days > 1 else 0.0, 2))
        rem = sum(
            float(t["estimated_hours"])
            for t in tasks
            if t["completion_date"] is None or getdate(t["completion_date"]) > d_date
        )
        remaining.append(float(rem))

    unestimated_count = frappe.db.count(
        "VT Task",
        filters={"sprint": sprint, "estimated_hours": 0},
    )

    return {
        "labels": labels,
        "ideal": ideal,
        "remaining": remaining,
        "unestimated_count": int(unestimated_count),
    }
```

- [ ] **Step 4: Run, verify pass**

Run: `bench --site <site> run-tests --app vernon_tasks --module vernon_tasks.task.services.test_burndown_service`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add vernon_tasks/task/services/burndown_service.py vernon_tasks/task/services/test_burndown_service.py
git commit -m "feat(analytics): add burndown service (daily remaining vs ideal in hours)"
```

---

## Task 6: Forecast service

**Files:**
- Create: `vernon_tasks/task/services/forecast_service.py`
- Create: `vernon_tasks/task/services/test_forecast_service.py`

Behavior:
- `get_forecast(project)`:
  - Pull last 6 closed sprints via `get_velocity_trend`.
  - If fewer than 3 → `{"insufficient_data": True, "sprints_needed": 3 - n}`.
  - `remaining_hours` = sum `estimated_hours - actual_hours` (floored at 0 per task) for tasks where `project=<project>` AND `pdca_phase != 'DONE'`.
  - `avg_velocity` = mean of velocities, `min_velocity` = mean of worst 1/3, `max_velocity` = mean of best 1/3.
  - `sprints_to_finish` = ceil(remaining / avg). Sprint length: median of past sprints in days.
  - `predicted_end` = today + sprints_to_finish * sprint_len_days.
  - `p_min` (worst case) = today + ceil(remaining / min_velocity) * sprint_len_days.
  - `p_max` (best case) = today + ceil(remaining / max_velocity) * sprint_len_days.
  - `confidence` = 1 - (stdev / avg), clamped [0, 1].

- [ ] **Step 1: Write failing tests**

`vernon_tasks/task/services/test_forecast_service.py`:
```python
import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, today
from vernon_tasks.task.services.forecast_service import get_forecast


def _setup_project(name, sprint_velocities, remaining_hours, sprint_len=14):
    if frappe.db.exists("VT Project", name):
        frappe.delete_doc("VT Project", name, force=True)
    project = frappe.get_doc({
        "doctype": "VT Project",
        "title": name,
        "start_date": add_days(today(), -180),
        "end_date": add_days(today(), 180),
        "status": "Active",
    }).insert(ignore_permissions=True)
    for idx, v in enumerate(sprint_velocities):
        offset = -((len(sprint_velocities) - idx) * sprint_len)
        sprint = frappe.get_doc({
            "doctype": "VT Sprint",
            "sprint_title": f"FC-{name}-{idx}",
            "project": project.name,
            "start_date": add_days(today(), offset),
            "end_date": add_days(today(), offset + sprint_len - 1),
            "status": "Closed",
        }).insert(ignore_permissions=True)
        if v > 0:
            frappe.get_doc({
                "doctype": "VT Task",
                "title": "T",
                "project": project.name,
                "sprint": sprint.name,
                "estimated_hours": v,
                "actual_hours": v,
                "completion_date": add_days(today(), offset + 1),
                "pdca_phase": "DONE",
                "kanban_status": "Done",
            }).insert(ignore_permissions=True)
    if remaining_hours > 0:
        frappe.get_doc({
            "doctype": "VT Task",
            "title": "Remain",
            "project": project.name,
            "estimated_hours": remaining_hours,
            "actual_hours": 0,
            "pdca_phase": "DO",
            "kanban_status": "In Progress",
        }).insert(ignore_permissions=True)
    return project


class TestForecastService(FrappeTestCase):
    def test_insufficient_data_under_three_sprints(self):
        _setup_project("FC-Few", [10, 12], remaining_hours=20)
        result = get_forecast("FC-Few")
        self.assertTrue(result["insufficient_data"])
        self.assertEqual(result["sprints_needed"], 1)

    def test_predicted_end_uses_avg_velocity(self):
        _setup_project("FC-Even", [10, 10, 10], remaining_hours=30)
        result = get_forecast("FC-Even")
        self.assertFalse(result.get("insufficient_data"))
        self.assertAlmostEqual(result["avg_velocity"], 10.0)
        self.assertEqual(result["remaining_hours"], 30.0)
        # 30 / 10 = 3 sprints
        self.assertEqual(result["sprints_used"], 3)

    def test_confidence_high_when_stdev_low(self):
        _setup_project("FC-Stable", [10, 10, 10, 10], remaining_hours=10)
        result = get_forecast("FC-Stable")
        self.assertGreaterEqual(result["confidence"], 0.95)

    def test_pmin_after_predicted_after_pmax(self):
        _setup_project("FC-Range", [5, 10, 15], remaining_hours=30)
        result = get_forecast("FC-Range")
        from frappe.utils import getdate
        self.assertGreaterEqual(getdate(result["p_min"]), getdate(result["predicted_end"]))
        self.assertLessEqual(getdate(result["p_max"]), getdate(result["predicted_end"]))
```

- [ ] **Step 2: Run, verify fail**

Run: `bench --site <site> run-tests --app vernon_tasks --module vernon_tasks.task.services.test_forecast_service`
Expected: ImportError.

- [ ] **Step 3: Implement**

`vernon_tasks/task/services/forecast_service.py`:
```python
import math
import statistics
import frappe
from frappe.utils import add_days, getdate, today
from vernon_tasks.task.services.velocity_service import get_velocity_trend

_MIN_SPRINTS = 3
_DEFAULT_SPRINT_DAYS = 14


def _remaining_hours(project: str) -> float:
    row = frappe.db.sql("""
        SELECT COALESCE(SUM(GREATEST(estimated_hours - actual_hours, 0)), 0) AS hrs
        FROM `tabVT Task`
        WHERE project = %(project)s
          AND pdca_phase != 'DONE'
    """, {"project": project}, as_dict=True)
    return float(row[0]["hrs"])


def _median_sprint_length(project: str) -> int:
    rows = frappe.db.sql("""
        SELECT DATEDIFF(end_date, start_date) + 1 AS days
        FROM `tabVT Sprint`
        WHERE project = %(project)s
          AND status = 'Closed'
    """, {"project": project}, as_dict=True)
    if not rows:
        return _DEFAULT_SPRINT_DAYS
    return int(statistics.median([int(r["days"]) for r in rows]))


def _bucket_mean(values: list[float], pick: str) -> float:
    """pick='worst' takes lowest third; 'best' takes highest third."""
    if not values:
        return 0.0
    sorted_v = sorted(values)
    size = max(1, len(sorted_v) // 3)
    bucket = sorted_v[:size] if pick == "worst" else sorted_v[-size:]
    return sum(bucket) / len(bucket)


def get_forecast(project: str) -> dict:
    trend = get_velocity_trend(project, n=6)
    velocities = trend["velocity"]

    if len(velocities) < _MIN_SPRINTS:
        return {
            "insufficient_data": True,
            "sprints_needed": _MIN_SPRINTS - len(velocities),
        }

    avg = trend["avg"]
    if avg <= 0:
        return {"insufficient_data": True, "sprints_needed": 0, "reason": "zero velocity"}

    remaining = _remaining_hours(project)
    sprint_days = _median_sprint_length(project)

    sprints_used = math.ceil(remaining / avg) if remaining > 0 else 0
    predicted_end = add_days(today(), sprints_used * sprint_days)

    min_v = _bucket_mean(velocities, "worst")
    max_v = _bucket_mean(velocities, "best")
    p_min = add_days(today(), math.ceil(remaining / min_v) * sprint_days) if min_v > 0 else predicted_end
    p_max = add_days(today(), math.ceil(remaining / max_v) * sprint_days) if max_v > 0 else predicted_end

    if len(velocities) >= 2:
        stdev = statistics.pstdev(velocities)
        confidence = max(0.0, min(1.0, 1 - (stdev / avg)))
    else:
        confidence = 0.0

    return {
        "insufficient_data": False,
        "predicted_end": str(getdate(predicted_end)),
        "p_min": str(getdate(p_min)),
        "p_max": str(getdate(p_max)),
        "confidence": round(float(confidence), 3),
        "remaining_hours": round(remaining, 2),
        "avg_velocity": round(float(avg), 2),
        "sprints_used": int(sprints_used),
    }
```

- [ ] **Step 4: Run, verify pass**

Run: `bench --site <site> run-tests --app vernon_tasks --module vernon_tasks.task.services.test_forecast_service`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add vernon_tasks/task/services/forecast_service.py vernon_tasks/task/services/test_forecast_service.py
git commit -m "feat(analytics): add forecast service (linear projection + confidence band)"
```

---

## Task 7: Risk evaluator

**Files:**
- Create: `vernon_tasks/task/services/risk_evaluator.py`
- Create: `vernon_tasks/task/services/test_risk_evaluator.py`

Behavior:
- `evaluate_risks(project)` → list of `{type, severity, target, detail, days}` dicts.
- Risk types:
  - `slip`: forecast `predicted_end > project.end_date` by `slip_pct_threshold`. Severity: low <slip_pct, med [slip_pct, 2*slip_pct), high ≥2*slip_pct.
  - `blocked`: any task with `kanban_status = 'Blocked'` for `> blocked_days_threshold` days (today - modified). Severity scales similarly.
  - `overcap`: any member where `SUM(estimated_hours of active tasks) / available_hours > capacity_pct_threshold`. Active = `pdca_phase NOT IN ('DONE')`. For Phase 1, `available_hours = 40 * (sprints_remaining_in_project)`; if no project end, use 40h × 2 weeks = 80h.

- [ ] **Step 1: Write failing tests**

`vernon_tasks/task/services/test_risk_evaluator.py`:
```python
import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, today
from vernon_tasks.task.services.risk_evaluator import evaluate_risks


def _make_project(name, end_offset=30):
    if frappe.db.exists("VT Project", name):
        frappe.delete_doc("VT Project", name, force=True)
    return frappe.get_doc({
        "doctype": "VT Project",
        "title": name,
        "start_date": add_days(today(), -30),
        "end_date": add_days(today(), end_offset),
        "status": "Active",
    }).insert(ignore_permissions=True)


class TestRiskEvaluator(FrappeTestCase):
    def setUp(self):
        settings = frappe.get_single("VT Settings")
        settings.default_blocked_days_threshold = 3
        settings.default_slip_pct_threshold = 20
        settings.default_capacity_pct_threshold = 120
        settings.save(ignore_permissions=True)

    def test_no_risks_on_empty_project(self):
        _make_project("Risk-Empty")
        self.assertEqual(evaluate_risks("Risk-Empty"), [])

    def test_blocked_task_above_threshold(self):
        p = _make_project("Risk-Blocked")
        t = frappe.get_doc({
            "doctype": "VT Task",
            "title": "Stuck",
            "project": p.name,
            "estimated_hours": 4,
            "actual_hours": 0,
            "kanban_status": "Blocked",
            "pdca_phase": "DO",
        }).insert(ignore_permissions=True)
        # Backdate modified by 5 days
        frappe.db.set_value("VT Task", t.name, "modified", add_days(today(), -5), update_modified=False)
        risks = evaluate_risks(p.name)
        blocked = [r for r in risks if r["type"] == "blocked"]
        self.assertEqual(len(blocked), 1)
        self.assertEqual(blocked[0]["target"], t.name)
        self.assertGreaterEqual(blocked[0]["days"], 5)

    def test_blocked_below_threshold_not_reported(self):
        p = _make_project("Risk-Blocked-Fresh")
        frappe.get_doc({
            "doctype": "VT Task",
            "title": "Fresh",
            "project": p.name,
            "estimated_hours": 4,
            "actual_hours": 0,
            "kanban_status": "Blocked",
            "pdca_phase": "DO",
        }).insert(ignore_permissions=True)
        risks = evaluate_risks(p.name)
        self.assertEqual([r for r in risks if r["type"] == "blocked"], [])

    def test_project_override_changes_threshold(self):
        p = _make_project("Risk-Override")
        frappe.db.set_value("VT Project", p.name, "blocked_days_threshold", 30)
        t = frappe.get_doc({
            "doctype": "VT Task",
            "title": "Stuck",
            "project": p.name,
            "estimated_hours": 4,
            "actual_hours": 0,
            "kanban_status": "Blocked",
            "pdca_phase": "DO",
        }).insert(ignore_permissions=True)
        frappe.db.set_value("VT Task", t.name, "modified", add_days(today(), -10), update_modified=False)
        risks = evaluate_risks(p.name)
        # Override raises threshold to 30 days; 10 days blocked → no risk
        self.assertEqual([r for r in risks if r["type"] == "blocked"], [])
```

- [ ] **Step 2: Run, verify fail**

Run: `bench --site <site> run-tests --app vernon_tasks --module vernon_tasks.task.services.test_risk_evaluator`
Expected: ImportError.

- [ ] **Step 3: Implement**

`vernon_tasks/task/services/risk_evaluator.py`:
```python
import frappe
from frappe.utils import date_diff, getdate, today
from vernon_tasks.task.services.threshold import get_project_threshold
from vernon_tasks.task.services.forecast_service import get_forecast

_BLOCKED_STATUS = "Blocked"
_DONE_PHASE = "DONE"
_DEFAULT_WEEKLY_HOURS = 40


def _severity(ratio: float) -> str:
    if ratio >= 2.0:
        return "high"
    if ratio >= 1.0:
        return "med"
    return "low"


def _blocked_risks(project: str, threshold_days: int) -> list[dict]:
    rows = frappe.db.sql("""
        SELECT name, title, assigned_to, modified
        FROM `tabVT Task`
        WHERE project = %(project)s
          AND kanban_status = %(blocked)s
          AND pdca_phase != %(done)s
    """, {"project": project, "blocked": _BLOCKED_STATUS, "done": _DONE_PHASE}, as_dict=True)

    risks = []
    today_d = getdate(today())
    for r in rows:
        days = date_diff(today_d, getdate(r["modified"]))
        if days > threshold_days:
            ratio = days / threshold_days
            risks.append({
                "type": "blocked",
                "severity": _severity(ratio),
                "target": r["name"],
                "detail": f"{r['title']} blocked {days}d (assignee: {r['assigned_to'] or 'unassigned'})",
                "days": int(days),
            })
    return risks


def _slip_risk(project: str, threshold_pct: float) -> list[dict]:
    project_doc = frappe.get_doc("VT Project", project)
    if not project_doc.end_date:
        return []
    forecast = get_forecast(project)
    if forecast.get("insufficient_data"):
        return []

    planned = getdate(project_doc.end_date)
    predicted = getdate(forecast["predicted_end"])
    total_days = max(1, date_diff(planned, getdate(project_doc.start_date)))
    slip_days = date_diff(predicted, planned)
    if slip_days <= 0:
        return []

    slip_pct = (slip_days / total_days) * 100
    if slip_pct < threshold_pct:
        return []

    ratio = slip_pct / threshold_pct
    return [{
        "type": "slip",
        "severity": _severity(ratio),
        "target": project,
        "detail": f"Predicted end {predicted} slips {int(slip_days)}d past planned {planned} ({slip_pct:.1f}%)",
        "days": int(slip_days),
    }]


def _overcap_risks(project: str, threshold_pct: float) -> list[dict]:
    rows = frappe.db.sql("""
        SELECT assigned_to,
               COALESCE(SUM(GREATEST(estimated_hours - actual_hours, 0)), 0) AS hrs
        FROM `tabVT Task`
        WHERE project = %(project)s
          AND pdca_phase != %(done)s
          AND assigned_to IS NOT NULL
        GROUP BY assigned_to
    """, {"project": project, "done": _DONE_PHASE}, as_dict=True)

    project_doc = frappe.get_doc("VT Project", project)
    if project_doc.end_date:
        days_left = max(1, date_diff(getdate(project_doc.end_date), getdate(today())))
        available = (days_left / 7) * _DEFAULT_WEEKLY_HOURS
    else:
        available = 2 * _DEFAULT_WEEKLY_HOURS

    risks = []
    for r in rows:
        hrs = float(r["hrs"])
        if available <= 0:
            continue
        pct = (hrs / available) * 100
        if pct >= threshold_pct:
            ratio = pct / threshold_pct
            risks.append({
                "type": "overcap",
                "severity": _severity(ratio),
                "target": r["assigned_to"],
                "detail": f"{r['assigned_to']} has {hrs:.0f}h of {available:.0f}h available ({pct:.0f}%)",
                "days": 0,
            })
    return risks


def evaluate_risks(project: str) -> list[dict]:
    blocked_thr = int(get_project_threshold(project, "blocked_days"))
    slip_thr = float(get_project_threshold(project, "slip_pct"))
    cap_thr = float(get_project_threshold(project, "capacity_pct"))

    return [
        *_blocked_risks(project, blocked_thr),
        *_slip_risk(project, slip_thr),
        *_overcap_risks(project, cap_thr),
    ]
```

- [ ] **Step 4: Run, verify pass**

Run: `bench --site <site> run-tests --app vernon_tasks --module vernon_tasks.task.services.test_risk_evaluator`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add vernon_tasks/task/services/risk_evaluator.py vernon_tasks/task/services/test_risk_evaluator.py
git commit -m "feat(analytics): add risk evaluator (slip, blocked, overcap)"
```

---

## Task 8: Whitelisted API + caching

**Files:**
- Create: `vernon_tasks/task/api/__init__.py` (empty)
- Create: `vernon_tasks/task/api/analytics.py`
- Create: `vernon_tasks/task/api/test_analytics.py`

- [ ] **Step 1: Write failing tests**

`vernon_tasks/task/api/test_analytics.py`:
```python
import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_tasks.task.api.analytics import (
    get_burndown,
    get_velocity_trend,
    get_forecast,
    get_risks,
)


def _ensure_role(role):
    if not frappe.db.exists("Role", role):
        frappe.get_doc({"doctype": "Role", "role_name": role}).insert(ignore_permissions=True)


def _user_with_roles(email, roles):
    if not frappe.db.exists("User", email):
        frappe.get_doc({
            "doctype": "User",
            "email": email,
            "first_name": "T",
            "send_welcome_email": 0,
            "enabled": 1,
            "roles": [{"role": r} for r in roles],
        }).insert(ignore_permissions=True)
    return email


class TestAnalyticsAPI(FrappeTestCase):
    def setUp(self):
        _ensure_role("VT Leader")
        self.leader = _user_with_roles("vt-leader-test@example.com", ["VT Leader"])
        self.guest = _user_with_roles("vt-guest-test@example.com", [])

    def test_get_burndown_requires_leader_role(self):
        frappe.set_user(self.guest)
        with self.assertRaises(frappe.PermissionError):
            get_burndown(sprint="x")
        frappe.set_user("Administrator")

    def test_get_velocity_trend_requires_leader_role(self):
        frappe.set_user(self.guest)
        with self.assertRaises(frappe.PermissionError):
            get_velocity_trend(project="x")
        frappe.set_user("Administrator")

    def test_get_forecast_requires_leader_role(self):
        frappe.set_user(self.guest)
        with self.assertRaises(frappe.PermissionError):
            get_forecast(project="x")
        frappe.set_user("Administrator")

    def test_get_risks_requires_leader_role(self):
        frappe.set_user(self.guest)
        with self.assertRaises(frappe.PermissionError):
            get_risks(project="x")
        frappe.set_user("Administrator")
```

- [ ] **Step 2: Run, verify fail**

Run: `bench --site <site> run-tests --app vernon_tasks --module vernon_tasks.task.api.test_analytics`
Expected: ImportError.

- [ ] **Step 3: Implement**

`vernon_tasks/task/api/__init__.py`: empty file.

`vernon_tasks/task/api/analytics.py`:
```python
import frappe
from vernon_tasks.task.services import (
    burndown_service,
    velocity_service,
    forecast_service,
    risk_evaluator,
)

_ALLOWED_ROLES = ("VT Leader", "VT Manager")
_CACHE_TTL = 3600  # 1h


def _guard():
    if not set(frappe.get_roles()) & set(_ALLOWED_ROLES):
        frappe.throw("Not authorized", frappe.PermissionError)


def _cache_get_or_set(key: str, fn):
    cached = frappe.cache().get_value(key)
    if cached is not None:
        return cached
    val = fn()
    frappe.cache().set_value(key, val, expires_in_sec=_CACHE_TTL)
    return val


@frappe.whitelist()
def get_burndown(sprint: str) -> dict:
    _guard()
    return burndown_service.get_burndown(sprint)


@frappe.whitelist()
def get_velocity_trend(project: str, n: int = 6) -> dict:
    _guard()
    key = f"vt_velocity:{project}:{n}"
    return _cache_get_or_set(key, lambda: velocity_service.get_velocity_trend(project, int(n)))


@frappe.whitelist()
def get_forecast(project: str) -> dict:
    _guard()
    key = f"vt_forecast:{project}"
    return _cache_get_or_set(key, lambda: forecast_service.get_forecast(project))


@frappe.whitelist()
def get_risks(project: str) -> list:
    _guard()
    return risk_evaluator.evaluate_risks(project)


def invalidate_project_cache(doc, method=None):
    """Hook target — clears velocity + forecast cache for a project."""
    project = getattr(doc, "project", None) or getattr(doc, "name", None)
    if not project:
        return
    for n in (3, 6, 12):
        frappe.cache().delete_value(f"vt_velocity:{project}:{n}")
    frappe.cache().delete_value(f"vt_forecast:{project}")
```

- [ ] **Step 4: Run, verify pass**

Run: `bench --site <site> run-tests --app vernon_tasks --module vernon_tasks.task.api.test_analytics`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add vernon_tasks/task/api/__init__.py vernon_tasks/task/api/analytics.py vernon_tasks/task/api/test_analytics.py
git commit -m "feat(analytics): add whitelisted API endpoints with role gate + cache"
```

---

## Task 9: Cache invalidation hooks

**Files:**
- Modify: `vernon_tasks/hooks.py`

- [ ] **Step 1: Inspect hooks.py**

Run: `cat vernon_tasks/hooks.py`

Identify existing `doc_events` block (may not exist yet).

- [ ] **Step 2: Add doc_events**

Append (or merge into existing dict):

```python
doc_events = {
    "VT Sprint": {
        "on_update": "vernon_tasks.task.api.analytics.invalidate_project_cache",
    },
    "VT Task": {
        "on_update": "vernon_tasks.task.api.analytics.invalidate_project_cache",
    },
}
```

If `doc_events` already exists, merge new keys into it (don't duplicate the variable).

- [ ] **Step 3: Reload hooks**

Run: `bench --site <site> clear-cache && bench --site <site> migrate`
Expected: Hooks registered without error.

- [ ] **Step 4: Commit**

```bash
git add vernon_tasks/hooks.py
git commit -m "feat(analytics): invalidate velocity/forecast cache on sprint/task updates"
```

---

## Task 10: Leader Analytics page (backend stub + JSON)

**Files:**
- Create: `vernon_tasks/task/page/leader_analytics/__init__.py`
- Create: `vernon_tasks/task/page/leader_analytics/leader_analytics.json`
- Create: `vernon_tasks/task/page/leader_analytics/leader_analytics.py`

- [ ] **Step 1: Page __init__**

`vernon_tasks/task/page/leader_analytics/__init__.py`: empty.

- [ ] **Step 2: Page JSON** (mirror `leader_dashboard.json` shape)

`vernon_tasks/task/page/leader_analytics/leader_analytics.json`:
```json
{
  "name": "leader-analytics",
  "doctype": "Page",
  "module": "Task",
  "page_name": "leader-analytics",
  "title": "Leader Analytics",
  "standard": "Yes",
  "roles": [
    {"role": "VT Leader"},
    {"role": "VT Manager"}
  ]
}
```

- [ ] **Step 3: Page py (sanity loader)**

`vernon_tasks/task/page/leader_analytics/leader_analytics.py`:
```python
import frappe

_ALLOWED_ROLES = ("VT Leader", "VT Manager")


def get_context(context):
    if not set(frappe.get_roles()) & set(_ALLOWED_ROLES):
        frappe.throw("Not authorized", frappe.PermissionError)
    return context
```

- [ ] **Step 4: Migrate + load**

Run: `bench --site <site> migrate`
Expected: Page registered. Visit `/app/leader-analytics` → blank page (JS comes next task).

- [ ] **Step 5: Commit**

```bash
git add vernon_tasks/task/page/leader_analytics/
git commit -m "feat(page/leader_analytics): add page scaffold + role gate"
```

---

## Task 11: Leader Analytics page JS

**Files:**
- Create: `vernon_tasks/task/page/leader_analytics/leader_analytics.js`

- [ ] **Step 1: Implement page JS**

`vernon_tasks/task/page/leader_analytics/leader_analytics.js`:
```javascript
frappe.pages['leader-analytics'].on_page_load = function(wrapper) {
  const page = frappe.ui.make_app_page({
    parent: wrapper,
    title: __('Leader Analytics'),
    single_column: true,
  });

  const $body = $(wrapper).find('.layout-main-section');
  $body.html(`
    <div class="vt-analytics-toolbar" style="display:flex;gap:8px;margin-bottom:16px;"></div>
    <div class="vt-analytics-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div class="vt-card" id="vt-burndown"><h5>${__('Burndown')}</h5><div class="chart"></div><div class="note text-muted small"></div></div>
      <div class="vt-card" id="vt-velocity"><h5>${__('Velocity Trend')}</h5><div class="chart"></div><div class="note text-muted small"></div></div>
      <div class="vt-card" id="vt-forecast"><h5>${__('Forecast')}</h5><div class="content"></div></div>
      <div class="vt-card" id="vt-risks"><h5>${__('Risks')}</h5><div class="content"></div></div>
    </div>
  `);

  const state = { project: null, sprint: null };
  const project_field = page.add_field({
    fieldname: 'project', label: __('Project'), fieldtype: 'Link', options: 'VT Project',
    change: () => { state.project = project_field.get_value(); refresh(); },
  });
  const sprint_field = page.add_field({
    fieldname: 'sprint', label: __('Sprint'), fieldtype: 'Link', options: 'VT Sprint',
    get_query: () => ({ filters: { project: state.project } }),
    change: () => { state.sprint = sprint_field.get_value(); render_burndown(); },
  });

  function refresh() {
    if (!state.project) return;
    render_velocity();
    render_forecast();
    render_risks();
  }

  function call(method, args) {
    return frappe.call({ method: `vernon_tasks.task.api.analytics.${method}`, args })
      .then(r => r.message);
  }

  function render_burndown() {
    if (!state.sprint) return;
    call('get_burndown', { sprint: state.sprint }).then(data => {
      $('#vt-burndown .chart').empty();
      new frappe.Chart('#vt-burndown .chart', {
        type: 'line',
        data: {
          labels: data.labels,
          datasets: [
            { name: __('Ideal'), values: data.ideal },
            { name: __('Remaining'), values: data.remaining },
          ],
        },
        height: 240,
      });
      $('#vt-burndown .note').text(
        data.unestimated_count ? __('{0} tasks unestimated', [data.unestimated_count]) : ''
      );
    });
  }

  function render_velocity() {
    call('get_velocity_trend', { project: state.project, n: 6 }).then(data => {
      $('#vt-velocity .chart').empty();
      if (!data.sprints.length) {
        $('#vt-velocity .note').text(__('No closed sprints yet'));
        return;
      }
      new frappe.Chart('#vt-velocity .chart', {
        type: 'bar',
        data: {
          labels: data.sprints,
          datasets: [{ name: __('Hours'), values: data.velocity }],
          yMarkers: [{ label: __('avg'), value: data.avg }],
        },
        height: 240,
      });
      const arrow = data.trend_pct > 0 ? '↑' : (data.trend_pct < 0 ? '↓' : '→');
      $('#vt-velocity .note').text(__('Avg: {0}h | Trend: {1} {2}%',
        [data.avg.toFixed(1), arrow, Math.abs(data.trend_pct).toFixed(1)]));
    });
  }

  function render_forecast() {
    call('get_forecast', { project: state.project }).then(data => {
      const $c = $('#vt-forecast .content').empty();
      if (data.insufficient_data) {
        $c.text(__('Need {0} more closed sprint(s) for forecast', [data.sprints_needed]));
        return;
      }
      $c.html(`
        <div><strong>${__('Predicted end')}:</strong> ${frappe.utils.escape_html(data.predicted_end)}</div>
        <div class="text-muted small">${__('Range')}: ${frappe.utils.escape_html(data.p_max)} – ${frappe.utils.escape_html(data.p_min)}</div>
        <div class="text-muted small">${__('Confidence')}: ${(data.confidence * 100).toFixed(0)}%</div>
        <div class="text-muted small">${__('Remaining')}: ${data.remaining_hours}h / ${__('Avg velocity')}: ${data.avg_velocity}h</div>
      `);
    });
  }

  function render_risks() {
    call('get_risks', { project: state.project }).then(risks => {
      const $c = $('#vt-risks .content').empty();
      if (!risks.length) {
        $c.text(__('No risks detected'));
        return;
      }
      const sev_color = { low: '#6c757d', med: '#fd7e14', high: '#dc3545' };
      risks.forEach(r => {
        $c.append(`
          <div style="border-left:4px solid ${sev_color[r.severity] || '#999'};padding:6px 10px;margin-bottom:6px;">
            <strong>[${frappe.utils.escape_html(r.type)}]</strong>
            ${frappe.utils.escape_html(r.detail)}
          </div>
        `);
      });
    });
  }
};
```

Note: All user-controlled output passed through `frappe.utils.escape_html` to prevent XSS (consistent with the recent `7227118 fix(nav): escape label to prevent XSS in page_nav` commit pattern).

- [ ] **Step 2: Reload + smoke test**

Run: `bench --site <site> clear-cache`
Open `/app/leader-analytics` in browser as a user with `VT Leader` role. Pick a project → velocity/forecast/risk panels populate. Pick a sprint → burndown populates.

- [ ] **Step 3: Commit**

```bash
git add vernon_tasks/task/page/leader_analytics/leader_analytics.js
git commit -m "feat(page/leader_analytics): wire 4 panels (burndown, velocity, forecast, risks)"
```

---

## Task 12: Workspace shortcut

**Files:**
- Modify: `vernon_tasks/task/workspace/vernon_tasks/vernon_tasks.json`

- [ ] **Step 1: Inspect workspace**

Run: `cat vernon_tasks/task/workspace/vernon_tasks/vernon_tasks.json | python -m json.tool | head -80`

Locate the `shortcuts` array.

- [ ] **Step 2: Add shortcut**

Append to `shortcuts`:
```json
{
  "type": "Page",
  "link_to": "leader-analytics",
  "label": "Leader Analytics",
  "color": "Blue"
}
```

- [ ] **Step 3: Migrate**

Run: `bench --site <site> migrate`

- [ ] **Step 4: Commit**

```bash
git add vernon_tasks/task/workspace/vernon_tasks/vernon_tasks.json
git commit -m "feat(workspace): add Leader Analytics shortcut"
```

---

## Task 13: Final verification + docs

- [ ] **Step 1: Full test run**

Run: `bench --site <site> run-tests --app vernon_tasks`
Expected: All tests pass (existing + new ~19 tests added).

- [ ] **Step 2: Manual acceptance walkthrough**

Open `/app/leader-analytics`:
1. Pick a project with ≥3 closed sprints → forecast card shows predicted_end, range, confidence.
2. Pick a project with <3 closed sprints → forecast shows "Need N more closed sprint(s)".
3. Pick a sprint → burndown renders ideal + remaining lines, footer shows unestimated count.
4. Block a task for >3 days → risk panel shows it.
5. Set project `blocked_days_threshold = 30` → block disappears.
6. Log out, log in as user without `VT Leader` role → API calls return 403 PermissionError.

- [ ] **Step 3: Update API reference doc**

Modify `docs/API_REFERENCE.md`: append new section for `vt_analytics.*` endpoints (signature + sample response per spec).

- [ ] **Step 4: Commit docs**

```bash
git add docs/API_REFERENCE.md
git commit -m "docs(api): document analytics endpoints"
```

- [ ] **Step 5: Final summary**

Confirm:
- 13 commits on branch
- All tests pass
- Page loads + 4 panels functional
- Role gate enforced

---

## Notes for Implementer

- **Backdating `modified`**: Frappe's `db.set_value(..., update_modified=False)` is the canonical way to inject backdated `modified` for test setup. Without `update_modified=False` Frappe overwrites your value.
- **Role creation**: `VT Leader` may already exist in the role fixture (`vernon_tasks/fixtures/role.json`); only create if missing.
- **Frappe Charts**: globally available as `frappe.Chart` (no import needed in page JS).
- **Cache key format**: keep `vt_velocity:<project>:<n>` and `vt_forecast:<project>` exactly — `invalidate_project_cache` references these literals.
- **`pdca_phase`/`kanban_status` values**: confirm against existing data; the codebase uses uppercase phase (`DONE`, `DO`, etc.) and title-case status (`Done`, `In Progress`, `Blocked`).

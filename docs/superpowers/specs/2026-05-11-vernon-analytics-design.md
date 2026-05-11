# Vernon Tasks Analytics — Design Spec

**Date:** 2026-05-11
**Status:** Approved for Sub-A MVP build
**Author:** Erick Mo (with Claude)

## Goal

Add a three-layer analytics suite to Vernon Tasks: Leader (Sub-A), Individual Contributor (Sub-B), Executive (Sub-C). Sub-A is built first as the MVP and provides the data primitives reused by B and C.

Metric unit across all layers: **hours** (`estimated_hours` / `actual_hours` on `vt_task`).

## Master Scope

| Layer | Audience | Status |
|---|---|---|
| Sub-A Leader Analytics | Leader / Project Manager | MVP — build now |
| Sub-B IC Analytics | Individual contributor | Outline only |
| Sub-C Executive Analytics | C-level / Executive | Outline only |

Build order: A → B → C. Sub-A produces shared services (`velocity_service`, `forecast_service`, `risk_evaluator`) that B and C consume.

---

## Sub-A — Leader Analytics (MVP)

### Features

1. **Burndown chart** — per active sprint. Daily remaining hours (sum `estimated_hours` of non-done tasks at end-of-day) vs ideal linear line.
2. **Velocity trend** — bar chart of last N sprints (default 6) showing completed `actual_hours`; overlay average line + trend arrow (% change vs prior period).
3. **Forecast completion** — predicted project end date via linear regression on velocity. Includes confidence band: `p_min` from worst N/3 sprints, `p_max` from best N/3 sprints.
4. **Risk alerts panel** — list of active risks, color-coded by severity:
   - Sprint slip risk (projected end > planned end by ≥ `slip_pct_threshold`)
   - Blocked task escalation (any task blocked > `blocked_days_threshold`)
   - Member overcapacity (assigned hours / available hours > `capacity_pct_threshold`)

### Architecture

```
task/
  services/
    velocity_service.py      # velocity per sprint (sum actual_hours of done tasks in window)
    burndown_service.py      # daily remaining timeline for one sprint
    forecast_service.py      # linear regression + confidence band
    risk_evaluator.py        # 3 risk types vs configured thresholds
  api/
    analytics.py             # whitelisted endpoints, role-gated
  page/
    leader_analytics/
      leader_analytics.json
      leader_analytics.js
      leader_analytics.py
```

### API Endpoints

All `@frappe.whitelist()`. Role gate: `Leader` or `System Manager`. Non-leaders only see projects where they are listed in `project_team_member` AND have leader flag.

```
vt_analytics.get_burndown(sprint)
  → {labels: [date], ideal: [hours], remaining: [hours], unestimated_count: int}

vt_analytics.get_velocity_trend(project, n=6)
  → {sprints: [name], velocity: [hours], avg: float, trend_pct: float}

vt_analytics.get_forecast(project)
  → {predicted_end: date, p_min: date, p_max: date, confidence: float,
     remaining_hours: float, avg_velocity: float, sprints_used: int}

vt_analytics.get_risks(project)
  → [{type: "slip"|"blocked"|"overcap", severity: "low"|"med"|"high",
      target: str, detail: str, days: int}]
```

### Data Quality Guards

- Tasks with `estimated_hours == 0` are **excluded** from burndown ideal line. Count surfaced in tooltip ("X tasks unestimated").
- Forecast requires **min 3 completed sprints**. If fewer, API returns `{insufficient_data: true, sprints_needed: 3 - n}`.
- Velocity uses `actual_hours` on tasks where `kanban_status == "Done"` AND `completion_date` falls inside sprint window.

### DocType Changes

**VT Project** — new section `analytics_overrides`:

| Field | Type | Notes |
|---|---|---|
| `blocked_days_threshold` | Int | Null → inherit VT Settings |
| `slip_pct_threshold` | Percent | Null → inherit |
| `capacity_pct_threshold` | Percent | Null → inherit |

**VT Settings** — new defaults:

| Field | Type | Default |
|---|---|---|
| `default_blocked_days_threshold` | Int | 3 |
| `default_slip_pct_threshold` | Percent | 20 |
| `default_capacity_pct_threshold` | Percent | 120 |

Resolution helper: `get_project_threshold(project, key)` — checks project override, falls back to settings, falls back to hardcoded constant.

### Frontend (leader_analytics page)

Layout:
```
[ Project selector ▾ ]  [ Sprint selector ▾ ]

┌──────────────────────┐  ┌──────────────────────┐
│ Burndown (line)      │  │ Velocity Trend (bar) │
│ ideal vs remaining   │  │ + avg line + trend ↑ │
└──────────────────────┘  └──────────────────────┘

┌──────────────────────┐  ┌──────────────────────┐
│ Forecast card        │  │ Risk Panel           │
│ predicted_end        │  │ color-coded list     │
│ range p_min – p_max  │  │ - sprint slip        │
│ confidence X%        │  │ - blocked tasks      │
└──────────────────────┘  │ - overcapacity       │
                          └──────────────────────┘
```

Charts via **Frappe Charts** (consistent with `my_dashboard`, `leader_dashboard`).

### Caching

- Velocity / forecast cached via `frappe.cache()`. Key: `vt_velocity:{project}:{n}` TTL 1h.
- Invalidated on hooks: sprint complete, task status change to/from Done.
- Risk evaluator NOT cached (real-time).

### Testing

- **Unit** per service: fixture of 6 dummy sprints with deterministic velocities.
- **API**: role guard (non-leader 403), empty project, single sprint (insufficient data path), normal case.
- **Forecast accuracy**: feed known sequence [10,12,11,13,12,14] → assert predicted hours / sprint within tolerance.
- **Risk evaluator**: each risk type triggered in isolation + combined.

### Security

- All API endpoints whitelisted + role-checked (`Leader` / `System Manager`).
- Project access: non-leader leaders only see projects via `project_team_member` membership.
- SQL: parameterized `frappe.db.sql` only; no string interpolation of user input.
- Output: dates serialized as ISO; numbers cast to float to avoid Decimal leakage.

---

## Sub-B — IC Analytics (outline)

Reuses: `task_point_log`, `user_point_summary`, Sub-A `velocity_service`.

Features:
- **Leaderboard** — period filter (week/month/quarter), ranked by `earned_points`, tie-break by tasks done.
- **Personal velocity** — own completed hours per sprint vs team average.
- **Streak** — consecutive sprints meeting `work_profile.target_points_per_period`.
- **Progress vs target** — gauge: current period earned / target.

Page: `task/page/my_analytics/`. APIs: `vt_analytics.get_leaderboard`, `.get_personal_velocity`, `.get_streak`, `.get_progress`.

Role gate: `Employee`; users only see own detailed data (leaderboard surfaces names + totals only).

---

## Sub-C — Executive Analytics (outline)

Reuses: Sub-A velocity/forecast + Sub-B aggregates + OKR/KPI data.

Features:
- **OKR roll-up** — % achievement per objective (avg `key_result` progress).
- **KPI trend** — multi-period line chart per `kpi_definition`, sourced from `kpi_entry`.
- **Department comparison** — bar chart: velocity, completion rate, on-time % per department (joined via `work_profile.department`).
- **Health score** — composite: `okr_pct × 0.4 + ontime_pct × 0.3 + velocity_trend × 0.3`.

Page: `task/page/exec_analytics/`. Role gate: `System Manager` + new `Executive` role (added to `fixtures/role.json`).

---

## Cross-Cutting Concerns

| Topic | Decision |
|---|---|
| Charts | Frappe Charts (existing dep) |
| Cache | `frappe.cache()` 1h, invalidate on relevant hooks |
| Time zone | All dates in site TZ via `frappe.utils.now_datetime()` |
| Localization | All UI strings via `__()` for i18n |
| Logging | Risk evaluator logs to `frappe.logger("vt_analytics")` |
| Error UI | Empty state + "insufficient data" cards (not error toasts) |

## Out of Scope (Phase 1)

- Real-time push updates (poll every page open).
- Custom date range selector (fixed N=6 sprints).
- CSV export.
- Drill-down per task from burndown chart.
- Mobile-optimized layout (desktop first).

## Acceptance Criteria (Sub-A)

1. Leader can open `leader_analytics` page, pick project + sprint, see 4 panels populated.
2. With 3+ completed sprints, forecast shows date + range; with < 3, shows insufficient-data state.
3. Risk panel shows at least one risk when synthetic test data violates threshold.
4. Project override of threshold visibly changes risk evaluation.
5. All API endpoints reject non-leader role (HTTP 403 / PermissionError).
6. All services have ≥ 80% line coverage in test suite.
7. `bench --site <site> run-tests --app vernon_tasks` passes.

## File Manifest (Sub-A)

```
vernon_tasks/task/services/__init__.py
vernon_tasks/task/services/velocity_service.py
vernon_tasks/task/services/burndown_service.py
vernon_tasks/task/services/forecast_service.py
vernon_tasks/task/services/risk_evaluator.py
vernon_tasks/task/services/threshold.py            # get_project_threshold helper
vernon_tasks/task/api/__init__.py
vernon_tasks/task/api/analytics.py
vernon_tasks/task/page/leader_analytics/__init__.py
vernon_tasks/task/page/leader_analytics/leader_analytics.json
vernon_tasks/task/page/leader_analytics/leader_analytics.js
vernon_tasks/task/page/leader_analytics/leader_analytics.py
vernon_tasks/project/doctype/vt_project/vt_project.json   # MODIFIED — add overrides section
vernon_tasks/vt_settings/doctype/vt_settings/vt_settings.json  # MODIFIED — add defaults
tests/services/test_velocity_service.py
tests/services/test_burndown_service.py
tests/services/test_forecast_service.py
tests/services/test_risk_evaluator.py
tests/api/test_analytics.py
```

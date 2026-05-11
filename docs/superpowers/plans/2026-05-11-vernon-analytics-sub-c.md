# Vernon Tasks Analytics — Sub-C Executive Implementation Plan

> Subagent-driven execution.

**Goal:** Executive analytics page: OKR roll-up, KPI trend, health score.

**Scope reductions vs original outline:**
- Drop department comparison — `work_profile` has no department field.
- Drop new "Executive" role — reuse `VT Manager` + `System Manager`.

**Files:**
- `task/services/okr_rollup_service.py` + test
- `task/services/kpi_trend_service.py` + test
- `task/services/health_score_service.py` + test
- `task/api/exec_analytics.py` + test
- `task/page/exec_analytics/{__init__,exec_analytics.json,.py,.js}`
- Modify workspace JSON + API_REFERENCE.md

---

## Task 1: OKR roll-up service

`get_okr_rollup(period=None)`:
- Lists active objectives (status != 'Closed', filtered by period if provided)
- For each: `avg_progress = AVG(key_result.progress_percent)`. 0 if no key_result.
- Returns `[{objective, title, owner, progress, kr_count}]` sorted by progress DESC.

## Task 2: KPI trend service

`get_kpi_trend(kpi_definition, periods=12)`:
- Returns last N kpi_entry values ordered by date ASC.
- Returns `{labels[], values[], unit, kpi_name}`.

`list_kpis()`:
- Returns all `KPI Definition` rows with `name`, `kpi_name`, `unit`, `frequency`.

## Task 3: Health score service

`get_health_score()`:
- Composite 0-100:
  - `okr_pct`: weighted avg progress across active objectives (weight 0.5)
  - `ontime_pct`: % of recent DONE tasks (last 90 days) where `completion_date <= deadline` (weight 0.3)
  - `velocity_health`: 50 + clamp(avg trend_pct of active projects, -50, 50) → maps trend -50%..+50% to 0..100, weight 0.2
- Returns `{score, okr_pct, ontime_pct, velocity_health, breakdown}`.

## Task 4: Exec API

`vernon_tasks.task.api.exec_analytics`:
- Role gate: `VT Manager`, `System Manager`.
- Endpoints: `get_okr_rollup`, `get_kpi_trend`, `list_kpis`, `get_health_score`.

## Task 5: Exec page

`/app/exec-analytics`. 3 panels:
- Health score (big number + 3 sub-metrics)
- OKR roll-up (bar chart)
- KPI trend (KPI selector + line chart)

## Task 6: Workspace + verify + docs

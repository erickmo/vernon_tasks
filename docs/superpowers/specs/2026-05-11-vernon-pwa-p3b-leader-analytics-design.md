# Vernon Tasks PWA — P3b Leader Sprint + Exec Analytics

**Date:** 2026-05-11
**Predecessors:** PRs #1–#5 (P0.5, P1a, P1b, P2, P3a)

## Goals

- Convert `/m/leader` into a tabbed page: **Review** (existing) | **Sprint** | **Exec**
- Sprint tab: ProjectPicker (led projects only) + 4 panels
  - Burndown (latest sprint of project)
  - Team velocity trend (last 6 sprints)
  - Forecast (cone of uncertainty)
  - Risks list
- Exec tab: visible only to VT Manager
  - Health score gauge + breakdown
  - OKR rollup table
  - KPI picker + trend chart
- 2 new backend helpers, no new analytics logic
- 3 new telemetry events

Non-goals (deferred):

- Drag-to-reorder kanban (out)
- Realtime updates (polling only, no socket.io)
- Team leaderboard (defer; existing IC leaderboard sufficient)

## Existing endpoints reused

| Endpoint | Purpose |
|----------|---------|
| `analytics.get_burndown(sprint)` | Sprint burndown |
| `analytics.get_velocity_trend(project, n)` | Team velocity |
| `analytics.get_forecast(project)` | Forecast band |
| `analytics.get_risks(project)` | Risk items |
| `exec_analytics.get_health_score()` | Health composite |
| `exec_analytics.get_okr_rollup(period)` | OKR table |
| `exec_analytics.list_kpis()` | KPI dropdown |
| `exec_analytics.get_kpi_trend(kpi, n)` | KPI line |

## New backend endpoints

`vernon_tasks.task.page.leader_review.leader_review`:

```python
@frappe.whitelist()
def get_my_led_projects() -> list:
    return _leader_project_names(frappe.session.user)


@frappe.whitelist()
def get_latest_sprint(project: str) -> dict:
    user = frappe.session.user
    if not _is_leader_of_project(user, project):
        frappe.throw("Not authorized", frappe.PermissionError)
    row = frappe.db.sql(
        """
        SELECT name, title, start_date, end_date, status
        FROM `tabVT Sprint`
        WHERE project = %s
        ORDER BY start_date DESC
        LIMIT 1
        """,
        project,
        as_dict=True,
    )
    return row[0] if row else None
```

Both small additions in existing file. Permission gate identical to `get_review_queue`.

## Architecture additions

```
pwa/src/
  api/
    leader.ts                       # MODIFY: add getMyLedProjects, getLatestSprint, sprintAnalytics wrappers
    leaderExec.ts                   # NEW: exec_analytics wrappers (split: lazy-loadable)
  hooks/
    useLedProjects.ts               # caches getMyLedProjects
    useIsManager.ts                 # boolean from session.roles
  components/
    BurndownChart.tsx               # recharts LineChart (ideal vs actual)
    ForecastChart.tsx               # recharts AreaChart for band + Line for projection
    RiskList.tsx                    # severity-colored card list
    HealthCard.tsx                  # big score + 3 breakdown bars
    OkrTable.tsx
    KpiTrendChart.tsx               # recharts LineChart
    KpiPicker.tsx
  pages/
    Leader.tsx                      # MODIFY: tabs (Review | Sprint | Exec)
    LeaderSprint.tsx                # NEW Sprint tab content
    LeaderExec.tsx                  # NEW Exec tab content (lazy)
```

### Code split

`LeaderSprint` and `LeaderExec` lazy-loaded via `React.lazy` to keep main bundle stable. Recharts already chunked from P2 — reuses same chunk.

## Frontend: leader.ts additions

```typescript
const PAGE = "vernon_tasks.task.page.leader_review.leader_review";
const ANALYTICS = "vernon_tasks.task.api.analytics";

export const fetchMyLedProjects = () =>
  api.get<string[]>(`/api/method/${PAGE}.get_my_led_projects`);

export interface Sprint {
  name: string;
  title: string;
  start_date: string;
  end_date: string;
  status: string;
}

export const fetchLatestSprint = (project: string) =>
  api.get<Sprint | null>(
    `/api/method/${PAGE}.get_latest_sprint?project=${encodeURIComponent(project)}`,
  );

export interface BurndownPoint {
  day: string;
  remaining: number;
  ideal: number;
}

export const fetchBurndown = (sprint: string) =>
  api.get<{ points: BurndownPoint[] }>(
    `/api/method/${ANALYTICS}.get_burndown?sprint=${encodeURIComponent(sprint)}`,
  );

export interface VelocityTrend {
  sprints: string[];
  velocity: number[];
  avg: number;
}

export const fetchTeamVelocity = (project: string, n = 6) =>
  api.get<VelocityTrend>(
    `/api/method/${ANALYTICS}.get_velocity_trend?project=${encodeURIComponent(project)}&n=${n}`,
  );

export interface Forecast {
  projection_date: string | null;
  lower_date: string | null;
  upper_date: string | null;
  confidence: number;
}

export const fetchForecast = (project: string) =>
  api.get<Forecast>(
    `/api/method/${ANALYTICS}.get_forecast?project=${encodeURIComponent(project)}`,
  );

export interface Risk {
  type: string;
  severity: "low" | "medium" | "high";
  task: string;
  detail: string;
}

export const fetchRisks = (project: string) =>
  api.get<{ risks: Risk[] }>(
    `/api/method/${ANALYTICS}.get_risks?project=${encodeURIComponent(project)}`,
  );
```

> Note: actual shapes may vary slightly from existing services. Implementation
> must verify and adjust types to match real return values discovered at
> integration time.

## Frontend: leaderExec.ts

```typescript
const EXEC = "vernon_tasks.task.api.exec_analytics";

export interface HealthScore {
  score: number;
  okr_pct: number;
  ontime_pct: number;
  velocity_health: number;
}

export const fetchHealthScore = () =>
  api.get<HealthScore>(`/api/method/${EXEC}.get_health_score`);

export interface OkrRow {
  objective: string;
  title: string;
  owner: string;
  status: string;
  progress: number;
  kr_count: number;
}

export const fetchOkrRollup = (period?: string) =>
  api.get<OkrRow[]>(
    `/api/method/${EXEC}.get_okr_rollup${period ? `?period=${period}` : ""}`,
  );

export interface KpiMeta {
  name: string;
  kpi_name: string;
  unit: string;
  frequency: string;
}

export const fetchKpiList = () =>
  api.get<KpiMeta[]>(`/api/method/${EXEC}.list_kpis`);

export interface KpiTrend {
  labels: string[];
  values: number[];
  unit: string;
  kpi_name: string;
}

export const fetchKpiTrend = (kpi: string, periods = 12) =>
  api.get<KpiTrend>(
    `/api/method/${EXEC}.get_kpi_trend?kpi_definition=${encodeURIComponent(kpi)}&periods=${periods}`,
  );
```

## Leader page restructure

```typescript
// pages/Leader.tsx (modified)
const TABS = [
  { key: "review", label: "Review" },
  { key: "sprint", label: "Sprint" },
];
// add "exec" tab only if isManager

const SprintTab = lazy(() => import("./LeaderSprint"));
const ExecTab = lazy(() => import("./LeaderExec"));
```

Existing review queue logic moves into `LeaderReviewTab` component within
`Leader.tsx`.

## Sprint tab layout

```
ProjectPicker (led projects)
↓
[Sprint X — Active] (latest sprint info)
↓
BurndownChart
↓
Team Velocity (line, last 6)
↓
Forecast (date + confidence band)
↓
Risk List (severity chips + task title)
```

## Exec tab layout

```
HealthCard (score + 3 breakdown bars)
↓
OKR Rollup table (objective, owner, status, progress %)
↓
KpiPicker → KpiTrendChart
```

## Charts

- `BurndownChart`: dual line (ideal dashed, actual solid)
- `ForecastChart`: AreaChart with band + central line
- `KpiTrendChart`: LineChart with unit label on Y-axis
- `HealthCard`: simple SVG circle + 3 ProgressBars (reuse component)

## Telemetry events

```
"leader_sprint_view",
"leader_exec_view",
"leader_project_change",
```

## Role gating

- Sprint tab: gated by `useIsLeader` (existing)
- Exec tab: gated by new `useIsManager` (boolean from `session.roles` contains "VT Manager" or "System Manager")
- Backend endpoints already have `_guard()` — defense in depth

## Error handling

| Failure | UX |
|---|---|
| No led projects | EmptyState "Belum ada proyek yang dipimpin" |
| Project picker offline | Use cached list if available |
| 403 on exec | EmptyState "Akses manajer diperlukan" |
| Forecast insufficient data | "Data sprint kurang untuk forecast" |
| KPI list empty | EmptyState "Belum ada KPI terdefinisi" |
| Risks empty | "Tidak ada risiko terdeteksi" |

## Testing

### Vitest

- `leader.test.ts` extended for new endpoints
- `leaderExec.test.ts` URLs
- `useLedProjects.test.ts` returns array
- `useIsManager.test.ts` boolean
- `HealthCard.test.tsx` renders score number
- `OkrTable.test.tsx` rows render with progress
- `RiskList.test.tsx` severity color mapping
- `BurndownChart`, `ForecastChart`, `KpiTrendChart` smoke render with data

### pytest

- `get_my_led_projects` returns list for VT Leader user
- `get_latest_sprint` returns most recent + 403 for non-leader

## Bundle impact

- New components: ~25 KB
- Recharts shared chunk already exists from P2 (no additional)
- Lazy code split keeps main stable
- Main bundle estimate: 310 KB (from 302)

## Rollout

1. Build + deploy staging
2. Pilot 1-2 VT Leaders for sprint tab review
3. Pilot 1 VT Manager for exec tab review
4. Telemetry per-tab views, project switches

## Open questions

None.

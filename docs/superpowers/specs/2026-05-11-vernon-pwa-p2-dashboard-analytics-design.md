# Vernon Tasks PWA — P2 Dashboard + IC Analytics

**Date:** 2026-05-11
**Predecessors:** P0.5 (#1), P1a (#2), P1b (#3) — all merged

## Goals

- Replace `/m/dashboard` and `/m/analytics` placeholders with working pages
- Dashboard: 3 summary tiles (points / streak / completed) + active sprint
  progress + sprint kanban (read-only, horizontal scroll)
- Analytics: tab switcher with three sub-views (Leaderboard / Velocity / Streak)
- Reuse existing whitelisted endpoints; add one new (`get_sprint_kanban`)
- Charts via `recharts` (lightweight, accessible, dark-mode aware)
- Offline cache via existing IDB primitives
- 4 new telemetry events

Non-goals (deferred):

- Leader views (P3)
- Push notifications (separate initiative)
- Realtime kanban updates (read-only this phase)
- Drag-to-move kanban cards (out of scope)

## Existing endpoints reused

| Endpoint | Purpose |
|----------|---------|
| `vernon_tasks.task.page.my_dashboard.my_dashboard.get_employee_stats` | Points, streak, completion totals |
| `vernon_tasks.task.page.my_dashboard.my_dashboard.get_daily_completions` | Last 14-day daily count |
| `vernon_tasks.task.page.my_dashboard.my_dashboard.get_hours_summary` | Estimated vs actual hours |
| `vernon_tasks.task.api.ic_analytics.get_leaderboard` | Top performers per period |
| `vernon_tasks.task.api.ic_analytics.get_personal_velocity` | Points per sprint |
| `vernon_tasks.task.api.ic_analytics.get_streak` | Streak history |

## New endpoint

`vernon_tasks.task.page.my_dashboard.my_dashboard.get_sprint_kanban` returns:

```json
{
  "sprint": {"name": "SPR-001", "title": "Sprint May 2026", "start_date": "...", "end_date": "...", "progress_pct": 60},
  "columns": {
    "Backlog": [{"id": "...", "title": "...", "points": 5}, ...],
    "Doing":   [...],
    "Review":  [...],
    "Done":    [...]
  }
}
```

Returns `{"sprint": null, "columns": {}}` if user has no active sprint task.
Restricted to `frappe.session.user` (tasks where `assigned_to == user`).

## Architecture

### Repository additions

```
pwa/src/
  api/
    dashboard.ts                    # employee_stats, daily_completions, hours, sprint_kanban
    dashboard.test.ts
    analytics.ts                    # leaderboard, velocity, streak
    analytics.test.ts
  components/
    SummaryCard.tsx                 # icon + value + label tile
    ProgressBar.tsx                 # h-bar + percentage label
    KanbanColumn.tsx                # status column
    KanbanCard.tsx                  # mini task card
    Tabs.tsx                        # generic tab switcher
    LeaderboardTable.tsx
    VelocityChart.tsx               # recharts LineChart wrapper
    StreakChart.tsx                 # recharts BarChart wrapper
    ProjectPicker.tsx               # dropdown over user's projects
  hooks/
    useUserProjects.ts              # fetches distinct projects from my_work
  pages/
    Dashboard.tsx                   # MODIFY router from Placeholder
    Analytics.tsx                   # MODIFY router from Placeholder

vernon_tasks/task/page/my_dashboard/
  my_dashboard.py                   # MODIFY: add get_sprint_kanban
  test_my_dashboard.py              # MODIFY: add kanban tests

vernon_tasks/task/api/
  telemetry.py                      # MODIFY: 4 new events
```

### Backend: `get_sprint_kanban`

```python
@frappe.whitelist()
def get_sprint_kanban() -> dict:
    user = frappe.session.user
    if user == "Guest":
        frappe.throw("Login required", frappe.PermissionError)

    sprint = frappe.db.get_value(
        "VT Sprint",
        {"status": ["in", ["Active", "In Progress", "Started"]]},
        ["name", "title", "start_date", "end_date"],
        as_dict=True,
    )
    if not sprint:
        return {"sprint": None, "columns": {}}

    rows = frappe.get_all(
        "VT Task",
        filters={
            "sprint": sprint["name"],
            "assigned_to": user,
            "kanban_status": ["!=", "Cancelled"],
        },
        fields=["name", "title", "kanban_status", "base_points", "priority", "deadline"],
        order_by="kanban_status asc, deadline asc",
        limit_page_length=200,
    )

    columns: dict = {"Backlog": [], "Doing": [], "Review": [], "Done": []}
    for r in rows:
        col = r.get("kanban_status") or "Backlog"
        if col not in columns:
            columns[col] = []
        columns[col].append({
            "id": r["name"],
            "title": r["title"],
            "points": r.get("base_points") or 0,
            "priority": r.get("priority"),
            "deadline": r.get("deadline"),
        })

    total = sum(len(v) for v in columns.values())
    done_count = len(columns.get("Done", []))
    progress_pct = round(100 * done_count / total) if total else 0

    return {
        "sprint": {**sprint, "progress_pct": progress_pct},
        "columns": columns,
    }
```

### Frontend: `dashboard.ts`

```typescript
import { api } from "./client";

const PAGE = "vernon_tasks.task.page.my_dashboard.my_dashboard";

export interface EmployeeStats {
  total_points: number;
  current_streak_days: number;
  tasks_completed_this_month: number;
}

export interface SprintKanbanColumn {
  Backlog: KanbanItem[];
  Doing: KanbanItem[];
  Review: KanbanItem[];
  Done: KanbanItem[];
}

export interface KanbanItem {
  id: string;
  title: string;
  points: number;
  priority?: string;
  deadline?: string;
}

export interface SprintKanban {
  sprint: {
    name: string;
    title: string;
    start_date: string;
    end_date: string;
    progress_pct: number;
  } | null;
  columns: SprintKanbanColumn;
}

export const fetchEmployeeStats = () =>
  api.get<EmployeeStats>(`/api/method/${PAGE}.get_employee_stats`);

export const fetchSprintKanban = () =>
  api.get<SprintKanban>(`/api/method/${PAGE}.get_sprint_kanban`);

export const fetchDailyCompletions = () =>
  api.get<Array<{ date: string; count: number }>>(
    `/api/method/${PAGE}.get_daily_completions`,
  );
```

### Frontend: `analytics.ts`

```typescript
import { api } from "./client";

const BASE = "/api/method/vernon_tasks.task.api.ic_analytics";

export type Period = "week" | "month" | "quarter";

export interface LeaderboardRow {
  user: string;
  full_name: string;
  total_points: number;
  rank: number;
}

export interface VelocityPoint {
  sprint: string;
  completed_points: number;
  target_points: number;
}

export interface StreakBucket {
  date: string;
  count: number;
}

export const fetchLeaderboard = (period: Period = "month", limit = 10) =>
  api.get<{ leaderboard: LeaderboardRow[] }>(
    `${BASE}.get_leaderboard?period=${period}&limit=${limit}`,
  );

export const fetchVelocity = (project: string, n = 6) =>
  api.get<{ trend: VelocityPoint[] }>(
    `${BASE}.get_personal_velocity?project=${encodeURIComponent(project)}&n=${n}`,
  );

export const fetchStreak = (project: string) =>
  api.get<{ streak: StreakBucket[]; current: number; longest: number }>(
    `${BASE}.get_streak?project=${encodeURIComponent(project)}`,
  );
```

### Dashboard page

```
Vertical scroll:
1. <h1>Dashboard</h1>
2. SummaryCard row (grid 3 cols):
   - Poin: total_points
   - Streak: current_streak_days "hari"
   - Selesai bulan ini: tasks_completed_this_month
3. Sprint section:
   - "Sprint Aktif" header
   - sprint.title
   - ProgressBar progress_pct
   - Date range "start_date — end_date"
4. Kanban section:
   - horizontal scroll container
   - 4 KanbanColumn (Backlog / Doing / Review / Done)
   - each column shows count badge + scrollable card list
5. PullToRefresh wraps everything
```

If no active sprint → EmptyState "Belum ada sprint aktif" (skip sprint+kanban sections).

### Analytics page

```
1. <h1>Analitik</h1>
2. Tabs: [Leaderboard | Velocity | Streak]
3. Tab body switches on click. Each tab manages its own queries.

Leaderboard tab:
  - Period chip row: Minggu / Bulan / Kuartal
  - LeaderboardTable: rank, name, points, top-3 badge (🥇🥈🥉)

Velocity tab:
  - ProjectPicker
  - VelocityChart: line chart, last 6 sprints, completed vs target

Streak tab:
  - ProjectPicker
  - "Streak saat ini: X hari · terpanjang: Y hari"
  - StreakChart: bar chart last 14 days, count per day
```

### ProjectPicker

Reads distinct projects from My Work via `useUserProjects` hook (memoized).

```typescript
// useUserProjects.ts
export function useUserProjects() {
  const q = useQuery({ queryKey: ["my-work"], queryFn: fetchMyWork });
  const set = new Set<string>();
  for (const list of [q.data?.overdue, q.data?.today, q.data?.upcoming]) {
    list?.forEach((t) => t.project && set.add(t.project));
  }
  return { projects: Array.from(set).sort(), isLoading: q.isLoading };
}
```

### Charts wrappers

`VelocityChart`:

```typescript
<ResponsiveContainer width="100%" height={220}>
  <LineChart data={trend}>
    <CartesianGrid stroke="var(--vt-border)" />
    <XAxis dataKey="sprint" stroke="var(--vt-text-muted)" fontSize={12} />
    <YAxis stroke="var(--vt-text-muted)" fontSize={12} />
    <Tooltip contentStyle={{ background: "var(--vt-surface)" }} />
    <Line type="monotone" dataKey="completed_points" stroke="var(--vt-primary)" strokeWidth={2} />
    <Line type="monotone" dataKey="target_points" stroke="var(--vt-text-muted)" strokeDasharray="3 3" />
  </LineChart>
</ResponsiveContainer>
```

`StreakChart` same but `<BarChart>` with `Bar dataKey="count"`.

### Telemetry events

Append to `ALLOWED_EVENTS`:

```
"dashboard_view"
"analytics_view"
"analytics_period_change"
"analytics_project_change"
```

### Caching

- Dashboard data: react-query staleTime 60s + IDB write-through
- Analytics: staleTime 60s, refetchInterval false (manual via tab switch)
- Hooks reuse existing `cacheGet/cachePut` + `stamp` from P0.5 IDB module

### Error handling

| Failure | UX |
|---|---|
| Offline + cached | render + StaleBadge |
| Offline no cache | EmptyState |
| 403 | "Tidak ada akses" |
| Empty data | "Belum ada data" + suggestion |
| Chart all-zero | render axes + dimmed text overlay |
| No projects (new user) | "Mulai kerjakan tugas untuk lihat analitik" |

### Testing

- Vitest: dashboard.ts URLs, analytics.ts URLs, SummaryCard render, ProgressBar percentage clamp, Tabs switching, LeaderboardTable medal logic, useUserProjects dedup
- pytest: get_sprint_kanban returns correct structure + perm gate + null sprint case
- Playwright (gated): open /m/dashboard → SummaryCard "Poin" visible

### Bundle impact

- recharts: +50KB gzipped (lazy-loaded via `React.lazy` on Analytics route)
- New components: ~15KB
- Estimate: 357 KB total (from 292 KB at P1b end)

To soften: lazy-load recharts only when Analytics route mounts.

### Rollout

1. Build + deploy staging
2. Pilot week — same group as P0.5/P1
3. Verify analytics counts match Desk pages (sanity check parity)
4. Watch telemetry: `dashboard_view` rate, `analytics_view` per-tab distribution
5. Company-wide

## Open questions

None.

## References

- Spec P0.5 / P1a / P1b
- Desk pages: `vernon_tasks/task/page/my_dashboard`, `my_analytics`
- recharts 2.x docs

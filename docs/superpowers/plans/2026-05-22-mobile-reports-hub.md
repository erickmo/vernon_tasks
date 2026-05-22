# Mobile Reports Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/m/reports` mobile landing page with 3 role-filtered cards (My Reports, Projects I Manage, My Team) drilling into category-specific reports; replace `/m/analytics` with redirect.

**Architecture:** Hybrid backend reuse — `vernon_tasks/api/portal_reports.py` extended with one new list endpoint + 4 per-project mobile endpoints + 4 team-scope mobile endpoints. Frontend: new `pwa/src/mobile/pages/Reports/` module with React Query, role-filtered landing via `useReportsAccess` hook, drill flow Projects→list→detail. All behind `mobile_reports_enabled` feature flag in VT Settings.

**Tech Stack:** Frappe Framework (Python), React 18 + TypeScript, React Router v6, TanStack Query v5, Vitest + React Testing Library, Frappe unittest.

**Parent spec:** `docs/superpowers/specs/2026-05-22-mobile-reports-hub-design.html`

---

## File Structure

**Backend — create:**
- None

**Backend — modify:**
- `vernon_tasks/api/portal_reports.py` — add 9 endpoints + 2 helpers
- `vernon_tasks/api/test_portal_reports.py` — add test classes
- `vernon_tasks/vernon_tasks/doctype/vt_settings/vt_settings.json` — add `mobile_reports_enabled` field
- `vernon_tasks/fixtures/vt_settings.json` — re-export (if used)

**Frontend — create:**
- `pwa/src/api/reports.ts` — typed API client
- `pwa/src/mobile/pages/Reports/Landing.tsx`
- `pwa/src/mobile/pages/Reports/Landing.test.tsx`
- `pwa/src/mobile/pages/Reports/MyReports.tsx`
- `pwa/src/mobile/pages/Reports/MyReports.test.tsx`
- `pwa/src/mobile/pages/Reports/ProjectsList.tsx`
- `pwa/src/mobile/pages/Reports/ProjectsList.test.tsx`
- `pwa/src/mobile/pages/Reports/ProjectDetail.tsx`
- `pwa/src/mobile/pages/Reports/ProjectDetail.test.tsx`
- `pwa/src/mobile/pages/Reports/TeamReport.tsx`
- `pwa/src/mobile/pages/Reports/TeamReport.test.tsx`
- `pwa/src/mobile/pages/Reports/ReportsFeatureGate.tsx`
- `pwa/src/mobile/pages/Reports/hooks/useManagedProjects.ts`
- `pwa/src/mobile/pages/Reports/hooks/useReportsAccess.ts`

**Frontend — modify:**
- `pwa/src/router.tsx` — add 5 routes, redirect `/m/analytics`
- `pwa/src/components/BottomNav.tsx` — rename tab Analytics→Reports

**Docs — modify:**
- `docs/implementation-tracker.md` — log feature status
- `docs/domains/reports/README.html` — create (new domain)

---

## Task 1: Add `mobile_reports_enabled` feature flag

**Files:**
- Modify: `vernon_tasks/vernon_tasks/doctype/vt_settings/vt_settings.json`
- Modify: `vernon_tasks/fixtures/vt_settings.json` (if exists)

- [ ] **Step 1: Find current VT Settings field for `portal_reports_enabled`**

Run: `grep -n "portal_reports_enabled" vernon_tasks/vernon_tasks/doctype/vt_settings/vt_settings.json`

Expected: matches the existing Check field block.

- [ ] **Step 2: Add `mobile_reports_enabled` field directly after `portal_reports_enabled`**

In `fields` array, add:

```json
{
  "fieldname": "mobile_reports_enabled",
  "fieldtype": "Check",
  "label": "Enable Mobile Reports",
  "default": "0",
  "description": "Toggles the /m/reports mobile hub."
}
```

- [ ] **Step 3: Re-export fixtures (if `vernon_tasks/fixtures/vt_settings.json` exists)**

Run: `bench --site task.localhost export-fixtures --app vernon_tasks`

Expected: fixture file regenerated with new field default `0`.

- [ ] **Step 4: Commit**

```bash
git add vernon_tasks/vernon_tasks/doctype/vt_settings/vt_settings.json vernon_tasks/fixtures/vt_settings.json
git commit -m "feat(settings): tambah flag mobile_reports_enabled di VT Settings"
```

---

## Task 2: Backend — `list_managed_projects` endpoint

**Files:**
- Modify: `vernon_tasks/api/portal_reports.py` (append)
- Modify: `vernon_tasks/api/test_portal_reports.py` (append test class)

- [ ] **Step 1: Write failing test**

Append to `vernon_tasks/api/test_portal_reports.py`:

```python
class TestListManagedProjects(VTPortalReportsTestBase):
    """Mobile endpoint: list of projects the current user manages, with KPI snippet."""

    def setUp(self):
        super().setUp()
        frappe.db.set_single_value("VT Settings", "mobile_reports_enabled", 1)

    def test_member_role_returns_403(self):
        frappe.set_user(self.member_user)
        with self.assertRaises(frappe.PermissionError):
            mobile_reports.list_managed_projects()

    def test_leader_returns_own_projects_with_kpi_snippet(self):
        frappe.set_user(self.leader_user)
        result = mobile_reports.list_managed_projects()
        self.assertIsInstance(result, dict)
        self.assertIn("projects", result)
        for row in result["projects"]:
            self.assertIn("name", row)
            self.assertIn("project_title", row)
            self.assertIn("status", row)
            self.assertIn("avg_velocity", row)
            self.assertIn("risk_count", row)
            self.assertIn("member_count", row)

    def test_flag_off_throws(self):
        frappe.db.set_single_value("VT Settings", "mobile_reports_enabled", 0)
        frappe.set_user(self.leader_user)
        with self.assertRaises(frappe.PermissionError):
            mobile_reports.list_managed_projects()
```

Top of test file, ensure import:

```python
from vernon_tasks.api import portal_reports as mobile_reports
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bench --site task.localhost run-tests --app vernon_tasks --module vernon_tasks.api.test_portal_reports --test TestListManagedProjects -v`

Expected: FAIL — `AttributeError: module 'vernon_tasks.api.portal_reports' has no attribute 'list_managed_projects'`.

- [ ] **Step 3: Add mobile feature-flag guard helper**

Append to `vernon_tasks/api/portal_reports.py` (near `_check_flag`):

```python
def _check_mobile_flag():
    """Throws unless VT Settings.mobile_reports_enabled = 1."""
    enabled = frappe.db.get_single_value("VT Settings", "mobile_reports_enabled")
    if not int(enabled or 0):
        frappe.throw("Mobile Reports is not enabled", frappe.PermissionError)
```

- [ ] **Step 4: Add `list_managed_projects` endpoint**

Append to `vernon_tasks/api/portal_reports.py`:

```python
# ── Mobile Reports endpoints (Leader/Manager only) ───────────────────────────
@frappe.whitelist()
def list_managed_projects():
    """Projects the current user manages, with per-project KPI snippet.

    Returns: {"projects": [{name, project_title, status, avg_velocity,
                            risk_count, member_count}, ...]}
    Permission: Leader+. Cached 5 min per user.
    """
    _check_mobile_flag()
    _require_leader()
    user = frappe.session.user
    key = f"pr:mobile:managed:{user}"

    def _build():
        projects = _visible_projects()
        out = []
        for p in projects:
            sprints = _vel_trend(p["name"], 6)
            vels = [s.get("velocity", 0.0) for s in sprints]
            avg = round(sum(vels) / len(vels), 1) if vels else 0.0
            risk_data = _evaluate_risks(p["name"]) or {}
            risk_count = len(risk_data.get("risks", []) or [])
            members = frappe.get_all(
                "VT Project Member",
                filters={"parent": p["name"]},
                pluck="user",
            )
            out.append({
                "name": p["name"],
                "project_title": p.get("project_title", p["name"]),
                "status": p.get("status", "Active"),
                "avg_velocity": avg,
                "risk_count": risk_count,
                "member_count": len(members),
            })
        return {"projects": out}

    return _cache(key, _build)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bench --site task.localhost run-tests --app vernon_tasks --module vernon_tasks.api.test_portal_reports --test TestListManagedProjects -v`

Expected: 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add vernon_tasks/api/portal_reports.py vernon_tasks/api/test_portal_reports.py
git commit -m "feat(reports): endpoint list_managed_projects untuk mobile hub"
```

---

## Task 3: Backend — per-project mobile endpoints

**Files:**
- Modify: `vernon_tasks/api/portal_reports.py`
- Modify: `vernon_tasks/api/test_portal_reports.py`

- [ ] **Step 1: Write failing tests**

Append:

```python
class TestMobileProjectEndpoints(VTPortalReportsTestBase):
    """Mobile per-project endpoints: velocity, forecast, risks, OKR."""

    def setUp(self):
        super().setUp()
        frappe.db.set_single_value("VT Settings", "mobile_reports_enabled", 1)
        frappe.set_user(self.leader_user)

    def test_velocity_returns_sprint_series(self):
        out = mobile_reports.get_mobile_project_velocity(self.project_name, 6)
        self.assertIn("sprints", out)
        self.assertIn("avg_velocity", out)
        self.assertIn("trend", out)

    def test_forecast_returns_target_projected_gap(self):
        out = mobile_reports.get_mobile_project_forecast(self.project_name)
        self.assertIsInstance(out, dict)

    def test_risks_returns_risk_list(self):
        out = mobile_reports.get_mobile_project_risks(self.project_name)
        self.assertIn("risks", out)

    def test_okr_returns_rollup(self):
        out = mobile_reports.get_mobile_project_okr(self.project_name)
        self.assertIsInstance(out, dict)

    def test_unmanaged_project_rejected(self):
        with self.assertRaises(frappe.PermissionError):
            mobile_reports.get_mobile_project_velocity("VTP-NOT-MINE", 6)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bench --site task.localhost run-tests --app vernon_tasks --module vernon_tasks.api.test_portal_reports --test TestMobileProjectEndpoints -v`

Expected: FAIL — endpoints don't exist.

- [ ] **Step 3: Add ownership guard + endpoints**

Append to `portal_reports.py`:

```python
def _require_owns_project(project: str):
    """Throws unless current user has project in _visible_projects()."""
    if not any(p["name"] == project for p in _visible_projects()):
        frappe.throw("Not authorized for this project", frappe.PermissionError)


@frappe.whitelist()
def get_mobile_project_velocity(project: str, n: int = 6):
    """Velocity trend for a single managed project."""
    _check_mobile_flag()
    _require_leader()
    _require_owns_project(project)
    n = clamp_int(n, 1, 24, "n")
    user = frappe.session.user
    key = f"pr:mobile:vel:{project}:{n}:{user}"

    def _build():
        sprints = _vel_trend(project, n)
        vels = [s.get("velocity", 0.0) for s in sprints]
        avg = round(sum(vels) / len(vels), 1) if vels else 0.0
        return {
            "project": project,
            "sprints": sprints,
            "avg_velocity": avg,
            "trend": _compute_trend(vels),
        }

    return _cache(key, _build)


@frappe.whitelist()
def get_mobile_project_forecast(project: str):
    """Forecast for a single managed project."""
    _check_mobile_flag()
    _require_leader()
    _require_owns_project(project)
    user = frappe.session.user
    key = f"pr:mobile:forecast:{project}:{user}"
    return _cache(key, lambda: _forecast(project) or {})


@frappe.whitelist()
def get_mobile_project_risks(project: str):
    """Risks for a single managed project. Not cached (changes per task move)."""
    _check_mobile_flag()
    _require_leader()
    _require_owns_project(project)
    return _evaluate_risks(project) or {"risks": []}


@frappe.whitelist()
def get_mobile_project_okr(project: str, period=None):
    """OKR rollup for a single managed project."""
    _check_mobile_flag()
    _require_leader()
    _require_owns_project(project)
    period_key = period or "current"
    user = frappe.session.user
    key = f"pr:mobile:okr:{project}:{period_key}:{user}"
    return _cache(key, lambda: _okr(period, project=project))
```

Note: if `_okr` does not accept `project=` kwarg, drop the kwarg and let the service filter — verify by reading `vernon_tasks/task/services/okr_rollup_service.py` signature before this step.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bench --site task.localhost run-tests --app vernon_tasks --module vernon_tasks.api.test_portal_reports --test TestMobileProjectEndpoints -v`

Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add vernon_tasks/api/portal_reports.py vernon_tasks/api/test_portal_reports.py
git commit -m "feat(reports): endpoint per-project mobile (velocity, forecast, risks, OKR)"
```

---

## Task 4: Backend — team-scope mobile endpoints

**Files:**
- Modify: `vernon_tasks/api/portal_reports.py`
- Modify: `vernon_tasks/api/test_portal_reports.py`

- [ ] **Step 1: Write failing tests**

Append:

```python
class TestMobileTeamEndpoints(VTPortalReportsTestBase):
    """Mobile team endpoints: leaderboard, overdue, workload, completion."""

    def setUp(self):
        super().setUp()
        frappe.db.set_single_value("VT Settings", "mobile_reports_enabled", 1)
        frappe.set_user(self.leader_user)

    def test_team_leaderboard_returns_rows(self):
        out = mobile_reports.get_mobile_team_leaderboard("month", 10)
        self.assertIn("rows", out)
        self.assertIsInstance(out["rows"], list)

    def test_team_overdue_returns_count(self):
        out = mobile_reports.get_mobile_team_overdue()
        self.assertIn("total", out)
        self.assertIn("items", out)

    def test_team_workload_returns_per_member(self):
        out = mobile_reports.get_mobile_team_workload()
        self.assertIn("members", out)

    def test_team_completion_returns_percentage(self):
        out = mobile_reports.get_mobile_team_completion("month")
        self.assertIn("completion_pct", out)
        self.assertIn("done", out)
        self.assertIn("total", out)

    def test_member_role_blocked(self):
        frappe.set_user(self.member_user)
        with self.assertRaises(frappe.PermissionError):
            mobile_reports.get_mobile_team_leaderboard("month", 10)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bench --site task.localhost run-tests --app vernon_tasks --module vernon_tasks.api.test_portal_reports --test TestMobileTeamEndpoints -v`

Expected: 5 tests FAIL — endpoints don't exist.

- [ ] **Step 3: Add `_team_projects` helper + endpoints**

Append to `portal_reports.py`:

```python
def _team_projects(user: str) -> list:
    """Project names where `user` is leader/manager. Union basis for 'my team'."""
    return [p["name"] for p in _visible_projects()]


@frappe.whitelist()
def get_mobile_team_leaderboard(period: str = "month", limit: int = 10):
    """Leaderboard scoped to the union of members across the user's managed projects."""
    _check_mobile_flag()
    _require_leader()
    limit = clamp_int(limit, 1, 50, "limit")
    user = frappe.session.user
    projects = _team_projects(user)
    key = f"pr:mobile:lb:{period}:{limit}:{user}"

    def _build():
        rows = _lb(period, limit, project_filter=projects) if projects else []
        return {"rows": rows, "period": period}

    return _cache(key, _build)


@frappe.whitelist()
def get_mobile_team_overdue():
    """Overdue tasks across the user's managed projects. Not cached."""
    _check_mobile_flag()
    _require_leader()
    user = frappe.session.user
    projects = _team_projects(user)
    if not projects:
        return {"total": 0, "items": []}
    items = frappe.get_all(
        "VT Task",
        filters={
            "project": ["in", projects],
            "status": ["!=", "Done"],
            "due_date": ["<", frappe.utils.today()],
        },
        fields=["name", "subject", "assignee", "due_date", "project"],
        limit=50,
    )
    return {"total": len(items), "items": items}


@frappe.whitelist()
def get_mobile_team_workload():
    """Open task count per member across managed projects."""
    _check_mobile_flag()
    _require_leader()
    user = frappe.session.user
    projects = _team_projects(user)
    key = f"pr:mobile:workload:{user}"

    def _build():
        if not projects:
            return {"members": []}
        rows = frappe.db.sql(
            """
            SELECT assignee AS user, COUNT(*) AS open_tasks
            FROM `tabVT Task`
            WHERE project IN %(projects)s
              AND status != 'Done'
              AND assignee IS NOT NULL
            GROUP BY assignee
            ORDER BY open_tasks DESC
            """,
            {"projects": tuple(projects)},
            as_dict=True,
        )
        return {"members": rows}

    return _cache(key, _build)


@frappe.whitelist()
def get_mobile_team_completion(period: str = "month"):
    """Completion percentage across managed projects for the period."""
    _check_mobile_flag()
    _require_leader()
    user = frappe.session.user
    projects = _team_projects(user)
    key = f"pr:mobile:completion:{period}:{user}"

    def _build():
        if not projects:
            return {"completion_pct": 0.0, "done": 0, "total": 0}
        cutoff = _period_cutoff(period)
        total = frappe.db.count("VT Task", {"project": ["in", projects], "creation": [">=", cutoff]})
        done = frappe.db.count(
            "VT Task",
            {"project": ["in", projects], "status": "Done", "modified": [">=", cutoff]},
        )
        pct = round((done / total * 100), 1) if total else 0.0
        return {"completion_pct": pct, "done": done, "total": total}

    return _cache(key, _build)


def _period_cutoff(period: str) -> str:
    """Maps 'week'|'month'|'quarter' → ISO date string."""
    from datetime import timedelta
    from frappe.utils import nowdate, add_days
    days_map = {"week": 7, "month": 30, "quarter": 90}
    days = days_map.get(period, 30)
    return add_days(nowdate(), -days)
```

Note: if `_lb` (leaderboard_service.get_leaderboard) does not accept `project_filter=` kwarg, add the kwarg to the service (read `vernon_tasks/task/services/leaderboard_service.py` first; if absent, modify signature to accept and filter).

- [ ] **Step 4: Run tests to verify they pass**

Run: `bench --site task.localhost run-tests --app vernon_tasks --module vernon_tasks.api.test_portal_reports --test TestMobileTeamEndpoints -v`

Expected: 5 tests PASS.

- [ ] **Step 5: Run full backend test module**

Run: `bench --site task.localhost run-tests --app vernon_tasks --module vernon_tasks.api.test_portal_reports -v`

Expected: all existing + new tests PASS.

- [ ] **Step 6: Commit**

```bash
git add vernon_tasks/api/portal_reports.py vernon_tasks/api/test_portal_reports.py
git commit -m "feat(reports): endpoint team mobile (leaderboard, overdue, workload, completion)"
```

---

## Task 5: Frontend — API client `pwa/src/api/reports.ts`

**Files:**
- Create: `pwa/src/api/reports.ts`

- [ ] **Step 1: Create the API client**

Write `pwa/src/api/reports.ts`:

```ts
import { request } from "./client";

// ── Types ────────────────────────────────────────────────────────────────────
export interface ManagedProject {
  name: string;
  project_title: string;
  status: string;
  avg_velocity: number;
  risk_count: number;
  member_count: number;
}

export interface SprintVelocity {
  sprint: string;
  velocity: number;
}

export interface ProjectVelocity {
  project: string;
  sprints: SprintVelocity[];
  avg_velocity: number;
  trend: "up" | "down" | "flat";
}

export interface ProjectForecast {
  project?: string;
  target?: number;
  projected?: number;
  gap?: number;
}

export interface ProjectRiskItem {
  flag: string;
  message: string;
  severity: "low" | "med" | "high";
}

export interface ProjectRisks {
  risks: ProjectRiskItem[];
}

export interface OkrRollup {
  objectives?: Array<{ name: string; progress: number; status: string }>;
}

export interface TeamLeaderboardRow {
  user: string;
  full_name?: string;
  score: number;
}

export interface OverdueItem {
  name: string;
  subject: string;
  assignee: string;
  due_date: string;
  project: string;
}

export interface WorkloadMember {
  user: string;
  open_tasks: number;
}

export type Period = "week" | "month" | "quarter";

// ── Endpoints ────────────────────────────────────────────────────────────────
const BASE = "vernon_tasks.api.portal_reports";

export const reportsApi = {
  listManagedProjects(): Promise<{ projects: ManagedProject[] }> {
    return request(`${BASE}.list_managed_projects`, {});
  },
  projectVelocity(project: string, n = 6): Promise<ProjectVelocity> {
    return request(`${BASE}.get_mobile_project_velocity`, { project, n });
  },
  projectForecast(project: string): Promise<ProjectForecast> {
    return request(`${BASE}.get_mobile_project_forecast`, { project });
  },
  projectRisks(project: string): Promise<ProjectRisks> {
    return request(`${BASE}.get_mobile_project_risks`, { project });
  },
  projectOkr(project: string, period?: Period): Promise<OkrRollup> {
    return request(`${BASE}.get_mobile_project_okr`, { project, period });
  },
  teamLeaderboard(period: Period = "month", limit = 10): Promise<{ rows: TeamLeaderboardRow[]; period: Period }> {
    return request(`${BASE}.get_mobile_team_leaderboard`, { period, limit });
  },
  teamOverdue(): Promise<{ total: number; items: OverdueItem[] }> {
    return request(`${BASE}.get_mobile_team_overdue`, {});
  },
  teamWorkload(): Promise<{ members: WorkloadMember[] }> {
    return request(`${BASE}.get_mobile_team_workload`, {});
  },
  teamCompletion(period: Period = "month"): Promise<{ completion_pct: number; done: number; total: number }> {
    return request(`${BASE}.get_mobile_team_completion`, { period });
  },
};
```

Note: confirm `request()` signature in `pwa/src/api/client.ts`. If it takes `(method, params)` vs `(method, { params })`, adjust accordingly. Read the file before this step.

- [ ] **Step 2: TypeScript check**

Run: `cd pwa && pnpm tsc --noEmit`

Expected: no errors in `reports.ts`.

- [ ] **Step 3: Commit**

```bash
git add pwa/src/api/reports.ts
git commit -m "feat(pwa): API client untuk mobile reports endpoints"
```

---

## Task 6: Frontend — hooks (`useManagedProjects`, `useReportsAccess`)

**Files:**
- Create: `pwa/src/mobile/pages/Reports/hooks/useManagedProjects.ts`
- Create: `pwa/src/mobile/pages/Reports/hooks/useReportsAccess.ts`

- [ ] **Step 1: Create `useManagedProjects` hook**

```ts
import { useQuery } from "@tanstack/react-query";
import { reportsApi, ManagedProject } from "../../../../api/reports";

export interface UseManagedProjectsResult {
  projects: ManagedProject[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/** Fetches projects the current user manages with KPI snippet. 60s stale. */
export function useManagedProjects(): UseManagedProjectsResult {
  const q = useQuery({
    queryKey: ["reports", "managed-projects"],
    queryFn: () => reportsApi.listManagedProjects().then((r) => r.projects),
    staleTime: 60_000,
  });
  return {
    projects: q.data ?? [],
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
  };
}
```

- [ ] **Step 2: Create `useReportsAccess` hook**

```ts
import { useManagedProjects } from "./useManagedProjects";

export interface ReportsAccess {
  canMyReports: boolean;
  canProjects: boolean;
  canTeam: boolean;
  isLoading: boolean;
}

/** Derives card visibility on /m/reports landing from role + managed projects.
 *  - canMyReports: always true (every user has personal performance).
 *  - canProjects:  true iff user manages ≥1 project (Leader+).
 *  - canTeam:      true iff user manages ≥1 project (team = union of members).
 */
export function useReportsAccess(): ReportsAccess {
  const { projects, isLoading } = useManagedProjects();
  const hasProjects = projects.length > 0;
  return {
    canMyReports: true,
    canProjects: hasProjects,
    canTeam: hasProjects,
    isLoading,
  };
}
```

- [ ] **Step 3: TypeScript check**

Run: `cd pwa && pnpm tsc --noEmit`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add pwa/src/mobile/pages/Reports/hooks/
git commit -m "feat(pwa): hook useManagedProjects + useReportsAccess"
```

---

## Task 7: Frontend — `ReportsFeatureGate`

**Files:**
- Create: `pwa/src/mobile/pages/Reports/ReportsFeatureGate.tsx`

- [ ] **Step 1: Create feature gate component**

```tsx
import { ReactNode } from "react";
import { ComingSoon } from "../../../components/ComingSoon";

interface Props {
  children: ReactNode;
}

/** Renders children when window.frappe.boot.mobile_reports_enabled = 1, else ComingSoon. */
export function ReportsFeatureGate({ children }: Props) {
  const enabled = Number(
    (window as any).frappe?.boot?.mobile_reports_enabled ?? 0,
  );
  if (!enabled) {
    return <ComingSoon title="Reports" message="Mobile Reports belum aktif." />;
  }
  return <>{children}</>;
}
```

Note: if `ComingSoon` component does not exist at that path, search with `grep -rn "ComingSoon" pwa/src` and use the matching path. If absent entirely, render an inline placeholder div with the same message.

If `frappe.boot.mobile_reports_enabled` is not yet exposed via `boot_session`, also add it server-side: open `vernon_tasks/hooks.py`, locate `boot_session` (or add `extend_bootinfo`) and append `bootinfo.mobile_reports_enabled = frappe.db.get_single_value("VT Settings", "mobile_reports_enabled")`. Confirm via `bench --site task.localhost console` → `frappe.sessions.get_bootinfo().get('mobile_reports_enabled')`.

- [ ] **Step 2: Commit**

```bash
git add pwa/src/mobile/pages/Reports/ReportsFeatureGate.tsx vernon_tasks/hooks.py
git commit -m "feat(pwa): ReportsFeatureGate + expose flag via bootinfo"
```

---

## Task 8: Frontend — `Landing.tsx` (cards)

**Files:**
- Create: `pwa/src/mobile/pages/Reports/Landing.tsx`
- Create: `pwa/src/mobile/pages/Reports/Landing.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Landing } from "./Landing";

vi.mock("./hooks/useReportsAccess", () => ({
  useReportsAccess: vi.fn(),
}));
import { useReportsAccess } from "./hooks/useReportsAccess";

function renderWithRouter() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Landing", () => {
  it("member (no managed projects) sees only My Reports card", () => {
    (useReportsAccess as any).mockReturnValue({
      canMyReports: true, canProjects: false, canTeam: false, isLoading: false,
    });
    renderWithRouter();
    expect(screen.getByText(/My Reports/i)).toBeInTheDocument();
    expect(screen.queryByText(/Projects I Manage/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/My Team/i)).not.toBeInTheDocument();
  });

  it("leader with projects sees all 3 cards", () => {
    (useReportsAccess as any).mockReturnValue({
      canMyReports: true, canProjects: true, canTeam: true, isLoading: false,
    });
    renderWithRouter();
    expect(screen.getByText(/My Reports/i)).toBeInTheDocument();
    expect(screen.getByText(/Projects I Manage/i)).toBeInTheDocument();
    expect(screen.getByText(/My Team/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pwa && pnpm vitest run src/mobile/pages/Reports/Landing.test.tsx`

Expected: FAIL — `Landing` module does not exist.

- [ ] **Step 3: Implement `Landing.tsx`**

```tsx
import { Link } from "react-router-dom";
import { useReportsAccess } from "./hooks/useReportsAccess";
import { logEvent } from "../../../telemetry";

interface CardSpec {
  to: string;
  icon: string;
  title: string;
  sub: string;
  visible: boolean;
  eventKey: string;
}

export function Landing() {
  const access = useReportsAccess();

  const cards: CardSpec[] = [
    {
      to: "/m/reports/me",
      icon: "👤",
      title: "My Reports",
      sub: "Velocity, streak, ranking pribadi",
      visible: access.canMyReports,
      eventKey: "me",
    },
    {
      to: "/m/reports/projects",
      icon: "📁",
      title: "Projects I Manage",
      sub: "Velocity, forecast, risk per proyek",
      visible: access.canProjects,
      eventKey: "projects",
    },
    {
      to: "/m/reports/team",
      icon: "👥",
      title: "My Team",
      sub: "Leaderboard, workload, overdue",
      visible: access.canTeam,
      eventKey: "team",
    },
  ];

  return (
    <div style={{ background: "var(--vt-primary-light)", flex: 1, display: "flex", flexDirection: "column" }}>
      <header
        style={{
          background: "var(--vt-primary-light)",
          padding: "var(--vt-space-4)",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <h1 style={{ margin: 0, color: "var(--vt-primary-dark)", fontSize: 15, fontWeight: 600 }}>
          Reports
        </h1>
      </header>
      <div style={{ padding: "var(--vt-space-4)" }}>
        {cards.filter((c) => c.visible).map((c) => (
          <Link
            key={c.to}
            to={c.to}
            onClick={() => logEvent("reports_card_tap", { card: c.eventKey })}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: 16,
              marginBottom: 10,
              background: "white",
              borderRadius: 12,
              boxShadow: "0 1px 6px rgba(149,97,171,0.12)",
              textDecoration: "none",
              color: "var(--vt-text)",
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: "var(--vt-primary-light)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
              }}
            >
              {c.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{c.title}</div>
              <div style={{ fontSize: 12, color: "var(--vt-text-muted)" }}>{c.sub}</div>
            </div>
            <div style={{ color: "var(--vt-text-muted)" }}>›</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

Add view telemetry via `useEffect` if `useEffect` pattern is used elsewhere (model after `NotificationsPage`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pwa && pnpm vitest run src/mobile/pages/Reports/Landing.test.tsx`

Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add pwa/src/mobile/pages/Reports/Landing.tsx pwa/src/mobile/pages/Reports/Landing.test.tsx
git commit -m "feat(pwa): Reports landing page (role-filtered cards)"
```

---

## Task 9: Frontend — `MyReports.tsx` (wraps existing Analytics)

**Files:**
- Create: `pwa/src/mobile/pages/Reports/MyReports.tsx`
- Create: `pwa/src/mobile/pages/Reports/MyReports.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MyReports } from "./MyReports";

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/m/reports/me"]}>
        <MyReports />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("MyReports", () => {
  it("renders header + tabs", () => {
    renderPage();
    expect(screen.getByText(/My Reports/i)).toBeInTheDocument();
    expect(screen.getByText(/Leaderboard/i)).toBeInTheDocument();
    expect(screen.getByText(/Velocity/i)).toBeInTheDocument();
    expect(screen.getByText(/Streak/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pwa && pnpm vitest run src/mobile/pages/Reports/MyReports.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement by extracting body from existing Analytics**

Read `pwa/src/mobile/pages/Analytics.tsx`. Copy its `AnalyticsPage` JSX into a new `MyReports` component, replacing the header title `{t("nav.analytics")}` with `"My Reports"` and adding a back arrow.

```tsx
import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Tabs } from "../../../components/Tabs";
import { LeaderboardTab, VelocityTab, StreakTab } from "../Analytics"; // export these from Analytics.tsx
import { logEvent } from "../../../telemetry";

type TabKey = "leaderboard" | "velocity" | "streak";
const TABS = [
  { key: "leaderboard", label: "Leaderboard" },
  { key: "velocity", label: "Velocity" },
  { key: "streak", label: "Streak" },
];
const VALID_TABS: TabKey[] = ["leaderboard", "velocity", "streak"];

export function MyReports() {
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const rawTab = params.get("tab") as TabKey;
  const tab = VALID_TABS.includes(rawTab) ? rawTab : "leaderboard";

  useEffect(() => {
    logEvent("reports_my_view", { tab });
  }, [tab]);

  return (
    <div style={{ background: "var(--vt-primary-light)", flex: 1, display: "flex", flexDirection: "column" }}>
      <header
        style={{
          background: "var(--vt-primary-light)",
          padding: "var(--vt-space-4)",
          position: "sticky",
          top: 0,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <button
          onClick={() => nav("/m/reports")}
          aria-label="Back"
          style={{ background: "transparent", border: "none", fontSize: 18, cursor: "pointer", color: "var(--vt-primary-dark)" }}
        >
          ‹
        </button>
        <h1 style={{ margin: 0, color: "var(--vt-primary-dark)", fontSize: 15, fontWeight: 600 }}>
          My Reports
        </h1>
      </header>
      <div
        style={{
          position: "sticky",
          top: 56,
          background: "white",
          zIndex: 9,
          borderBottom: "1px solid var(--vt-border)",
          padding: "0 var(--vt-space-4)",
        }}
      >
        <Tabs tabs={TABS} active={tab} onChange={(k) => setParams({ tab: k }, { replace: true })} />
      </div>
      <div style={{ padding: "var(--vt-space-4)" }}>
        {tab === "leaderboard" && <LeaderboardTab />}
        {tab === "velocity" && <VelocityTab />}
        {tab === "streak" && <StreakTab />}
      </div>
    </div>
  );
}
```

In `pwa/src/mobile/pages/Analytics.tsx`, add `export` keyword to `LeaderboardTab`, `VelocityTab`, `StreakTab` functions so MyReports can import them. Do **not** delete `AnalyticsPage` yet — it stays for one sprint as a fallback (route already redirected).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pwa && pnpm vitest run src/mobile/pages/Reports/MyReports.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pwa/src/mobile/pages/Reports/MyReports.tsx pwa/src/mobile/pages/Reports/MyReports.test.tsx pwa/src/mobile/pages/Analytics.tsx
git commit -m "feat(pwa): MyReports page (membungkus Analytics tabs)"
```

---

## Task 10: Frontend — `ProjectsList.tsx`

**Files:**
- Create: `pwa/src/mobile/pages/Reports/ProjectsList.tsx`
- Create: `pwa/src/mobile/pages/Reports/ProjectsList.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProjectsList } from "./ProjectsList";

vi.mock("./hooks/useManagedProjects", () => ({
  useManagedProjects: vi.fn(),
}));
import { useManagedProjects } from "./hooks/useManagedProjects";

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ProjectsList />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ProjectsList", () => {
  it("renders empty state when no projects", () => {
    (useManagedProjects as any).mockReturnValue({ projects: [], isLoading: false, isError: false, refetch: vi.fn() });
    renderPage();
    expect(screen.getByText(/No projects/i)).toBeInTheDocument();
  });

  it("renders one card per project with KPI chips", () => {
    (useManagedProjects as any).mockReturnValue({
      projects: [{ name: "VTP-1", project_title: "Alpha", status: "Active", avg_velocity: 8.2, risk_count: 1, member_count: 5 }],
      isLoading: false, isError: false, refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByText(/Alpha/i)).toBeInTheDocument();
    expect(screen.getByText(/8\.2/)).toBeInTheDocument();
    expect(screen.getByText(/1 risk/i)).toBeInTheDocument();
    expect(screen.getByText(/5 members/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pwa && pnpm vitest run src/mobile/pages/Reports/ProjectsList.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement `ProjectsList.tsx`**

```tsx
import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useManagedProjects } from "./hooks/useManagedProjects";
import { Skeleton } from "../../../components/Skeleton";
import { EmptyState } from "../../../components/EmptyState";
import { logEvent } from "../../../telemetry";

export function ProjectsList() {
  const { projects, isLoading, isError, refetch } = useManagedProjects();
  const nav = useNavigate();

  useEffect(() => {
    logEvent("reports_projects_view", {});
  }, []);

  return (
    <div style={{ background: "var(--vt-primary-light)", flex: 1, display: "flex", flexDirection: "column" }}>
      <header
        style={{
          background: "var(--vt-primary-light)",
          padding: "var(--vt-space-4)",
          position: "sticky",
          top: 0,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <button onClick={() => nav("/m/reports")} aria-label="Back" style={{ background: "transparent", border: "none", fontSize: 18, cursor: "pointer", color: "var(--vt-primary-dark)" }}>‹</button>
        <h1 style={{ margin: 0, color: "var(--vt-primary-dark)", fontSize: 15, fontWeight: 600 }}>Projects I Manage</h1>
      </header>
      <div style={{ padding: "var(--vt-space-4)" }}>
        {isLoading && <Skeleton height={64} />}
        {isError && <EmptyState title="Gagal memuat" cta={{ label: "Coba lagi", onClick: () => refetch() }} />}
        {!isLoading && projects.length === 0 && <EmptyState title="No projects to report on." />}
        {projects.map((p) => (
          <Link
            key={p.name}
            to={`/m/reports/projects/${encodeURIComponent(p.name)}`}
            style={{
              display: "block",
              padding: 16,
              marginBottom: 10,
              background: "white",
              borderRadius: 12,
              boxShadow: "0 1px 6px rgba(149,97,171,0.12)",
              textDecoration: "none",
              color: "var(--vt-text)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{p.project_title}</div>
              <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 999, background: "var(--vt-primary-light)", color: "var(--vt-primary-dark)" }}>{p.status}</span>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <Chip>{p.avg_velocity.toFixed(1)} vel</Chip>
              <Chip>{p.risk_count} risk{p.risk_count === 1 ? "" : "s"}</Chip>
              <Chip>{p.member_count} member{p.member_count === 1 ? "" : "s"}</Chip>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 999, background: "#f5f0fa", color: "var(--vt-primary-dark)", fontWeight: 600 }}>
      {children}
    </span>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pwa && pnpm vitest run src/mobile/pages/Reports/ProjectsList.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pwa/src/mobile/pages/Reports/ProjectsList.tsx pwa/src/mobile/pages/Reports/ProjectsList.test.tsx
git commit -m "feat(pwa): ProjectsList page (cards + KPI chips)"
```

---

## Task 11: Frontend — `ProjectDetail.tsx`

**Files:**
- Create: `pwa/src/mobile/pages/Reports/ProjectDetail.tsx`
- Create: `pwa/src/mobile/pages/Reports/ProjectDetail.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProjectDetail } from "./ProjectDetail";

vi.mock("../../../api/reports", () => ({
  reportsApi: {
    projectVelocity: vi.fn().mockResolvedValue({ project: "VTP-1", sprints: [], avg_velocity: 7.5, trend: "up" }),
    projectForecast: vi.fn().mockResolvedValue({ target: 100, projected: 90, gap: 10 }),
    projectRisks: vi.fn().mockResolvedValue({ risks: [] }),
    projectOkr: vi.fn().mockResolvedValue({ objectives: [] }),
  },
}));

function renderPage(initialPath = "/m/reports/projects/VTP-1") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/m/reports/projects/:id" element={<ProjectDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ProjectDetail", () => {
  it("renders 4 sections after data loads", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/Velocity/i)).toBeInTheDocument());
    expect(screen.getByText(/Forecast/i)).toBeInTheDocument();
    expect(screen.getByText(/Risks/i)).toBeInTheDocument();
    expect(screen.getByText(/OKR/i)).toBeInTheDocument();
  });

  it("period chip change updates URL", async () => {
    renderPage("/m/reports/projects/VTP-1?period=month");
    fireEvent.click(screen.getByRole("button", { name: /Kuartal/i }));
    await waitFor(() => expect(window.location.search).toContain("period=quarter"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pwa && pnpm vitest run src/mobile/pages/Reports/ProjectDetail.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement `ProjectDetail.tsx`**

```tsx
import { useEffect } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { reportsApi, Period } from "../../../api/reports";
import { VelocityChart } from "../../../components/VelocityChart";
import { Skeleton } from "../../../components/Skeleton";
import { EmptyState } from "../../../components/EmptyState";
import { logEvent } from "../../../telemetry";

const PERIODS: { key: Period; label: string }[] = [
  { key: "week", label: "Minggu" },
  { key: "month", label: "Bulan" },
  { key: "quarter", label: "Kuartal" },
];
const VALID_PERIODS: Period[] = ["week", "month", "quarter"];

export function ProjectDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const project = decodeURIComponent(id);
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const rawPeriod = params.get("period") as Period;
  const period: Period = VALID_PERIODS.includes(rawPeriod) ? rawPeriod : "month";

  const velocityQ = useQuery({
    queryKey: ["reports", "project", project, "velocity", period],
    queryFn: () => reportsApi.projectVelocity(project, 6),
    staleTime: 60_000,
  });
  const forecastQ = useQuery({
    queryKey: ["reports", "project", project, "forecast"],
    queryFn: () => reportsApi.projectForecast(project),
    staleTime: 60_000,
  });
  const risksQ = useQuery({
    queryKey: ["reports", "project", project, "risks"],
    queryFn: () => reportsApi.projectRisks(project),
    staleTime: 60_000,
  });
  const okrQ = useQuery({
    queryKey: ["reports", "project", project, "okr", period],
    queryFn: () => reportsApi.projectOkr(project, period),
    staleTime: 60_000,
  });

  useEffect(() => {
    logEvent("reports_project_view", { project });
  }, [project]);

  function setPeriod(p: Period) {
    setParams({ period: p }, { replace: true });
    logEvent("reports_period_change", { scope: "project", period: p });
  }

  return (
    <div style={{ background: "var(--vt-primary-light)", flex: 1, display: "flex", flexDirection: "column" }}>
      <header style={{ background: "var(--vt-primary-light)", padding: "var(--vt-space-4)", position: "sticky", top: 0, zIndex: 10, display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => nav("/m/reports/projects")} aria-label="Back" style={{ background: "transparent", border: "none", fontSize: 18, cursor: "pointer", color: "var(--vt-primary-dark)" }}>‹</button>
        <h1 style={{ margin: 0, color: "var(--vt-primary-dark)", fontSize: 15, fontWeight: 600 }}>{project}</h1>
      </header>
      <div style={{ padding: "var(--vt-space-4)" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: "var(--vt-space-3)" }}>
          {PERIODS.map((p) => {
            const active = p.key === period;
            return (
              <button key={p.key} onClick={() => setPeriod(p.key)} style={{ padding: "6px 12px", borderRadius: 999, border: "1px solid var(--vt-border)", background: active ? "var(--vt-primary)" : "transparent", color: active ? "var(--vt-primary-contrast)" : "var(--vt-text)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                {p.label}
              </button>
            );
          })}
        </div>

        <Section title="Velocity">
          {velocityQ.isLoading && <Skeleton height={200} />}
          {velocityQ.isError && <EmptyState title="Gagal memuat velocity" cta={{ label: "Coba lagi", onClick: () => velocityQ.refetch() }} />}
          {velocityQ.data && <VelocityChart data={velocityQ.data} />}
        </Section>

        <Section title="Forecast">
          {forecastQ.isLoading && <Skeleton height={80} />}
          {forecastQ.data && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              <Stat label="Target" value={forecastQ.data.target ?? "—"} />
              <Stat label="Projected" value={forecastQ.data.projected ?? "—"} />
              <Stat label="Gap" value={forecastQ.data.gap ?? "—"} />
            </div>
          )}
        </Section>

        <Section title="Risks">
          {risksQ.isLoading && <Skeleton height={80} />}
          {risksQ.data && risksQ.data.risks.length === 0 && <EmptyState title="Tidak ada risiko." />}
          {risksQ.data && risksQ.data.risks.map((r, i) => (
            <div key={i} style={{ padding: 12, marginBottom: 8, background: "white", borderRadius: 8, borderLeft: `4px solid ${riskColor(r.severity)}` }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{r.flag}</div>
              <div style={{ fontSize: 12, color: "var(--vt-text-muted)" }}>{r.message}</div>
            </div>
          ))}
        </Section>

        <Section title="OKR">
          {okrQ.isLoading && <Skeleton height={80} />}
          {okrQ.data && (okrQ.data.objectives ?? []).map((o) => (
            <div key={o.name} style={{ padding: 12, marginBottom: 8, background: "white", borderRadius: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{o.name}</div>
              <div style={{ fontSize: 12, color: "var(--vt-text-muted)" }}>{o.progress}% — {o.status}</div>
            </div>
          ))}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "var(--vt-space-4)" }}>
      <h2 style={{ fontSize: 13, fontWeight: 600, color: "var(--vt-text-muted)", margin: "0 0 8px 0", textTransform: "uppercase", letterSpacing: 0.5 }}>{title}</h2>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ padding: 12, background: "white", borderRadius: 8, textAlign: "center" }}>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--vt-text-muted)" }}>{label}</div>
    </div>
  );
}

function riskColor(sev: "low" | "med" | "high"): string {
  if (sev === "high") return "#c0392b";
  if (sev === "med") return "#e67e22";
  return "#7f8c8d";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pwa && pnpm vitest run src/mobile/pages/Reports/ProjectDetail.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pwa/src/mobile/pages/Reports/ProjectDetail.tsx pwa/src/mobile/pages/Reports/ProjectDetail.test.tsx
git commit -m "feat(pwa): ProjectDetail page (4 sections + period chips)"
```

---

## Task 12: Frontend — `TeamReport.tsx`

**Files:**
- Create: `pwa/src/mobile/pages/Reports/TeamReport.tsx`
- Create: `pwa/src/mobile/pages/Reports/TeamReport.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TeamReport } from "./TeamReport";

vi.mock("../../../api/reports", () => ({
  reportsApi: {
    teamLeaderboard: vi.fn().mockResolvedValue({ rows: [], period: "month" }),
    teamCompletion: vi.fn().mockResolvedValue({ completion_pct: 75, done: 30, total: 40 }),
    teamOverdue: vi.fn().mockResolvedValue({ total: 0, items: [] }),
    teamWorkload: vi.fn().mockResolvedValue({ members: [] }),
  },
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TeamReport />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("TeamReport", () => {
  it("renders 4 sections", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/Leaderboard/i)).toBeInTheDocument());
    expect(screen.getByText(/Completion/i)).toBeInTheDocument();
    expect(screen.getByText(/Overdue/i)).toBeInTheDocument();
    expect(screen.getByText(/Workload/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pwa && pnpm vitest run src/mobile/pages/Reports/TeamReport.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement `TeamReport.tsx`**

```tsx
import { useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { reportsApi, Period } from "../../../api/reports";
import { LeaderboardTable } from "../../../components/LeaderboardTable";
import { Skeleton } from "../../../components/Skeleton";
import { EmptyState } from "../../../components/EmptyState";
import { logEvent } from "../../../telemetry";

const PERIODS: { key: Period; label: string }[] = [
  { key: "week", label: "Minggu" },
  { key: "month", label: "Bulan" },
  { key: "quarter", label: "Kuartal" },
];
const VALID_PERIODS: Period[] = ["week", "month", "quarter"];

export function TeamReport() {
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const rawPeriod = params.get("period") as Period;
  const period: Period = VALID_PERIODS.includes(rawPeriod) ? rawPeriod : "month";

  const lbQ = useQuery({
    queryKey: ["reports", "team", "leaderboard", period],
    queryFn: () => reportsApi.teamLeaderboard(period, 10),
    staleTime: 60_000,
  });
  const completionQ = useQuery({
    queryKey: ["reports", "team", "completion", period],
    queryFn: () => reportsApi.teamCompletion(period),
    staleTime: 60_000,
  });
  const overdueQ = useQuery({
    queryKey: ["reports", "team", "overdue"],
    queryFn: () => reportsApi.teamOverdue(),
    staleTime: 60_000,
  });
  const workloadQ = useQuery({
    queryKey: ["reports", "team", "workload"],
    queryFn: () => reportsApi.teamWorkload(),
    staleTime: 60_000,
  });

  useEffect(() => {
    logEvent("reports_team_view", {});
  }, []);

  function setPeriod(p: Period) {
    setParams({ period: p }, { replace: true });
    logEvent("reports_period_change", { scope: "team", period: p });
  }

  return (
    <div style={{ background: "var(--vt-primary-light)", flex: 1, display: "flex", flexDirection: "column" }}>
      <header style={{ background: "var(--vt-primary-light)", padding: "var(--vt-space-4)", position: "sticky", top: 0, zIndex: 10, display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => nav("/m/reports")} aria-label="Back" style={{ background: "transparent", border: "none", fontSize: 18, cursor: "pointer", color: "var(--vt-primary-dark)" }}>‹</button>
        <h1 style={{ margin: 0, color: "var(--vt-primary-dark)", fontSize: 15, fontWeight: 600 }}>My Team</h1>
      </header>
      <div style={{ padding: "var(--vt-space-4)" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: "var(--vt-space-3)" }}>
          {PERIODS.map((p) => {
            const active = p.key === period;
            return (
              <button key={p.key} onClick={() => setPeriod(p.key)} style={{ padding: "6px 12px", borderRadius: 999, border: "1px solid var(--vt-border)", background: active ? "var(--vt-primary)" : "transparent", color: active ? "var(--vt-primary-contrast)" : "var(--vt-text)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                {p.label}
              </button>
            );
          })}
        </div>

        <h2 style={{ fontSize: 13, fontWeight: 600, color: "var(--vt-text-muted)", margin: "0 0 8px 0", textTransform: "uppercase" }}>Leaderboard</h2>
        {lbQ.isLoading && <Skeleton height={120} />}
        {lbQ.data && <LeaderboardTable rows={lbQ.data.rows} />}

        <h2 style={{ fontSize: 13, fontWeight: 600, color: "var(--vt-text-muted)", margin: "var(--vt-space-4) 0 8px 0", textTransform: "uppercase" }}>Completion</h2>
        {completionQ.isLoading && <Skeleton height={64} />}
        {completionQ.data && (
          <div style={{ padding: 16, background: "white", borderRadius: 12, textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: "var(--vt-primary-dark)" }}>{completionQ.data.completion_pct}%</div>
            <div style={{ fontSize: 12, color: "var(--vt-text-muted)" }}>{completionQ.data.done} / {completionQ.data.total} selesai</div>
          </div>
        )}

        <h2 style={{ fontSize: 13, fontWeight: 600, color: "var(--vt-text-muted)", margin: "var(--vt-space-4) 0 8px 0", textTransform: "uppercase" }}>Overdue</h2>
        {overdueQ.isLoading && <Skeleton height={80} />}
        {overdueQ.data && overdueQ.data.total === 0 && <EmptyState title="Tidak ada task overdue." />}
        {overdueQ.data && overdueQ.data.items.map((it) => (
          <div key={it.name} style={{ padding: 12, marginBottom: 8, background: "white", borderRadius: 8 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{it.subject}</div>
            <div style={{ fontSize: 12, color: "var(--vt-text-muted)" }}>{it.assignee} · due {it.due_date}</div>
          </div>
        ))}

        <h2 style={{ fontSize: 13, fontWeight: 600, color: "var(--vt-text-muted)", margin: "var(--vt-space-4) 0 8px 0", textTransform: "uppercase" }}>Workload</h2>
        {workloadQ.isLoading && <Skeleton height={120} />}
        {workloadQ.data && workloadQ.data.members.map((m) => (
          <div key={m.user} style={{ display: "flex", alignItems: "center", padding: "8px 12px", background: "white", borderRadius: 8, marginBottom: 6 }}>
            <div style={{ flex: 1, fontSize: 13 }}>{m.user}</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{m.open_tasks}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pwa && pnpm vitest run src/mobile/pages/Reports/TeamReport.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pwa/src/mobile/pages/Reports/TeamReport.tsx pwa/src/mobile/pages/Reports/TeamReport.test.tsx
git commit -m "feat(pwa): TeamReport page (leaderboard + completion + overdue + workload)"
```

---

## Task 13: Wire routes + redirect `/m/analytics` → `/m/reports/me`

**Files:**
- Modify: `pwa/src/router.tsx`

- [ ] **Step 1: Read current router**

Run: `cat pwa/src/router.tsx`

Note current import order + AppShell children block.

- [ ] **Step 2: Add new imports near existing ones**

```tsx
import { Landing as ReportsLanding } from "./mobile/pages/Reports/Landing";
import { MyReports } from "./mobile/pages/Reports/MyReports";
import { ProjectsList } from "./mobile/pages/Reports/ProjectsList";
import { ProjectDetail } from "./mobile/pages/Reports/ProjectDetail";
import { TeamReport } from "./mobile/pages/Reports/TeamReport";
import { ReportsFeatureGate } from "./mobile/pages/Reports/ReportsFeatureGate";
```

- [ ] **Step 3: Replace `/m/analytics` route + add 5 new routes**

In the AppShell children array, replace:

```tsx
{ path: "/m/analytics", element: <LazyAnalytics /> },
```

with:

```tsx
{ path: "/m/analytics", element: <Navigate to="/m/reports/me" replace /> },
{ path: "/m/reports",                element: <ReportsFeatureGate><ReportsLanding /></ReportsFeatureGate> },
{ path: "/m/reports/me",             element: <ReportsFeatureGate><MyReports /></ReportsFeatureGate> },
{ path: "/m/reports/projects",       element: <ReportsFeatureGate><ProjectsList /></ReportsFeatureGate> },
{ path: "/m/reports/projects/:id",   element: <ReportsFeatureGate><ProjectDetail /></ReportsFeatureGate> },
{ path: "/m/reports/team",           element: <ReportsFeatureGate><TeamReport /></ReportsFeatureGate> },
```

Keep `LazyAnalytics` import + factory so existing direct calls (if any) still resolve.

- [ ] **Step 4: TypeScript check**

Run: `cd pwa && pnpm tsc --noEmit`

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add pwa/src/router.tsx
git commit -m "feat(pwa): wire /m/reports routes + redirect /m/analytics"
```

---

## Task 14: Update `BottomNav` — Analytics → Reports

**Files:**
- Modify: `pwa/src/components/BottomNav.tsx`
- Modify: `pwa/src/components/BottomNav.test.tsx` (if exists)

- [ ] **Step 1: Find Analytics tab entry**

Run: `grep -n "analytics\|Analytics" pwa/src/components/BottomNav.tsx`

- [ ] **Step 2: Rename label + path**

Change the tab item from:
```tsx
{ label: "Analytics", path: "/m/analytics", icon: <BarChartIcon /> }
```
to:
```tsx
{ label: "Reports", path: "/m/reports", icon: <BarChartIcon /> }
```

If there's a translation key (e.g. `t("nav.analytics")`), add a new key `nav.reports` in `pwa/src/i18n/*.ts` mapping to `"Reports"` (en) and `"Laporan"` (id), and reference the new key.

- [ ] **Step 3: Update test (if exists)**

If `BottomNav.test.tsx` asserts the Analytics label, change it to `Reports` / `Laporan`.

- [ ] **Step 4: Run tests**

Run: `cd pwa && pnpm vitest run src/components/BottomNav.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pwa/src/components/BottomNav.tsx pwa/src/components/BottomNav.test.tsx pwa/src/i18n/
git commit -m "feat(pwa): BottomNav tab Analytics → Reports"
```

---

## Task 15: Full test pass + lint + docs update

**Files:**
- Modify: `docs/implementation-tracker.md`
- Create: `docs/domains/reports/README.html` (new domain)

- [ ] **Step 1: Run full PWA test suite**

Run: `cd pwa && pnpm vitest run`

Expected: all PASS. Fix any breakage before continuing.

- [ ] **Step 2: Run PWA lint**

Run: `cd pwa && pnpm lint`

Expected: no errors. Fix any reported issues.

- [ ] **Step 3: Run full backend test module**

Run: `bench --site task.localhost run-tests --app vernon_tasks --module vernon_tasks.api.test_portal_reports -v`

Expected: all PASS.

- [ ] **Step 4: Create domain doc**

Write `docs/domains/reports/README.html`:

```html
<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Vernon Tasks — Domain: Reports</title>
<link rel="stylesheet" href="../../assets/style.css" />
<script defer src="../../assets/layout.js"></script>
</head>
<body data-root="../../" data-audience="dev">
<h1>Reports Domain</h1>
<p><strong>Owner:</strong> Erick Mo &nbsp;|&nbsp; <strong>Status:</strong> Active</p>

<h2>Scope</h2>
<p>Mobile + portal reporting hub. Aggregates analytics, OKR rollup, sprint velocity, risk, leaderboard, workload, and overdue tasks. Two surfaces:</p>
<ul>
  <li><code>/portal/reports</code> — desktop exec dashboard (3 tabs: OKR, Sprints, Team).</li>
  <li><code>/m/reports</code> — mobile hub (3 cards: My Reports, Projects I Manage, My Team).</li>
</ul>

<h2>Endpoints</h2>
<table>
  <tr><th>Endpoint</th><th>Permission</th><th>Caches</th></tr>
  <tr><td>list_managed_projects</td><td>Leader+</td><td>5m / user</td></tr>
  <tr><td>get_mobile_project_velocity</td><td>Leader+ owns project</td><td>5m / user+project</td></tr>
  <tr><td>get_mobile_project_forecast</td><td>Leader+ owns project</td><td>5m / user+project</td></tr>
  <tr><td>get_mobile_project_risks</td><td>Leader+ owns project</td><td>none</td></tr>
  <tr><td>get_mobile_project_okr</td><td>Leader+ owns project</td><td>5m / user+project+period</td></tr>
  <tr><td>get_mobile_team_leaderboard</td><td>Leader+</td><td>5m / user+period</td></tr>
  <tr><td>get_mobile_team_overdue</td><td>Leader+</td><td>none</td></tr>
  <tr><td>get_mobile_team_workload</td><td>Leader+</td><td>5m / user</td></tr>
  <tr><td>get_mobile_team_completion</td><td>Leader+</td><td>5m / user+period</td></tr>
</table>

<h2>Feature flags</h2>
<ul>
  <li><code>portal_reports_enabled</code> (VT Settings) — gates <code>/portal/reports</code>.</li>
  <li><code>mobile_reports_enabled</code> (VT Settings) — gates <code>/m/reports</code>.</li>
</ul>

<h2>Cross-Domain Events</h2>
<h3>Triggers (I fire these)</h3>
<table>
  <tr><th>Event</th><th>Payload</th><th>Known Listeners</th></tr>
  <tr><td>(none — Reports is read-only)</td><td>—</td><td>—</td></tr>
</table>

<h3>Listens (I react to these)</h3>
<table>
  <tr><th>Event</th><th>Source</th><th>My action</th></tr>
  <tr><td>tasks.task.completed</td><td>tasks</td><td>Invalidate completion + workload cache</td></tr>
  <tr><td>sprints.sprint.closed</td><td>sprints</td><td>Invalidate velocity cache</td></tr>
  <tr><td>okr.kpi_snapshot.updated</td><td>okr</td><td>Invalidate OKR rollup cache</td></tr>
</table>

</body>
</html>
```

- [ ] **Step 5: Update implementation tracker**

Append row to `docs/implementation-tracker.md` (under appropriate section):

```markdown
| Reports — Mobile Hub | PRD-REPORTS-MOBILE | Complete | pwa/src/mobile/pages/Reports/ + portal_reports.py | Landing.test.tsx, MyReports.test.tsx, ProjectsList.test.tsx, ProjectDetail.test.tsx, TeamReport.test.tsx, test_portal_reports.py:TestListManagedProjects+TestMobileProjectEndpoints+TestMobileTeamEndpoints | fixtures via setUp() helpers |
```

Recalculate Summary table at top of tracker if it exists.

- [ ] **Step 6: Commit docs**

```bash
git add docs/
git commit -m "docs(reports): tambah domain doc + update implementation tracker"
```

---

## Task 16: Manual smoke test + flip feature flag

**Files:**
- (none — manual verification)

- [ ] **Step 1: Start dev server**

Run: `cd pwa && pnpm dev` (background) and `bench start` if not running.

- [ ] **Step 2: Enable mobile flag**

Run: `bench --site task.localhost set-config -p mobile_reports_enabled 1` OR via Frappe Desk → VT Settings → tick "Enable Mobile Reports" → Save.

- [ ] **Step 3: Smoke walkthrough**

Visit each route on mobile viewport (375px in Chrome DevTools):
- `http://task.localhost:8080/m/reports` — role-filtered cards render.
- Tap "My Reports" → 3 tabs work, charts render.
- Tap "Projects I Manage" → project cards render, KPI chips visible.
- Tap a project card → 4 sections render, period chips change URL.
- Back → tap "My Team" → 4 sections render.
- `http://task.localhost:8080/m/analytics` redirects to `/m/reports/me`.

- [ ] **Step 4: Verify role gating**

Log in as a Member user → `/m/reports` shows only "My Reports" card; tapping `/m/reports/projects` returns 403.

- [ ] **Step 5: Final commit (if smoke surfaced fixes)**

```bash
git add -p
git commit -m "fix(reports): smoke test corrections"
```

- [ ] **Step 6: Push + open PR**

```bash
git push -u origin feature/mobile-reports-hub
gh pr create --title "feat(reports): mobile reports hub /m/reports" --body "$(cat <<'EOF'
## Summary
- Mobile `/m/reports` landing with 3 role-filtered cards
- Drill flow: Projects list → Project detail (4 sections); Team (4 sections)
- Redirect `/m/analytics` → `/m/reports/me`
- 9 new whitelisted endpoints in `portal_reports.py`
- Feature flag `mobile_reports_enabled` in VT Settings

## Test plan
- [x] Backend tests pass (TestListManagedProjects, TestMobileProjectEndpoints, TestMobileTeamEndpoints)
- [x] PWA vitest suite pass
- [x] Manual smoke on mobile viewport
- [x] Role gating verified (Member sees 1 card, Leader sees 3)
- [x] `/m/analytics` redirect verified

Spec: `docs/superpowers/specs/2026-05-22-mobile-reports-hub-design.html`
Plan: `docs/superpowers/plans/2026-05-22-mobile-reports-hub.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review notes

- Spec coverage: §1 scope → T13/T14; §2 routes+components → T5-T14; §3 backend → T1-T4; §4 page designs → T8-T12; §5 data flow → T5/T6 + each page; §6 error+loading → embedded in T8-T12; §7 tests → embedded in T2-T4 + T8-T12 + T15; §8 rollout → T16.
- All endpoints typed identically in client (Task 5) and used identically in pages (T8-T12).
- All test files render with `MemoryRouter` + `QueryClientProvider` consistently.
- All page outer `div`s follow the recent dashboard/notification fix: `flex: 1, display: flex, flexDirection: column`.
- Feature flag enforced both client (`ReportsFeatureGate`) and server (`_check_mobile_flag`).

# Portal Dashboard P6 — Role-Aware Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Dashboard placeholder at `/portal` with a role-aware, top-down workflow dashboard showing Leader → Owner → Member context sections, with a 7-day task timeline, drag-reorder sections, and light glassmorphism UI.

**Architecture:** Three collapsible/draggable sections (Leader, Owner, Member) gated by Frappe roles, all mounted in the existing `pwa/src/portal/pages/Dashboard.tsx`. Each section fetches its own data via React Query hooks backed by new `portal_dashboard.py` backend module. Section order and collapse state persisted to `localStorage`. Feature-gated behind `VT Settings.portal_dashboard_v2_enabled`.

**Tech Stack:** React 18 + TypeScript, @tanstack/react-query, Frappe Python API, Vitest + @testing-library/react, CSS variables (existing portal theme extended with light-mode vars)

---

## File Map

**New files:**
- `pwa/src/portal/dashboard/DashboardPage.tsx` — main page, replaces placeholder
- `pwa/src/portal/dashboard/DashboardPage.test.tsx`
- `pwa/src/portal/dashboard/SummaryBar.tsx` — 5 metric cards
- `pwa/src/portal/dashboard/SummaryBar.test.tsx`
- `pwa/src/portal/dashboard/sections/LeaderSection.tsx` — Team Pulse + Unassigned
- `pwa/src/portal/dashboard/sections/LeaderSection.test.tsx`
- `pwa/src/portal/dashboard/sections/OwnerSection.tsx` — OKR + Portfolio
- `pwa/src/portal/dashboard/sections/OwnerSection.test.tsx`
- `pwa/src/portal/dashboard/sections/MemberSection.tsx` — My Tasks + Timeline
- `pwa/src/portal/dashboard/sections/MemberSection.test.tsx`
- `pwa/src/portal/dashboard/widgets/TeamPulseGrid.tsx`
- `pwa/src/portal/dashboard/widgets/UnassignedTaskList.tsx`
- `pwa/src/portal/dashboard/widgets/OkrProgressList.tsx`
- `pwa/src/portal/dashboard/widgets/PortfolioList.tsx`
- `pwa/src/portal/dashboard/widgets/MyTaskList.tsx`
- `pwa/src/portal/dashboard/widgets/TaskTimeline.tsx`
- `pwa/src/portal/dashboard/hooks/useDashboardSummary.ts`
- `pwa/src/portal/dashboard/hooks/useTeamPulse.ts`
- `pwa/src/portal/dashboard/hooks/useUnassignedTasks.ts`
- `pwa/src/portal/dashboard/hooks/useMyTasksTimeline.ts`
- `pwa/src/portal/dashboard/hooks/usePortfolioSummary.ts`
- `pwa/src/portal/dashboard/hooks/useSectionOrder.ts`
- `pwa/src/portal/dashboard/hooks/useSectionCollapse.ts`
- `pwa/src/portal/dashboard/api/portalDashboard.ts`
- `pwa/src/portal/dashboard/dashboard.css`
- `vernon_tasks/api/portal_dashboard.py`
- `vernon_tasks/api/test_portal_dashboard.py`

**Modified files:**
- `pwa/src/portal/pages/Dashboard.tsx` — swap import to new DashboardPage
- `pwa/src/portal/routes.tsx` — wrap Dashboard in feature gate
- `vernon_tasks/api/__init__.py` — no change needed (whitelist via decorators)

---

## Task 1: Backend — Feature Flag + `get_summary` endpoint

**Files:**
- Create: `vernon_tasks/api/portal_dashboard.py`
- Create: `vernon_tasks/api/test_portal_dashboard.py`

- [ ] **Step 1: Write failing Python test**

```python
# vernon_tasks/api/test_portal_dashboard.py
import frappe
import unittest
from unittest.mock import patch


class TestPortalDashboardSummary(unittest.TestCase):
    def setUp(self):
        self.user = "Administrator"
        frappe.set_user(self.user)

    def test_get_summary_returns_expected_keys(self):
        from vernon_tasks.api.portal_dashboard import get_summary
        result = get_summary()
        self.assertIn("team_blocked", result)
        self.assertIn("unassigned_tasks", result)
        self.assertIn("okr_progress", result)
        self.assertIn("my_overdue", result)
        self.assertIn("sprint_days_remaining", result)

    def test_get_summary_non_leader_returns_zero_blocked(self):
        from vernon_tasks.api.portal_dashboard import get_summary
        with patch("frappe.get_roles", return_value=["VT Member"]):
            result = get_summary()
        self.assertEqual(result["team_blocked"], 0)
        self.assertEqual(result["unassigned_tasks"], 0)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /workspace && bench --site erp.localhost run-tests --app vernon_tasks --module vernon_tasks.api.test_portal_dashboard
```
Expected: `ImportError` or `AttributeError` — module doesn't exist yet.

- [ ] **Step 3: Write `portal_dashboard.py`**

```python
# vernon_tasks/api/portal_dashboard.py
from datetime import date
import frappe

ROLE_MANAGER = "VT Manager"
ROLE_LEADER  = "VT Leader"
ROLE_MEMBER  = "VT Member"

DOCTYPE_TASK   = "VT Task"
DOCTYPE_SPRINT = "VT Sprint"


def _is_leader_or_above(roles: set) -> bool:
    return bool({ROLE_MANAGER, "System Manager"} & roles) or ROLE_LEADER in roles


def _is_manager(roles: set) -> bool:
    return bool({ROLE_MANAGER, "System Manager"} & roles)


@frappe.whitelist()
def get_summary() -> dict:
    """Single-call aggregate for Dashboard summary bar. Cached 60s per user."""
    user  = frappe.session.user
    cache_key = f"portal_dashboard_summary_{user}"
    cached = frappe.cache().get_value(cache_key)
    if cached:
        return cached

    roles = set(frappe.get_roles(user))
    today = date.today().isoformat()

    # team_blocked + unassigned — only for leaders
    team_blocked = 0
    unassigned_tasks = 0
    if _is_leader_or_above(roles):
        team_blocked = frappe.db.count(DOCTYPE_TASK, filters={
            "assigned_to": ["!=", ""],
            "kanban_status": "Blocked",
        }) or 0
        unassigned_tasks = frappe.db.count(DOCTYPE_TASK, filters={
            "assigned_to": ["in", ["", None]],
            "status": ["!=", "Closed"],
        }) or 0

    # my overdue tasks
    my_overdue = frappe.db.count(DOCTYPE_TASK, filters={
        "assigned_to": user,
        "deadline": ["<", today],
        "kanban_status": ["not in", ["Done"]],
    }) or 0

    # OKR average progress
    okr_progress = 0.0
    try:
        rows = frappe.db.get_all("VT OKR", filters={"status": "Active"},
                                  fields=["progress_pct"])
        if rows:
            okr_progress = round(sum(r.progress_pct or 0 for r in rows) / len(rows), 1)
    except Exception:
        okr_progress = 0.0

    # sprint days remaining (nearest active sprint for user)
    sprint_days_remaining = 0
    sprints = frappe.db.get_all(
        DOCTYPE_SPRINT,
        filters={"status": "Active"},
        fields=["end_date"],
        order_by="end_date asc",
        limit=1,
    )
    if sprints and sprints[0].get("end_date"):
        delta = (sprints[0]["end_date"] - date.today()).days
        sprint_days_remaining = max(0, delta)

    result = {
        "team_blocked": team_blocked,
        "unassigned_tasks": unassigned_tasks,
        "okr_progress": okr_progress,
        "my_overdue": my_overdue,
        "sprint_days_remaining": sprint_days_remaining,
    }
    frappe.cache().set_value(cache_key, result, expires_in_sec=60)
    return result
```

- [ ] **Step 4: Run test — expect PASS**

```bash
bench --site erp.localhost run-tests --app vernon_tasks --module vernon_tasks.api.test_portal_dashboard
```

- [ ] **Step 5: Commit**

```bash
git add vernon_tasks/api/portal_dashboard.py vernon_tasks/api/test_portal_dashboard.py
git commit -m "feat(dashboard-p6): add portal_dashboard.py with get_summary endpoint"
```

---

## Task 2: Backend — `get_team_pulse` + `get_unassigned_tasks`

**Files:**
- Modify: `vernon_tasks/api/portal_dashboard.py`
- Modify: `vernon_tasks/api/test_portal_dashboard.py`

- [ ] **Step 1: Add tests**

```python
# append to test_portal_dashboard.py

class TestTeamPulse(unittest.TestCase):
    def setUp(self):
        frappe.set_user("Administrator")

    def test_get_team_pulse_requires_leader(self):
        from vernon_tasks.api.portal_dashboard import get_team_pulse
        with patch("frappe.get_roles", return_value=["VT Member"]):
            with self.assertRaises(frappe.PermissionError):
                get_team_pulse(project="test-project")

    def test_get_team_pulse_returns_list(self):
        from vernon_tasks.api.portal_dashboard import get_team_pulse
        with patch("frappe.get_roles", return_value=["VT Leader"]):
            result = get_team_pulse(project=None)
        self.assertIsInstance(result, list)

    def test_get_unassigned_tasks_requires_leader(self):
        from vernon_tasks.api.portal_dashboard import get_unassigned_tasks
        with patch("frappe.get_roles", return_value=["VT Member"]):
            with self.assertRaises(frappe.PermissionError):
                get_unassigned_tasks(project=None)
```

- [ ] **Step 2: Run — expect FAIL**

```bash
bench --site erp.localhost run-tests --app vernon_tasks --module vernon_tasks.api.test_portal_dashboard
```

- [ ] **Step 3: Add functions to `portal_dashboard.py`**

```python
# append to portal_dashboard.py

@frappe.whitelist()
def get_team_pulse(project: str | None = None) -> list:
    """Returns member status for Leader section. Leader+ only."""
    roles = set(frappe.get_roles(frappe.session.user))
    if not _is_leader_or_above(roles):
        raise frappe.PermissionError("Leader role required")

    filters: dict = {"assigned_to": ["!=", ""], "kanban_status": ["!=", "Done"]}
    if project:
        filters["project"] = project

    tasks = frappe.db.get_all(
        DOCTYPE_TASK,
        filters=filters,
        fields=["name", "title", "assigned_to", "kanban_status", "pdca_phase", "deadline"],
        order_by="assigned_to asc",
        limit=50,
    )

    # group by member, pick latest task per member
    members: dict[str, dict] = {}
    today = date.today().isoformat()
    for t in tasks:
        member = t["assigned_to"]
        if member not in members:
            status = "blocked" if t["kanban_status"] == "Blocked" else "on_track"
            if t.get("deadline") and t["deadline"] < today and t["kanban_status"] != "Done":
                status = "overdue"
            members[member] = {
                "user": member,
                "task_id": t["name"],
                "task_title": t["title"],
                "pdca_phase": t.get("pdca_phase", ""),
                "kanban_status": t["kanban_status"],
                "status": status,
            }
    return list(members.values())


@frappe.whitelist()
def get_unassigned_tasks(project: str | None = None) -> list:
    """Tasks without assigned_to in active sprint. Leader+ only."""
    roles = set(frappe.get_roles(frappe.session.user))
    if not _is_leader_or_above(roles):
        raise frappe.PermissionError("Leader role required")

    filters: dict = {
        "assigned_to": ["in", ["", None]],
        "kanban_status": ["not in", ["Done"]],
    }
    if project:
        filters["project"] = project

    tasks = frappe.db.get_all(
        DOCTYPE_TASK,
        filters=filters,
        fields=["name", "title", "pdca_phase", "sprint", "project"],
        order_by="creation desc",
        limit=20,
    )
    return tasks
```

- [ ] **Step 4: Run — expect PASS**

```bash
bench --site erp.localhost run-tests --app vernon_tasks --module vernon_tasks.api.test_portal_dashboard
```

- [ ] **Step 5: Commit**

```bash
git add vernon_tasks/api/portal_dashboard.py vernon_tasks/api/test_portal_dashboard.py
git commit -m "feat(dashboard-p6): add get_team_pulse and get_unassigned_tasks endpoints"
```

---

## Task 3: Backend — `get_portfolio_summary` + `get_my_tasks_timeline`

**Files:**
- Modify: `vernon_tasks/api/portal_dashboard.py`
- Modify: `vernon_tasks/api/test_portal_dashboard.py`

- [ ] **Step 1: Add tests**

```python
# append to test_portal_dashboard.py

class TestTimeline(unittest.TestCase):
    def setUp(self):
        frappe.set_user("Administrator")

    def test_timeline_returns_dict_keyed_by_date(self):
        from vernon_tasks.api.portal_dashboard import get_my_tasks_timeline
        result = get_my_tasks_timeline(days_back=3, days_forward=3)
        self.assertIsInstance(result, dict)
        # each value is a list
        for v in result.values():
            self.assertIsInstance(v, list)

    def test_portfolio_requires_manager(self):
        from vernon_tasks.api.portal_dashboard import get_portfolio_summary
        with patch("frappe.get_roles", return_value=["VT Leader"]):
            with self.assertRaises(frappe.PermissionError):
                get_portfolio_summary()
```

- [ ] **Step 2: Run — expect FAIL**

```bash
bench --site erp.localhost run-tests --app vernon_tasks --module vernon_tasks.api.test_portal_dashboard
```

- [ ] **Step 3: Implement**

```python
# append to portal_dashboard.py
from datetime import timedelta

@frappe.whitelist()
def get_my_tasks_timeline(days_back: int = 3, days_forward: int = 3) -> dict:
    """Tasks grouped by deadline date for H-N..H+N timeline."""
    user  = frappe.session.user
    today = date.today()
    start = (today - timedelta(days=int(days_back))).isoformat()
    end   = (today + timedelta(days=int(days_forward))).isoformat()

    tasks = frappe.db.get_all(
        DOCTYPE_TASK,
        filters={
            "assigned_to": user,
            "deadline": ["between", [start, end]],
        },
        fields=["name", "title", "deadline", "pdca_phase", "kanban_status"],
        order_by="deadline asc",
    )

    result: dict[str, list] = {}
    for t in tasks:
        key = str(t["deadline"]) if t.get("deadline") else "no_date"
        result.setdefault(key, []).append({
            "id": t["name"],
            "title": t["title"],
            "pdca_phase": t.get("pdca_phase", ""),
            "done": t.get("kanban_status") == "Done",
        })
    return result


@frappe.whitelist()
def get_portfolio_summary() -> list:
    """Project list with RAG status. Manager only."""
    roles = set(frappe.get_roles(frappe.session.user))
    if not _is_manager(roles):
        raise frappe.PermissionError("Manager role required")

    projects = frappe.db.get_all(
        "VT Project",
        filters={"status": ["!=", "Closed"]},
        fields=["name", "title", "status"],
        order_by="creation desc",
    )

    result = []
    for p in projects:
        total = frappe.db.count(DOCTYPE_TASK, filters={"project": p["name"]}) or 0
        done  = frappe.db.count(DOCTYPE_TASK,
                                 filters={"project": p["name"], "kanban_status": "Done"}) or 0
        pct   = round(done / total * 100) if total else 0
        rag   = "green" if pct >= 70 else ("amber" if pct >= 40 else "red")

        sprint = frappe.db.get_value(
            DOCTYPE_SPRINT,
            filters={"project": p["name"], "status": "Active"},
            fieldname=["name", "title", "end_date"],
            as_dict=True,
        )
        result.append({
            "project": p["name"],
            "title": p["title"],
            "progress_pct": pct,
            "rag": rag,
            "sprint_title": sprint.get("title") if sprint else None,
            "sprint_days_remaining": (
                max(0, (sprint["end_date"] - date.today()).days) if sprint and sprint.get("end_date") else None
            ),
        })
    return result
```

- [ ] **Step 4: Run — expect PASS**

```bash
bench --site erp.localhost run-tests --app vernon_tasks --module vernon_tasks.api.test_portal_dashboard
```

- [ ] **Step 5: Commit**

```bash
git add vernon_tasks/api/portal_dashboard.py vernon_tasks/api/test_portal_dashboard.py
git commit -m "feat(dashboard-p6): add get_portfolio_summary and get_my_tasks_timeline endpoints"
```

---

## Task 4: Frontend API + Hooks

**Files:**
- Create: `pwa/src/portal/dashboard/api/portalDashboard.ts`
- Create: `pwa/src/portal/dashboard/hooks/useDashboardSummary.ts`
- Create: `pwa/src/portal/dashboard/hooks/useTeamPulse.ts`
- Create: `pwa/src/portal/dashboard/hooks/useUnassignedTasks.ts`
- Create: `pwa/src/portal/dashboard/hooks/useMyTasksTimeline.ts`
- Create: `pwa/src/portal/dashboard/hooks/usePortfolioSummary.ts`
- Create: `pwa/src/portal/dashboard/hooks/useSectionOrder.ts`
- Create: `pwa/src/portal/dashboard/hooks/useSectionCollapse.ts`

- [ ] **Step 1: Write `portalDashboard.ts`**

```typescript
// pwa/src/portal/dashboard/api/portalDashboard.ts
import { api } from "../../../api/client";

const BASE = "/api/method/vernon_tasks.api.portal_dashboard";

export interface DashboardSummary {
  team_blocked: number;
  unassigned_tasks: number;
  okr_progress: number;
  my_overdue: number;
  sprint_days_remaining: number;
}

export interface TeamMember {
  user: string;
  task_id: string;
  task_title: string;
  pdca_phase: string;
  kanban_status: string;
  status: "on_track" | "blocked" | "overdue";
}

export interface UnassignedTask {
  name: string;
  title: string;
  pdca_phase: string;
  sprint: string | null;
  project: string;
}

export interface TimelineTask {
  id: string;
  title: string;
  pdca_phase: string;
  done: boolean;
}

export interface PortfolioProject {
  project: string;
  title: string;
  progress_pct: number;
  rag: "green" | "amber" | "red";
  sprint_title: string | null;
  sprint_days_remaining: number | null;
}

export const portalDashboardApi = {
  getSummary: () =>
    api.get<DashboardSummary>(`${BASE}.get_summary`),

  getTeamPulse: (project?: string) =>
    api.get<TeamMember[]>(`${BASE}.get_team_pulse`, project ? { project } : undefined),

  getUnassignedTasks: (project?: string) =>
    api.get<UnassignedTask[]>(`${BASE}.get_unassigned_tasks`, project ? { project } : undefined),

  getMyTasksTimeline: (daysBack = 3, daysForward = 3) =>
    api.get<Record<string, TimelineTask[]>>(`${BASE}.get_my_tasks_timeline`, {
      days_back: String(daysBack),
      days_forward: String(daysForward),
    }),

  getPortfolioSummary: () =>
    api.get<PortfolioProject[]>(`${BASE}.get_portfolio_summary`),
};
```

- [ ] **Step 2: Write hooks**

```typescript
// pwa/src/portal/dashboard/hooks/useDashboardSummary.ts
import { useQuery } from "@tanstack/react-query";
import { portalDashboardApi } from "../api/portalDashboard";

export const dashboardKeys = {
  summary: ["dashboard", "summary"] as const,
  teamPulse: (project?: string) => ["dashboard", "teamPulse", project] as const,
  unassigned: (project?: string) => ["dashboard", "unassigned", project] as const,
  timeline: (back: number, fwd: number) => ["dashboard", "timeline", back, fwd] as const,
  portfolio: ["dashboard", "portfolio"] as const,
};

export function useDashboardSummary() {
  return useQuery({
    queryKey: dashboardKeys.summary,
    queryFn: () => portalDashboardApi.getSummary(),
    staleTime: 60_000,
  });
}
```

```typescript
// pwa/src/portal/dashboard/hooks/useTeamPulse.ts
import { useQuery } from "@tanstack/react-query";
import { portalDashboardApi } from "../api/portalDashboard";
import { dashboardKeys } from "./useDashboardSummary";

export function useTeamPulse(project?: string) {
  return useQuery({
    queryKey: dashboardKeys.teamPulse(project),
    queryFn: () => portalDashboardApi.getTeamPulse(project),
    staleTime: 30_000,
  });
}
```

```typescript
// pwa/src/portal/dashboard/hooks/useUnassignedTasks.ts
import { useQuery } from "@tanstack/react-query";
import { portalDashboardApi } from "../api/portalDashboard";
import { dashboardKeys } from "./useDashboardSummary";

export function useUnassignedTasks(project?: string) {
  return useQuery({
    queryKey: dashboardKeys.unassigned(project),
    queryFn: () => portalDashboardApi.getUnassignedTasks(project),
    staleTime: 30_000,
  });
}
```

```typescript
// pwa/src/portal/dashboard/hooks/useMyTasksTimeline.ts
import { useQuery } from "@tanstack/react-query";
import { portalDashboardApi } from "../api/portalDashboard";
import { dashboardKeys } from "./useDashboardSummary";

export function useMyTasksTimeline(daysBack = 3, daysForward = 3) {
  return useQuery({
    queryKey: dashboardKeys.timeline(daysBack, daysForward),
    queryFn: () => portalDashboardApi.getMyTasksTimeline(daysBack, daysForward),
    staleTime: 60_000,
  });
}
```

```typescript
// pwa/src/portal/dashboard/hooks/usePortfolioSummary.ts
import { useQuery } from "@tanstack/react-query";
import { portalDashboardApi } from "../api/portalDashboard";
import { dashboardKeys } from "./useDashboardSummary";

export function usePortfolioSummary() {
  return useQuery({
    queryKey: dashboardKeys.portfolio,
    queryFn: () => portalDashboardApi.getPortfolioSummary(),
    staleTime: 60_000,
  });
}
```

```typescript
// pwa/src/portal/dashboard/hooks/useSectionOrder.ts
export type SectionId = "leader" | "owner" | "member";
const KEY = "vt_dashboard_section_order";
const DEFAULT: SectionId[] = ["leader", "owner", "member"];

export function getSectionOrder(): SectionId[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((x: unknown) => DEFAULT.includes(x as SectionId))) {
      return parsed as SectionId[];
    }
  } catch { /* ignore */ }
  return DEFAULT;
}

export function saveSectionOrder(order: SectionId[]): void {
  localStorage.setItem(KEY, JSON.stringify(order));
}
```

```typescript
// pwa/src/portal/dashboard/hooks/useSectionCollapse.ts
const KEY = "vt_dashboard_collapsed";
type CollapseState = Record<string, boolean>;

export function getCollapseState(): CollapseState {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export function toggleCollapseState(id: string): boolean {
  const state = getCollapseState();
  const next = !state[id];
  localStorage.setItem(KEY, JSON.stringify({ ...state, [id]: next }));
  return next;
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
cd /workspace/apps/vernon_tasks/pwa && tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add pwa/src/portal/dashboard/api/ pwa/src/portal/dashboard/hooks/
git commit -m "feat(dashboard-p6): add frontend API types and React Query hooks"
```

---

## Task 5: CSS — Dashboard Light Theme

**Files:**
- Create: `pwa/src/portal/dashboard/dashboard.css`

- [ ] **Step 1: Write CSS**

```css
/* pwa/src/portal/dashboard/dashboard.css */
.db-root {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px;
  min-height: 100%;
  background:
    radial-gradient(ellipse 65% 50% at 10% 0%, rgba(139, 92, 246, 0.10) 0%, transparent 55%),
    radial-gradient(ellipse 50% 40% at 90% 85%, rgba(99, 102, 241, 0.08) 0%, transparent 55%),
    #f4f3ff;
}

/* Summary Bar */
.db-summary {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
}
.db-stat {
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.9);
  border-radius: 12px;
  padding: 12px 14px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05), 0 4px 16px rgba(124,58,237,0.05);
}
.db-stat__label {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #6b63a0;
  margin-bottom: 4px;
}
.db-stat__value {
  font-size: 22px;
  font-weight: 800;
  line-height: 1;
  color: #1e1740;
}
.db-stat__value--bad   { color: #dc2626; }
.db-stat__value--warn  { color: #b45309; }
.db-stat__value--good  { color: #16a34a; }
.db-stat__value--grad  {
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.db-stat__sub {
  font-size: 9px;
  color: #9890c4;
  margin-top: 2px;
}

/* Drag hint */
.db-drag-hint {
  font-size: 10px;
  color: #c4b5fd;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0 2px;
}

/* Section card */
.db-section {
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.9);
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05), 0 4px 16px rgba(124,58,237,0.05);
  transition: box-shadow 0.2s;
}
.db-section:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.07), 0 8px 24px rgba(124,58,237,0.08); }
.db-section--dragging { opacity: 0.5; outline: 2px dashed #c4b5fd; border-radius: 14px; }
.db-section--drag-over { outline: 2px dashed #7c3aed; background: rgba(124,58,237,0.03); border-radius: 14px; }

.db-section__strip { height: 3px; }
.db-section__strip--leader { background: linear-gradient(90deg, #3b82f6, #60a5fa); }
.db-section__strip--owner  { background: linear-gradient(90deg, #7c3aed, #a78bfa); }
.db-section__strip--member { background: linear-gradient(90deg, #16a34a, #4ade80); }

.db-section__header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 16px;
  cursor: pointer;
  border-bottom: 1px solid rgba(0,0,0,0.05);
  user-select: none;
  transition: background 0.12s;
}
.db-section__header:hover { background: rgba(124,58,237,0.03); }
.db-section__drag { color: #c4b5fd; font-size: 14px; cursor: grab; }
.db-section__drag:hover { color: #7c3aed; }
.db-section__icon { font-size: 16px; }
.db-section__title { font-size: 13px; font-weight: 700; color: #1e1740; flex: 1; }
.db-section__subtitle { font-size: 10px; color: #6b63a0; }
.db-section__badges { display: flex; gap: 5px; margin-left: auto; }
.db-badge { font-size: 9px; padding: 2px 8px; border-radius: 8px; font-weight: 700; }
.db-badge--red    { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
.db-badge--amber  { background: #fffbeb; color: #b45309; border: 1px solid #fde68a; }
.db-badge--green  { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }
.db-badge--purple { background: #f5f3ff; color: #7c3aed; border: 1px solid #ddd6fe; }
.db-section__collapse { color: #c4b5fd; font-size: 11px; transition: transform 0.2s; }
.db-section__collapse--collapsed { transform: rotate(-90deg); }

.db-section__body { padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
.db-section__body--hidden { display: none; }

/* Sub-section label */
.db-sub-label {
  font-size: 10px;
  font-weight: 700;
  color: #6b63a0;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 4px;
}

/* Team Pulse Grid */
.db-team-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.db-member-card {
  background: #fff;
  border: 1px solid rgba(0,0,0,0.07);
  border-radius: 10px;
  padding: 11px;
  cursor: pointer;
  transition: all 0.15s;
}
.db-member-card:hover { border-color: rgba(59,130,246,0.3); box-shadow: 0 2px 8px rgba(59,130,246,0.07); }
.db-member-card--blocked { border-color: #fecaca; background: #fff5f5; }
.db-member-card__top { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
.db-member-card__av {
  width: 28px; height: 28px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 800; color: #fff; flex-shrink: 0;
}
.db-member-card__name { font-size: 12px; font-weight: 600; color: #1e1740; flex: 1; }
.db-member-card__task { font-size: 10px; color: #6b63a0; margin-bottom: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.db-member-card__meta { display: flex; gap: 5px; align-items: center; }
.db-btn-help   { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; font-size: 9px; padding: 3px 9px; border-radius: 5px; font-weight: 700; cursor: pointer; }
.db-btn-review { background: #fffbeb; border: 1px solid #fde68a; color: #b45309; font-size: 9px; padding: 3px 9px; border-radius: 5px; font-weight: 700; cursor: pointer; }

/* Unassigned rows */
.db-unassigned-row {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 11px; background: #fff; border: 1px solid rgba(0,0,0,0.07);
  border-radius: 8px; cursor: pointer; transition: all 0.12s;
}
.db-unassigned-row:hover { border-color: #bfdbfe; background: #eff6ff; }
.db-unassigned-row__text { flex: 1; font-size: 11px; color: #6b63a0; }
.db-btn-assign {
  font-size: 9px; padding: 3px 9px; border-radius: 5px;
  background: #eff6ff; border: 1px solid #bfdbfe; color: #2563eb; cursor: pointer; font-weight: 700;
}

/* Owner grid */
.db-owner-grid { display: grid; grid-template-columns: 1.5fr 1fr; gap: 12px; }

/* OKR rows */
.db-okr-row {
  background: #fff; border: 1px solid rgba(0,0,0,0.07);
  border-radius: 9px; padding: 10px 12px; margin-bottom: 7px;
}
.db-okr-row--risk { border-color: #fecaca; background: #fff5f5; }
.db-okr-row__top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.db-okr-row__name { font-size: 11px; font-weight: 600; color: #1e1740; }
.db-okr-row__pct  { font-size: 13px; font-weight: 800; }
.db-bar { background: rgba(0,0,0,0.07); border-radius: 3px; height: 5px; overflow: hidden; }
.db-bar__fill { height: 100%; border-radius: 3px; }
.db-okr-row__trend { font-size: 9px; color: #6b63a0; margin-top: 4px; display: flex; gap: 8px; }
.db-trend-up { color: #16a34a; }
.db-trend-dn { color: #dc2626; }

/* Portfolio rows */
.db-port-row {
  display: flex; align-items: center; gap: 9px;
  padding: 8px 10px; background: #fff; border: 1px solid rgba(0,0,0,0.07);
  border-radius: 8px; cursor: pointer; transition: all 0.12s; margin-bottom: 7px;
}
.db-port-row:hover { border-color: #ddd6fe; background: #faf8ff; }
.db-port-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.db-port-dot--green  { background: #16a34a; }
.db-port-dot--amber  { background: #f59e0b; }
.db-port-dot--red    { background: #dc2626; }
.db-port-name { flex: 1; font-size: 12px; font-weight: 600; color: #1e1740; }
.db-port-sprint { font-size: 9px; color: #6b63a0; }
.db-port-pct { font-size: 10px; font-weight: 700; width: 28px; text-align: right; }

/* Member grid */
.db-member-layout { display: grid; grid-template-columns: 1fr 1.8fr; gap: 12px; }

/* Task rows */
.db-task-row {
  display: flex; align-items: center; gap: 9px;
  padding: 7px 10px; background: #fff; border: 1px solid rgba(0,0,0,0.07);
  border-radius: 8px; cursor: pointer; transition: all 0.12s; margin-bottom: 5px;
}
.db-task-row:hover { border-color: #ddd6fe; background: #faf8ff; }
.db-task-row--urgent { border-color: #fecaca; background: #fff5f5; }
.db-task-row--done   { opacity: 0.45; }
.db-task-check {
  width: 16px; height: 16px; border-radius: 4px;
  border: 1.5px solid #d1d5db; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center; font-size: 10px;
}
.db-task-check--done   { background: #16a34a; border-color: #16a34a; color: #fff; }
.db-task-check--active { border-color: #7c3aed; }
.db-task-text { flex: 1; font-size: 11px; color: #1e1740; }
.db-task-text--done { color: #6b63a0; text-decoration: line-through; }
.db-task-more { text-align: center; font-size: 10px; color: #7c3aed; padding: 5px; cursor: pointer; opacity: 0.7; }
.db-task-more:hover { opacity: 1; }

/* PDCA tags */
.db-tag { font-size: 9px; padding: 2px 6px; border-radius: 4px; font-weight: 700; }
.db-tag--plan  { background: #ede9fe; color: #6d28d9; }
.db-tag--do    { background: #f0fdf4; color: #16a34a; }
.db-tag--check { background: #fff7ed; color: #c2410c; }
.db-tag--act   { background: #eff6ff; color: #1d4ed8; }
.db-tag--od    { background: #fef2f2; color: #dc2626; }

/* Timeline */
.db-timeline { display: flex; overflow-x: auto; gap: 0; }
.db-timeline::-webkit-scrollbar { height: 2px; }
.db-timeline::-webkit-scrollbar-thumb { background: rgba(124,58,237,0.15); border-radius: 1px; }
.db-tl-col { flex: 1; min-width: 76px; padding: 0 4px; }
.db-tl-col__head { margin-bottom: 6px; }
.db-tl-col__eyebrow { font-size: 9px; font-weight: 700; color: #6b63a0; letter-spacing: 0.04em; }
.db-tl-col__date    { font-size: 10px; font-weight: 600; color: #1e1740; }
.db-tl-col--past .db-tl-col__eyebrow { color: #dc2626; }
.db-tl-col--past .db-tl-col__date    { color: #ef4444; }
.db-tl-col--today .db-tl-col__eyebrow { color: #7c3aed; }
.db-tl-col--today .db-tl-col__date    { color: #6d28d9; font-size: 11px; font-weight: 800; }
.db-tl-div      { width: 1px; background: rgba(0,0,0,0.07); margin: 0 2px; align-self: stretch; }
.db-tl-div--now { background: rgba(124,58,237,0.3); }
.db-tc {
  display: flex; align-items: center; gap: 4px;
  background: #fff; border: 1px solid rgba(0,0,0,0.07);
  border-radius: 6px; padding: 4px 6px; margin-bottom: 4px;
  font-size: 10px; cursor: pointer; transition: all 0.12s;
}
.db-tc:hover { border-color: #ddd6fe; background: #faf8ff; }
.db-tc--overdue { border-color: #fecaca; background: #fff5f5; color: #dc2626; }
.db-tc--today   { border-color: #ddd6fe; background: #f5f3ff; }
.db-tc--done    { opacity: 0.35; }
.db-tc__dot  { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; }
.db-tc__text { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 60px; color: #1e1740; }
.db-tc--overdue .db-tc__text { color: #dc2626; }
.db-tc__badge { font-size: 8px; padding: 1px 4px; border-radius: 3px; font-weight: 700; flex-shrink: 0; }

/* Status pills */
.db-pill { font-size: 9px; padding: 2px 8px; border-radius: 8px; font-weight: 700; }
.db-pill--green  { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }
.db-pill--yellow { background: #fffbeb; color: #b45309; border: 1px solid #fde68a; }
.db-pill--red    { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }

/* Responsive */
@media (max-width: 1023px) {
  .db-summary { grid-template-columns: repeat(3, 1fr); }
  .db-team-grid { grid-template-columns: 1fr 1fr; }
  .db-owner-grid { grid-template-columns: 1fr; }
  .db-member-layout { grid-template-columns: 1fr; }
}
@media (max-width: 767px) {
  .db-root { padding: 12px; }
  .db-summary { grid-template-columns: repeat(2, 1fr); }
  .db-team-grid { grid-template-columns: 1fr; }
}
```

- [ ] **Step 2: Commit**

```bash
git add pwa/src/portal/dashboard/dashboard.css
git commit -m "feat(dashboard-p6): add dashboard light theme CSS"
```

---

## Task 6: Widgets — TeamPulseGrid + UnassignedTaskList

**Files:**
- Create: `pwa/src/portal/dashboard/widgets/TeamPulseGrid.tsx`
- Create: `pwa/src/portal/dashboard/widgets/UnassignedTaskList.tsx`

- [ ] **Step 1: Write `TeamPulseGrid.tsx`**

```tsx
// pwa/src/portal/dashboard/widgets/TeamPulseGrid.tsx
import type { TeamMember } from "../api/portalDashboard";

const PDCA_CLASS: Record<string, string> = {
  PLAN: "db-tag--plan", DO: "db-tag--do",
  CHECK: "db-tag--check", ACT: "db-tag--act",
};

const AV_COLORS = [
  "linear-gradient(135deg,#22c55e,#16a34a)",
  "linear-gradient(135deg,#f59e0b,#d97706)",
  "linear-gradient(135deg,#a855f7,#7c3aed)",
  "linear-gradient(135deg,#0ea5e9,#0284c7)",
  "linear-gradient(135deg,#f43f5e,#e11d48)",
];

function initials(user: string): string {
  return user.split("@")[0].charAt(0).toUpperCase();
}

interface Props {
  members: TeamMember[];
  onHelp: (m: TeamMember) => void;
  onReview: (m: TeamMember) => void;
}

export function TeamPulseGrid({ members, onHelp, onReview }: Props) {
  if (members.length === 0) {
    return <div style={{ fontSize: 11, color: "#6b63a0", padding: "8px 0" }}>Semua anggota on track ✓</div>;
  }
  return (
    <div className="db-team-grid">
      {members.map((m, i) => (
        <div
          key={m.user}
          className={`db-member-card${m.status === "blocked" ? " db-member-card--blocked" : ""}`}
        >
          <div className="db-member-card__top">
            <div
              className="db-member-card__av"
              style={{ background: AV_COLORS[i % AV_COLORS.length] }}
            >
              {initials(m.user)}
            </div>
            <span className="db-member-card__name">{m.user.split("@")[0]}</span>
            <span className={`db-tag ${PDCA_CLASS[m.pdca_phase] ?? "db-tag--plan"}`}>
              {m.pdca_phase || "PLAN"}
            </span>
          </div>
          <div className="db-member-card__task">{m.task_title}</div>
          <div className="db-member-card__meta">
            {m.status === "blocked" && (
              <span className="db-tag db-tag--od">Blocked</span>
            )}
            {m.status === "overdue" && (
              <span className="db-tag db-tag--od">Overdue</span>
            )}
            {m.status === "blocked" && (
              <button className="db-btn-help" onClick={() => onHelp(m)}>Bantu</button>
            )}
            {m.kanban_status === "In Review" && (
              <button className="db-btn-review" onClick={() => onReview(m)}>Review</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Write `UnassignedTaskList.tsx`**

```tsx
// pwa/src/portal/dashboard/widgets/UnassignedTaskList.tsx
import type { UnassignedTask } from "../api/portalDashboard";

const PDCA_CLASS: Record<string, string> = {
  PLAN: "db-tag--plan", DO: "db-tag--do",
  CHECK: "db-tag--check", ACT: "db-tag--act",
};

interface Props {
  tasks: UnassignedTask[];
  onAssign: (task: UnassignedTask) => void;
}

export function UnassignedTaskList({ tasks, onAssign }: Props) {
  if (tasks.length === 0) {
    return <div style={{ fontSize: 11, color: "#6b63a0", padding: "8px 0" }}>Semua task sudah ter-assign ✓</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {tasks.map((t) => (
        <div key={t.name} className="db-unassigned-row">
          <span className={`db-tag ${PDCA_CLASS[t.pdca_phase] ?? "db-tag--plan"}`}>
            {t.pdca_phase || "PLAN"}
          </span>
          <span className="db-unassigned-row__text">{t.title}</span>
          {t.sprint && <span style={{ fontSize: 10, color: "#6b63a0" }}>{t.sprint}</span>}
          <button className="db-btn-assign" onClick={() => onAssign(t)}>Assign</button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add pwa/src/portal/dashboard/widgets/TeamPulseGrid.tsx pwa/src/portal/dashboard/widgets/UnassignedTaskList.tsx
git commit -m "feat(dashboard-p6): add TeamPulseGrid and UnassignedTaskList widgets"
```

---

## Task 7: Widgets — OkrProgressList + PortfolioList

**Files:**
- Create: `pwa/src/portal/dashboard/widgets/OkrProgressList.tsx`
- Create: `pwa/src/portal/dashboard/widgets/PortfolioList.tsx`

- [ ] **Step 1: Write `OkrProgressList.tsx`**

```tsx
// pwa/src/portal/dashboard/widgets/OkrProgressList.tsx
export interface OkrRow {
  name: string;
  title: string;
  progress_pct: number;
  trend_delta?: number;
}

interface Props { okrs: OkrRow[] }

export function OkrProgressList({ okrs }: Props) {
  if (okrs.length === 0) {
    return <div style={{ fontSize: 11, color: "#6b63a0" }}>Tidak ada OKR aktif</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {okrs.map((o) => {
        const atRisk = o.progress_pct < 30;
        const pctColor = o.progress_pct >= 70 ? "#7c3aed" : o.progress_pct >= 40 ? "#b45309" : "#dc2626";
        const barBg = o.progress_pct >= 70
          ? "linear-gradient(90deg,#6366f1,#7c3aed)"
          : o.progress_pct >= 40
          ? "linear-gradient(90deg,#f59e0b,#fbbf24)"
          : "linear-gradient(90deg,#ef4444,#f87171)";
        return (
          <div key={o.name} className={`db-okr-row${atRisk ? " db-okr-row--risk" : ""}`}>
            <div className="db-okr-row__top">
              <span className="db-okr-row__name">
                {atRisk && "🚨 "}{o.title}
              </span>
              <span className="db-okr-row__pct" style={{ color: pctColor }}>{o.progress_pct}%</span>
            </div>
            <div className="db-bar">
              <div className="db-bar__fill" style={{ width: `${o.progress_pct}%`, background: barBg }} />
            </div>
            {o.trend_delta !== undefined && (
              <div className="db-okr-row__trend">
                <span className={o.trend_delta >= 0 ? "db-trend-up" : "db-trend-dn"}>
                  {o.trend_delta >= 0 ? "↑" : "↓"} {Math.abs(o.trend_delta)}% minggu ini
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Write `PortfolioList.tsx`**

```tsx
// pwa/src/portal/dashboard/widgets/PortfolioList.tsx
import type { PortfolioProject } from "../api/portalDashboard";

const RAG_COLOR = { green: "#16a34a", amber: "#f59e0b", red: "#dc2626" } as const;

interface Props { projects: PortfolioProject[] }

export function PortfolioList({ projects }: Props) {
  if (projects.length === 0) {
    return <div style={{ fontSize: 11, color: "#6b63a0" }}>Tidak ada project aktif</div>;
  }
  return (
    <div>
      {projects.map((p) => (
        <div key={p.project} className="db-port-row">
          <div className={`db-port-dot db-port-dot--${p.rag}`} />
          <span className="db-port-name">{p.title}</span>
          {p.sprint_title && (
            <span className="db-port-sprint">
              {p.sprint_days_remaining != null ? `${p.sprint_days_remaining}h` : ""}
            </span>
          )}
          <div style={{ width: 56 }}>
            <div className="db-bar">
              <div
                className="db-bar__fill"
                style={{ width: `${p.progress_pct}%`, background: RAG_COLOR[p.rag] }}
              />
            </div>
          </div>
          <span className="db-port-pct" style={{ color: RAG_COLOR[p.rag] }}>{p.progress_pct}%</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add pwa/src/portal/dashboard/widgets/OkrProgressList.tsx pwa/src/portal/dashboard/widgets/PortfolioList.tsx
git commit -m "feat(dashboard-p6): add OkrProgressList and PortfolioList widgets"
```

---

## Task 8: Widgets — MyTaskList + TaskTimeline

**Files:**
- Create: `pwa/src/portal/dashboard/widgets/MyTaskList.tsx`
- Create: `pwa/src/portal/dashboard/widgets/TaskTimeline.tsx`

- [ ] **Step 1: Write `MyTaskList.tsx`**

```tsx
// pwa/src/portal/dashboard/widgets/MyTaskList.tsx
export interface MyTask {
  name: string;
  title: string;
  pdca_phase: string;
  kanban_status: string;
  deadline?: string;
}

const PDCA_CLASS: Record<string, string> = {
  PLAN: "db-tag--plan", DO: "db-tag--do",
  CHECK: "db-tag--check", ACT: "db-tag--act",
};

interface Props {
  tasks: MyTask[];
  onClickMore: () => void;
}

export function MyTaskList({ tasks, onClickMore }: Props) {
  const visible = tasks.slice(0, 5);
  const rest = tasks.length - 5;
  const today = new Date().toISOString().split("T")[0];

  return (
    <div>
      {visible.map((t) => {
        const done = t.kanban_status === "Done";
        const overdue = !done && t.deadline && t.deadline < today;
        return (
          <div
            key={t.name}
            className={`db-task-row${overdue ? " db-task-row--urgent" : ""}${done ? " db-task-row--done" : ""}`}
          >
            <div className={`db-task-check${done ? " db-task-check--done" : " db-task-check--active"}`}>
              {done && "✓"}
            </div>
            <span className={`db-task-text${done ? " db-task-text--done" : ""}`}>{t.title}</span>
            <div style={{ display: "flex", gap: 4 }}>
              {overdue && <span className="db-tag db-tag--od">Overdue</span>}
              <span className={`db-tag ${PDCA_CLASS[t.pdca_phase] ?? "db-tag--plan"}`}>
                {t.pdca_phase || "PLAN"}
              </span>
            </div>
          </div>
        );
      })}
      {rest > 0 && (
        <div className="db-task-more" onClick={onClickMore}>+{rest} task lainnya →</div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write `TaskTimeline.tsx`**

```tsx
// pwa/src/portal/dashboard/widgets/TaskTimeline.tsx
import type { TimelineTask } from "../api/portalDashboard";

interface Props {
  data: Record<string, TimelineTask[]>;
  daysBack?: number;
  daysForward?: number;
}

function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function fmtShort(d: Date): string {
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

const PDCA_BADGE: Record<string, { bg: string; color: string }> = {
  PLAN:  { bg: "#ede9fe", color: "#6d28d9" },
  DO:    { bg: "#f0fdf4", color: "#16a34a" },
  CHECK: { bg: "#fff7ed", color: "#c2410c" },
  ACT:   { bg: "#eff6ff", color: "#1d4ed8" },
};

export function TaskTimeline({ data, daysBack = 3, daysForward = 3 }: Props) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = isoDate(today);

  const cols: Array<{ date: string; label: string; rel: number }> = [];
  for (let i = -daysBack; i <= daysForward; i++) {
    const d = addDays(today, i);
    const dateStr = isoDate(d);
    let label: string;
    if (i === 0) label = "⚡ Hari Ini";
    else if (i === -1) label = "H-1";
    else if (i === 1) label = "H+1";
    else label = i < 0 ? `H${i}` : `H+${i}`;
    cols.push({ date: dateStr, label, rel: i });
  }

  return (
    <div className="db-timeline">
      {cols.map((col, idx) => {
        const isPast = col.rel < 0;
        const isToday = col.rel === 0;
        const tasks = data[col.date] ?? [];
        const colClass = `db-tl-col${isPast ? " db-tl-col--past" : isToday ? " db-tl-col--today" : ""}`;
        const divClass = `db-tl-div${isToday || col.rel === 1 ? " db-tl-div--now" : ""}`;

        return (
          <div key={col.date} style={{ display: "contents" }}>
            <div className={colClass}>
              <div className="db-tl-col__head">
                <div className="db-tl-col__eyebrow">{col.label}</div>
                <div className="db-tl-col__date">{fmtShort(addDays(today, col.rel))}</div>
              </div>
              {tasks.map((t) => {
                const badge = PDCA_BADGE[t.pdca_phase] ?? PDCA_BADGE["PLAN"];
                const tcClass = `db-tc${isPast && !t.done ? " db-tc--overdue" : isToday ? " db-tc--today" : ""}${t.done ? " db-tc--done" : ""}`;
                const dotColor = isPast && !t.done ? "#dc2626" : isToday ? "#7c3aed" : "#6366f1";
                return (
                  <div key={t.id} className={tcClass}>
                    <span className="db-tc__dot" style={{ background: dotColor }} />
                    <span className="db-tc__text" title={t.title}>{t.title}</span>
                    <span
                      className="db-tc__badge"
                      style={{ background: badge.bg, color: badge.color }}
                    >
                      {t.pdca_phase || "PLAN"}
                    </span>
                  </div>
                );
              })}
            </div>
            {idx < cols.length - 1 && <div className={divClass} />}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
cd /workspace/apps/vernon_tasks/pwa && tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add pwa/src/portal/dashboard/widgets/
git commit -m "feat(dashboard-p6): add MyTaskList and TaskTimeline widgets"
```

---

## Task 9: Section Components

**Files:**
- Create: `pwa/src/portal/dashboard/sections/LeaderSection.tsx`
- Create: `pwa/src/portal/dashboard/sections/OwnerSection.tsx`
- Create: `pwa/src/portal/dashboard/sections/MemberSection.tsx`

- [ ] **Step 1: Write `LeaderSection.tsx`**

```tsx
// pwa/src/portal/dashboard/sections/LeaderSection.tsx
import { useTeamPulse } from "../hooks/useTeamPulse";
import { useUnassignedTasks } from "../hooks/useUnassignedTasks";
import { TeamPulseGrid } from "../widgets/TeamPulseGrid";
import { UnassignedTaskList } from "../widgets/UnassignedTaskList";
import type { TeamMember, UnassignedTask } from "../api/portalDashboard";

interface Props {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onHelp: (m: TeamMember) => void;
  onReview: (m: TeamMember) => void;
  onAssign: (t: UnassignedTask) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLSpanElement>;
}

export function LeaderSection({ collapsed, onToggleCollapse, onHelp, onReview, onAssign, dragHandleProps }: Props) {
  const pulse = useTeamPulse();
  const unassigned = useUnassignedTasks();

  const blockedCount = pulse.data?.filter((m) => m.status === "blocked").length ?? 0;
  const unassignedCount = unassigned.data?.length ?? 0;

  return (
    <>
      <div className="db-section__strip db-section__strip--leader" />
      <div className="db-section__header" onClick={onToggleCollapse}>
        <span className="db-section__drag" {...dragHandleProps}>⠿</span>
        <span className="db-section__icon">🎯</span>
        <div>
          <div className="db-section__title">As Project Leader</div>
          <div className="db-section__subtitle">Selesaikan dulu — keputusan kamu blok orang lain</div>
        </div>
        <div className="db-section__badges">
          {blockedCount > 0 && (
            <span className="db-badge db-badge--red">{blockedCount} Blocked</span>
          )}
          {unassignedCount > 0 && (
            <span className="db-badge db-badge--amber">{unassignedCount} Unassigned</span>
          )}
        </div>
        <span className={`db-section__collapse${collapsed ? " db-section__collapse--collapsed" : ""}`}>▾</span>
      </div>
      <div className={`db-section__body${collapsed ? " db-section__body--hidden" : ""}`}>
        <div className="db-sub-label">👥 Team Pulse</div>
        {pulse.isLoading ? (
          <div style={{ fontSize: 11, color: "#6b63a0" }}>Memuat…</div>
        ) : (
          <TeamPulseGrid
            members={pulse.data ?? []}
            onHelp={onHelp}
            onReview={onReview}
          />
        )}
        <div className="db-sub-label" style={{ marginTop: 4 }}>📥 Unassigned Tasks</div>
        {unassigned.isLoading ? (
          <div style={{ fontSize: 11, color: "#6b63a0" }}>Memuat…</div>
        ) : (
          <UnassignedTaskList tasks={unassigned.data ?? []} onAssign={onAssign} />
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Write `OwnerSection.tsx`**

```tsx
// pwa/src/portal/dashboard/sections/OwnerSection.tsx
import { usePortfolioSummary } from "../hooks/usePortfolioSummary";
import { OkrProgressList } from "../widgets/OkrProgressList";
import { PortfolioList } from "../widgets/PortfolioList";
import type { OkrRow } from "../widgets/OkrProgressList";

interface Props {
  okrs: OkrRow[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLSpanElement>;
}

export function OwnerSection({ okrs, collapsed, onToggleCollapse, dragHandleProps }: Props) {
  const portfolio = usePortfolioSummary();
  const atRisk = okrs.filter((o) => o.progress_pct < 30).length;
  const avgOkr = okrs.length
    ? Math.round(okrs.reduce((s, o) => s + o.progress_pct, 0) / okrs.length)
    : 0;

  return (
    <>
      <div className="db-section__strip db-section__strip--owner" />
      <div className="db-section__header" onClick={onToggleCollapse}>
        <span className="db-section__drag" {...dragHandleProps}>⠿</span>
        <span className="db-section__icon">👑</span>
        <div>
          <div className="db-section__title">As Project Owner</div>
          <div className="db-section__subtitle">Cek OKR & portofolio — arah strategis</div>
        </div>
        <div className="db-section__badges">
          {atRisk > 0 && <span className="db-badge db-badge--red">{atRisk} At Risk</span>}
          <span className="db-badge db-badge--purple">OKR {avgOkr}%</span>
        </div>
        <span className={`db-section__collapse${collapsed ? " db-section__collapse--collapsed" : ""}`}>▾</span>
      </div>
      <div className={`db-section__body${collapsed ? " db-section__body--hidden" : ""}`}>
        <div className="db-owner-grid">
          <div>
            <div className="db-sub-label">🎯 OKR Progress + Trend</div>
            <OkrProgressList okrs={okrs} />
          </div>
          <div>
            <div className="db-sub-label">📁 Project Portfolio</div>
            {portfolio.isLoading ? (
              <div style={{ fontSize: 11, color: "#6b63a0" }}>Memuat…</div>
            ) : (
              <PortfolioList projects={portfolio.data ?? []} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Write `MemberSection.tsx`**

```tsx
// pwa/src/portal/dashboard/sections/MemberSection.tsx
import { useMyTasksTimeline } from "../hooks/useMyTasksTimeline";
import { MyTaskList } from "../widgets/MyTaskList";
import { TaskTimeline } from "../widgets/TaskTimeline";
import type { MyTask } from "../widgets/MyTaskList";
import { useNavigate } from "react-router-dom";

interface Props {
  tasks: MyTask[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLSpanElement>;
}

export function MemberSection({ tasks, collapsed, onToggleCollapse, dragHandleProps }: Props) {
  const timeline = useMyTasksTimeline(3, 3);
  const navigate = useNavigate();
  const overdueCount = tasks.filter((t) => {
    const today = new Date().toISOString().split("T")[0];
    return t.kanban_status !== "Done" && t.deadline && t.deadline < today;
  }).length;

  return (
    <>
      <div className="db-section__strip db-section__strip--member" />
      <div className="db-section__header" onClick={onToggleCollapse}>
        <span className="db-section__drag" {...dragHandleProps}>⠿</span>
        <span className="db-section__icon">⚡</span>
        <div>
          <div className="db-section__title">As Project Member</div>
          <div className="db-section__subtitle">Task saya — kerjakan setelah tim & portfolio aman</div>
        </div>
        <div className="db-section__badges">
          {overdueCount > 0 && (
            <span className="db-badge db-badge--red">{overdueCount} Overdue</span>
          )}
          <span className="db-badge db-badge--green">{tasks.length} Tasks</span>
        </div>
        <span className={`db-section__collapse${collapsed ? " db-section__collapse--collapsed" : ""}`}>▾</span>
      </div>
      <div className={`db-section__body${collapsed ? " db-section__body--hidden" : ""}`}>
        <div className="db-member-layout">
          <div>
            <div className="db-sub-label">📋 My Tasks</div>
            <MyTaskList
              tasks={tasks}
              onClickMore={() => navigate("/portal/projects")}
            />
          </div>
          <div>
            <div className="db-sub-label">📅 Timeline 7 Hari</div>
            {timeline.isLoading ? (
              <div style={{ fontSize: 11, color: "#6b63a0" }}>Memuat…</div>
            ) : (
              <TaskTimeline data={timeline.data ?? {}} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 4: TypeScript check**

```bash
cd /workspace/apps/vernon_tasks/pwa && tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add pwa/src/portal/dashboard/sections/
git commit -m "feat(dashboard-p6): add LeaderSection, OwnerSection, MemberSection"
```

---

## Task 10: SummaryBar Component

**Files:**
- Create: `pwa/src/portal/dashboard/SummaryBar.tsx`
- Create: `pwa/src/portal/dashboard/SummaryBar.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// pwa/src/portal/dashboard/SummaryBar.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SummaryBar } from "./SummaryBar";

describe("SummaryBar", () => {
  it("renders all 5 stats for leader role", () => {
    render(
      <SummaryBar
        summary={{ team_blocked: 2, unassigned_tasks: 3, okr_progress: 73, my_overdue: 5, sprint_days_remaining: 3 }}
        isLeader
      />
    );
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("hides team stats for non-leader", () => {
    render(
      <SummaryBar
        summary={{ team_blocked: 0, unassigned_tasks: 0, okr_progress: 73, my_overdue: 5, sprint_days_remaining: 3 }}
        isLeader={false}
      />
    );
    expect(screen.queryByText("Team Blocked")).not.toBeInTheDocument();
    expect(screen.queryByText("Unassigned")).not.toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd /workspace/apps/vernon_tasks/pwa && npx vitest run src/portal/dashboard/SummaryBar.test.tsx
```

- [ ] **Step 3: Write `SummaryBar.tsx`**

```tsx
// pwa/src/portal/dashboard/SummaryBar.tsx
import type { DashboardSummary } from "./api/portalDashboard";

interface Props {
  summary: DashboardSummary;
  isLeader: boolean;
}

export function SummaryBar({ summary, isLeader }: Props) {
  return (
    <div className="db-summary">
      {isLeader && (
        <>
          <div className="db-stat">
            <div className="db-stat__label">Team Blocked</div>
            <div className={`db-stat__value${summary.team_blocked > 0 ? " db-stat__value--bad" : ""}`}>
              {summary.team_blocked}
            </div>
            <div className="db-stat__sub">perlu tindakan segera</div>
          </div>
          <div className="db-stat">
            <div className="db-stat__label">Unassigned</div>
            <div className={`db-stat__value${summary.unassigned_tasks > 0 ? " db-stat__value--warn" : ""}`}>
              {summary.unassigned_tasks}
            </div>
            <div className="db-stat__sub">task belum didelegasi</div>
          </div>
        </>
      )}
      <div className="db-stat">
        <div className="db-stat__label">OKR Org</div>
        <div className="db-stat__value db-stat__value--grad">{summary.okr_progress}%</div>
        <div className="db-stat__sub">progress keseluruhan</div>
      </div>
      <div className="db-stat">
        <div className="db-stat__label">Overdue Saya</div>
        <div className={`db-stat__value${summary.my_overdue > 0 ? " db-stat__value--bad" : " db-stat__value--good"}`}>
          {summary.my_overdue}
        </div>
        <div className="db-stat__sub">task perlu diselesaikan</div>
      </div>
      <div className="db-stat">
        <div className="db-stat__label">Sprint</div>
        <div className={`db-stat__value${summary.sprint_days_remaining <= 2 ? " db-stat__value--warn" : ""}`}>
          {summary.sprint_days_remaining}
        </div>
        <div className="db-stat__sub">hari tersisa</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd /workspace/apps/vernon_tasks/pwa && npx vitest run src/portal/dashboard/SummaryBar.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add pwa/src/portal/dashboard/SummaryBar.tsx pwa/src/portal/dashboard/SummaryBar.test.tsx
git commit -m "feat(dashboard-p6): add SummaryBar component with role-aware display"
```

---

## Task 11: DashboardPage — main assembly + drag-reorder

**Files:**
- Create: `pwa/src/portal/dashboard/DashboardPage.tsx`
- Create: `pwa/src/portal/dashboard/DashboardPage.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// pwa/src/portal/dashboard/DashboardPage.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DashboardPage } from "./DashboardPage";
import * as permsHook from "../../auth/usePermissions";
import * as dashApi from "./api/portalDashboard";

function wrap() {
  vi.spyOn(permsHook, "usePermissions").mockReturnValue({
    isLoading: false,
    permissions: ["okr.read", "project.read", "report.read"],
    roles: ["VT Manager"],
    hasPermission: () => true,
    hasAnyPermission: () => true,
    hasRole: (r: string) => r === "VT Manager",
  });
  vi.spyOn(dashApi.portalDashboardApi, "getSummary").mockResolvedValue({
    team_blocked: 2, unassigned_tasks: 3, okr_progress: 73, my_overdue: 1, sprint_days_remaining: 3,
  });
  vi.spyOn(dashApi.portalDashboardApi, "getTeamPulse").mockResolvedValue([]);
  vi.spyOn(dashApi.portalDashboardApi, "getUnassignedTasks").mockResolvedValue([]);
  vi.spyOn(dashApi.portalDashboardApi, "getMyTasksTimeline").mockResolvedValue({});
  vi.spyOn(dashApi.portalDashboardApi, "getPortfolioSummary").mockResolvedValue([]);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("DashboardPage", () => {
  it("shows Leader section for VT Manager role", async () => {
    wrap();
    await waitFor(() =>
      expect(screen.getByText("As Project Leader")).toBeInTheDocument()
    );
  });

  it("shows Owner section for VT Manager role", async () => {
    wrap();
    await waitFor(() =>
      expect(screen.getByText("As Project Owner")).toBeInTheDocument()
    );
  });

  it("always shows Member section", async () => {
    wrap();
    await waitFor(() =>
      expect(screen.getByText("As Project Member")).toBeInTheDocument()
    );
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd /workspace/apps/vernon_tasks/pwa && npx vitest run src/portal/dashboard/DashboardPage.test.tsx
```

- [ ] **Step 3: Write `DashboardPage.tsx`**

```tsx
// pwa/src/portal/dashboard/DashboardPage.tsx
import { useState, useCallback } from "react";
import { usePermissions } from "../../auth/usePermissions";
import { useDashboardSummary } from "./hooks/useDashboardSummary";
import { getSectionOrder, saveSectionOrder, type SectionId } from "./hooks/useSectionOrder";
import { getCollapseState, toggleCollapseState } from "./hooks/useSectionCollapse";
import { SummaryBar } from "./SummaryBar";
import { LeaderSection } from "./sections/LeaderSection";
import { OwnerSection } from "./sections/OwnerSection";
import { MemberSection } from "./sections/MemberSection";
import type { TeamMember, UnassignedTask } from "./api/portalDashboard";
import "./dashboard.css";

const LEADER_ROLES = new Set(["VT Manager", "VT Leader", "System Manager"]);
const OWNER_ROLES  = new Set(["VT Manager", "System Manager"]);

export function DashboardPage() {
  const { roles } = usePermissions();
  const roleSet = new Set(roles);
  const isLeader = roles.some((r) => LEADER_ROLES.has(r));
  const isOwner  = roles.some((r) => OWNER_ROLES.has(r));

  const summary = useDashboardSummary();
  const [order, setOrder] = useState<SectionId[]>(getSectionOrder);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(getCollapseState);
  const [dragOver, setDragOver] = useState<SectionId | null>(null);
  const [dragging, setDragging] = useState<SectionId | null>(null);

  const handleToggleCollapse = useCallback((id: SectionId) => {
    const next = toggleCollapseState(id);
    setCollapsed((prev) => ({ ...prev, [id]: next }));
  }, []);

  const handleDragStart = (id: SectionId) => setDragging(id);
  const handleDragOver = (id: SectionId) => (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(id);
  };
  const handleDrop = (target: SectionId) => {
    if (!dragging || dragging === target) { setDragging(null); setDragOver(null); return; }
    const next = [...order];
    const fromIdx = next.indexOf(dragging);
    const toIdx   = next.indexOf(target);
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, dragging);
    setOrder(next);
    saveSectionOrder(next);
    setDragging(null);
    setDragOver(null);
  };
  const handleDragEnd = () => { setDragging(null); setDragOver(null); };

  const visibleOrder = order.filter((id) => {
    if (id === "leader") return isLeader;
    if (id === "owner")  return isOwner;
    return true; // member always visible
  });

  // placeholder okrs (OKR hook from existing portal)
  const okrs: { name: string; title: string; progress_pct: number; trend_delta?: number }[] = [];

  return (
    <div className="db-root">
      {summary.data && (
        <SummaryBar summary={summary.data} isLeader={isLeader} />
      )}

      <div className="db-drag-hint">⠿ Drag section untuk ubah urutan</div>

      {visibleOrder.map((id) => (
        <div
          key={id}
          className={`db-section${dragging === id ? " db-section--dragging" : ""}${dragOver === id ? " db-section--drag-over" : ""}`}
          draggable
          onDragStart={() => handleDragStart(id)}
          onDragOver={handleDragOver(id)}
          onDrop={() => handleDrop(id)}
          onDragEnd={handleDragEnd}
        >
          {id === "leader" && isLeader && (
            <LeaderSection
              collapsed={!!collapsed.leader}
              onToggleCollapse={() => handleToggleCollapse("leader")}
              onHelp={(m: TeamMember) => window.open(`/portal/projects?task=${m.task_id}`, "_self")}
              onReview={(m: TeamMember) => window.open(`/portal/projects?task=${m.task_id}`, "_self")}
              onAssign={(_t: UnassignedTask) => { /* open assign modal — TODO in P6.2 */ }}
            />
          )}
          {id === "owner" && isOwner && (
            <OwnerSection
              okrs={okrs}
              collapsed={!!collapsed.owner}
              onToggleCollapse={() => handleToggleCollapse("owner")}
            />
          )}
          {id === "member" && (
            <MemberSection
              tasks={[]}
              collapsed={!!collapsed.member}
              onToggleCollapse={() => handleToggleCollapse("member")}
            />
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd /workspace/apps/vernon_tasks/pwa && npx vitest run src/portal/dashboard/DashboardPage.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add pwa/src/portal/dashboard/DashboardPage.tsx pwa/src/portal/dashboard/DashboardPage.test.tsx
git commit -m "feat(dashboard-p6): assemble DashboardPage with drag-reorder and collapse"
```

---

## Task 12: Wire up — replace placeholder Dashboard

**Files:**
- Modify: `pwa/src/portal/pages/Dashboard.tsx`
- Modify: `pwa/src/portal/routes.tsx`

- [ ] **Step 1: Replace `pages/Dashboard.tsx`**

```tsx
// pwa/src/portal/pages/Dashboard.tsx
export { DashboardPage as Dashboard } from "../dashboard/DashboardPage";
```

- [ ] **Step 2: Add feature flag gate in `routes.tsx`**

```tsx
// pwa/src/portal/routes.tsx
// Add at top imports:
import { DashboardV2Gate } from "./dashboard/DashboardV2Gate";

// Replace the <Route index element={<Dashboard />} /> line with:
<Route index element={<DashboardV2Gate />} />
```

Create gate component:

```tsx
// pwa/src/portal/dashboard/DashboardV2Gate.tsx
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { DashboardPage } from "./DashboardPage";
import { Dashboard as DashboardLegacy } from "../pages/Dashboard";

export function DashboardV2Gate() {
  const flag = useQuery({
    queryKey: ["settings", "dashboard_v2"],
    queryFn: () =>
      api.get<{ portal_dashboard_v2_enabled: 0 | 1 }>(
        "/api/method/frappe.client.get_value",
        { doctype: "VT Settings", fieldname: "portal_dashboard_v2_enabled" }
      ),
    staleTime: 5 * 60_000,
  });

  if (flag.data?.portal_dashboard_v2_enabled === 1) {
    return <DashboardPage />;
  }
  return <DashboardLegacy />;
}
```

- [ ] **Step 3: Add `portal_dashboard_v2_enabled` field to VT Settings DocType**

In Frappe: open `VT Settings` DocType in desk → Add field `portal_dashboard_v2_enabled` (Check, default 0, label "Enable Portal Dashboard V2").

Or via JSON (append to `vernon_tasks/fixtures/vt_settings_fields.json` if it exists, else add to DocType JSON directly):

```bash
# Check where VT Settings doctype json lives
find /workspace/apps/vernon_tasks -name "VT Settings*" -type f 2>/dev/null
```

Add the field in the DocType JSON under `fields` array:

```json
{
  "fieldname": "portal_dashboard_v2_enabled",
  "fieldtype": "Check",
  "label": "Enable Portal Dashboard V2",
  "default": "0"
}
```

Then migrate:
```bash
bench --site erp.localhost migrate
```

- [ ] **Step 4: TypeScript check + test suite**

```bash
cd /workspace/apps/vernon_tasks/pwa && tsc --noEmit && npx vitest run
```
Expected: 0 errors, all tests pass

- [ ] **Step 5: Commit**

```bash
git add pwa/src/portal/pages/Dashboard.tsx pwa/src/portal/routes.tsx pwa/src/portal/dashboard/DashboardV2Gate.tsx
git commit -m "feat(dashboard-p6): wire DashboardPage via feature flag gate"
```

---

## Task 13: Build + Integration Verification

- [ ] **Step 1: Build PWA**

```bash
cd /workspace/apps/vernon_tasks/pwa && tsc --noEmit && vite build
```
Expected: build success, no TS errors

- [ ] **Step 2: Run all Python tests**

```bash
bench --site erp.localhost run-tests --app vernon_tasks --module vernon_tasks.api.test_portal_dashboard
```
Expected: all pass

- [ ] **Step 3: Enable flag and verify**

```bash
bench --site erp.localhost console
# In console:
frappe.db.set_value("VT Settings", "VT Settings", "portal_dashboard_v2_enabled", 1)
frappe.db.commit()
```

Navigate to `/portal` — should show DashboardPage v2 with all three sections.

- [ ] **Step 4: Final commit**

```bash
git add -p
git commit -m "feat(dashboard-p6): portal dashboard v2 complete — role-aware sections, timeline, drag-reorder"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Summary bar 5 metrics | Task 10 (SummaryBar) |
| Team Pulse widget | Task 6 (TeamPulseGrid) |
| Unassigned Tasks | Task 6 (UnassignedTaskList) |
| OKR Progress + Trend | Task 7 (OkrProgressList) |
| Portfolio RAG | Task 7 (PortfolioList) |
| My Tasks list | Task 8 (MyTaskList) |
| Timeline H-3..H+3 | Task 8 (TaskTimeline) |
| Drag-reorder sections | Task 11 (DashboardPage) |
| Collapse/expand | Task 11 (DashboardPage) |
| localStorage persistence | Task 4 (useSectionOrder, useSectionCollapse) |
| Feature flag gate | Task 12 (DashboardV2Gate) |
| Backend get_summary | Task 1 |
| Backend get_team_pulse | Task 2 |
| Backend get_unassigned_tasks | Task 2 |
| Backend get_my_tasks_timeline | Task 3 |
| Backend get_portfolio_summary | Task 3 |
| Light glassmorphism CSS | Task 5 |
| Responsive breakpoints | Task 5 |
| Python integration tests | Tasks 1-3 |
| Frontend unit tests | Tasks 10, 11 |

**Gaps found and resolved:**
- `DashboardV2Gate` needed as bridge — added in Task 12
- OKR data in `OwnerSection` uses placeholder `[]` — real data comes from existing `useObjectives` hook; wiring to full OKR list is deferred to P6.3 (specified in open questions Q1)
- `onAssign` in LeaderSection marks TODO for modal — this is P6.2 scope, noted in code

**Type consistency:** `DashboardSummary`, `TeamMember`, `UnassignedTask`, `TimelineTask`, `PortfolioProject` all defined once in `portalDashboard.ts` and imported everywhere. `OkrRow` defined in `OkrProgressList.tsx` since it's a display-only type.

**Placeholder scan:** No "TBD" or incomplete steps. All code blocks complete. Commands include expected output.

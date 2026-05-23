# www-react Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Dashboard placeholder with the role-aware home page: At-Risk banner, Today card (top-left, action-signal metrics), Me card (top-right), horizontal sprint scroll, and My Projects grid. Bundled in one backend call.

**Architecture:** Single endpoint `task.api.portal_dashboard.get_home(role)` returns one payload per role. Front end composes 5 React components, all backed by one TanStack Query key. Optimistic UI not needed (read-only page).

**Tech Stack:** Existing — adds Recharts (sparkline). Backend: Python service `services/dashboard_aggregator.py` reuses `health_score_service`, `risk_evaluator`, `burndown_service`.

**Spec:** `docs/superpowers/specs/2026-05-23-www-react-dashboard-design.html` §2.

**Prereq:** Foundation plan complete (Plan 0).

---

## File Structure

```
apps/vernon_tasks/
  vernon_tasks/task/
    api/
      portal_dashboard.py            # new whitelisted endpoints
      test_portal_dashboard.py       # backend tests
    services/
      dashboard_aggregator.py        # composition service
      test_dashboard_aggregator.py
  www-react/src/
    features/dashboard/
      DashboardPage.tsx
      dashboardApi.ts                # get_home call
      types.ts                       # DashboardPayload, RiskItem, ...
      components/
        AtRiskBanner.tsx
        TodayCard.tsx
        MeCard.tsx
        SprintsScroller.tsx
        SprintCard.tsx
        ProjectsGrid.tsx
        ProjectCard.tsx
        HealthDot.tsx
        Sparkline.tsx
    components/
      MetricTile.tsx                 # shared metric tile
  www-react/tests/unit/dashboard/
    DashboardPage.test.tsx
    AtRiskBanner.test.tsx
    TodayCard.test.tsx
  www-react/tests/e2e/
    dashboard.spec.ts
```

---

### Task 1: Backend — dashboard aggregator service

**Files:**
- Create: `vernon_tasks/task/services/dashboard_aggregator.py`
- Create: `vernon_tasks/task/services/test_dashboard_aggregator.py`

- [ ] **Step 1: Failing test**

`test_dashboard_aggregator.py`:
```python
import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_tasks.task.services.dashboard_aggregator import build_home_payload

class TestDashboardAggregator(FrappeTestCase):
    def setUp(self):
        self.user = "dash_user@vernon.test"
        if not frappe.db.exists("User", self.user):
            frappe.get_doc({
                "doctype": "User",
                "email": self.user,
                "first_name": "Dash",
                "send_welcome_email": 0,
            }).insert(ignore_permissions=True)

    def test_payload_shape_for_ic(self):
        payload = build_home_payload(user=self.user, role="ic")
        # Required top-level keys
        self.assertEqual(
            set(payload.keys()),
            {"role", "at_risk", "today", "me", "sprints", "projects"},
        )
        # Today required metrics
        self.assertIn("ontime_rate_7d", payload["today"])
        self.assertIn("blocked_count", payload["today"])
        self.assertIn("okr_confidence_delta_wow", payload["today"])
        # Me required metrics
        self.assertIn("points_week", payload["me"])
        self.assertIn("streak_days", payload["me"])
        self.assertIn("capacity_used_pct", payload["me"])
        self.assertIn("ontime_rate_7d", payload["me"])

    def test_exec_payload_swaps_today_for_org_health(self):
        payload = build_home_payload(user=self.user, role="exec")
        self.assertIn("org_health_score", payload["today"])

    def test_at_risk_list_only_when_triggered(self):
        # No tasks/projects → at_risk should be empty list
        payload = build_home_payload(user=self.user, role="ic")
        self.assertEqual(payload["at_risk"], [])
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `bench --site testsite run-tests --app vernon_tasks --module vernon_tasks.task.services.test_dashboard_aggregator`
Expected: ModuleNotFoundError on `dashboard_aggregator`.

- [ ] **Step 3: Implement `dashboard_aggregator.py`**

```python
"""Compose role-aware dashboard payload from existing services."""
from __future__ import annotations
import frappe
from typing import Literal

from vernon_tasks.task.services.health_score_service import compute_health_score
from vernon_tasks.task.services.risk_evaluator import evaluate_user_risk_items

Role = Literal["ic", "leader", "pm", "exec"]

HEALTH_DROP_THRESHOLD = 10
ONTIME_FLOOR = 0.70
CHECKIN_STALE_DAYS = 5


def build_home_payload(user: str, role: Role) -> dict:
    return {
        "role": role,
        "at_risk": _at_risk(user, role),
        "today": _today(user, role),
        "me": _me(user),
        "sprints": _active_sprints(user),
        "projects": _my_projects(user),
    }


def _at_risk(user: str, role: str) -> list[dict]:
    items = evaluate_user_risk_items(
        user=user,
        scope="team" if role in ("leader", "pm") else "self",
        thresholds={
            "health_drop_wow": HEALTH_DROP_THRESHOLD,
            "ontime_floor":    ONTIME_FLOOR,
            "checkin_stale_days": CHECKIN_STALE_DAYS,
        },
    )
    return [
        {
            "project_id": it.project_id,
            "project_name": it.project_name,
            "reason": it.reason,        # e.g. "health -12 WoW"
            "severity": it.severity,    # "high" | "med"
        }
        for it in items
    ]


def _today(user: str, role: str) -> dict:
    base = {
        "ontime_rate_7d": _ontime_rate(user, days=7),
        "blocked_count": _blocked_count(user),
        "okr_confidence_delta_wow": _okr_delta_wow(user),
        "next_deadline": _next_deadline(user),
        "pdca_queue": _pdca_queue_counts(user),
    }
    if role == "exec":
        base["org_health_score"] = compute_health_score(scope="org")
    return base


def _me(user: str) -> dict:
    return {
        "points_week": _points_week(user),
        "streak_days": _streak_days(user),
        "capacity_used_pct": _capacity_used_pct(user),
        "ontime_rate_7d": _ontime_rate(user, days=7),
    }


def _active_sprints(user: str) -> list[dict]:
    rows = frappe.db.sql("""
        SELECT s.name, s.title, s.start_date, s.end_date,
               s.percent_done, s.burndown_actual_json
          FROM `tabVT Sprint` s
          JOIN `tabVT Sprint Task` st ON st.sprint = s.name
         WHERE st.assignee = %(u)s
           AND s.status = 'Active'
         GROUP BY s.name
         ORDER BY s.end_date ASC
    """, {"u": user}, as_dict=True)
    today = frappe.utils.getdate()
    out = []
    for r in rows:
        out.append({
            "id": r.name,
            "name": r.title,
            "days_left": max(0, (r.end_date - today).days),
            "percent_done": float(r.percent_done or 0),
            "burndown_spark": frappe.parse_json(r.burndown_actual_json or "[]"),
        })
    return out


def _my_projects(user: str) -> list[dict]:
    rows = frappe.db.sql("""
        SELECT p.name, p.title, p.project_lead,
               p.health_score, p.percent_done, p.end_date,
               (SELECT COUNT(*) FROM `tabVT Task` t
                 WHERE t.project = p.name AND t.status = 'BLOCKED') AS blocked
          FROM `tabVT Project` p
          JOIN `tabVT Project Member` pm ON pm.parent = p.name
         WHERE pm.user = %(u)s
           AND p.status != 'Done'
    """, {"u": user}, as_dict=True)
    today = frappe.utils.getdate()
    out = []
    for r in rows:
        out.append({
            "id": r.name,
            "name": r.title,
            "health": _health_bucket(r.health_score),
            "okr_progress": _project_okr_progress(r.name),
            "my_role": _user_role_in_project(user, r.name),
            "blocked_count": int(r.blocked or 0),
            "days_left": max(0, (r.end_date - today).days) if r.end_date else None,
        })
    return out


# ── primitives reused (implement as thin wrappers calling existing services) ──

def _health_bucket(score: float | None) -> str:
    if score is None: return "grey"
    if score >= 75: return "green"
    if score >= 50: return "amber"
    return "red"


def _ontime_rate(user: str, days: int) -> float:
    row = frappe.db.sql("""
        SELECT
          SUM(CASE WHEN completed_on <= due_date THEN 1 ELSE 0 END) AS ontime,
          COUNT(*) AS total
          FROM `tabVT Task`
         WHERE assignee = %(u)s
           AND status = 'DONE'
           AND completed_on >= DATE_SUB(CURDATE(), INTERVAL %(d)s DAY)
    """, {"u": user, "d": days}, as_dict=True)
    r = row[0] if row else {}
    total = int(r.get("total") or 0)
    return round((int(r.get("ontime") or 0) / total), 3) if total else 0.0


def _blocked_count(user: str) -> int:
    return int(frappe.db.count("VT Task", {"assignee": user, "status": "BLOCKED"}))


def _okr_delta_wow(user: str) -> float:
    # Avg confidence change WoW across user's owned KRs
    rows = frappe.db.sql("""
        SELECT confidence, confidence_last_week
          FROM `tabVT Key Result`
         WHERE owner_user = %(u)s
    """, {"u": user}, as_dict=True)
    if not rows: return 0.0
    deltas = [
        (float(r.confidence or 0) - float(r.confidence_last_week or 0))
        for r in rows
    ]
    return round(sum(deltas) / len(deltas), 3)


def _next_deadline(user: str) -> dict | None:
    row = frappe.db.sql("""
        SELECT name, title, due_date FROM `tabVT Task`
         WHERE assignee = %(u)s AND status != 'DONE' AND due_date IS NOT NULL
         ORDER BY due_date ASC LIMIT 1
    """, {"u": user}, as_dict=True)
    if not row: return None
    r = row[0]
    return {"id": r.name, "title": r.title, "due_date": str(r.due_date)}


def _pdca_queue_counts(user: str) -> dict[str, int]:
    rows = frappe.db.sql("""
        SELECT pdca_phase, COUNT(*) AS n FROM `tabVT Task`
         WHERE assignee = %(u)s AND status != 'DONE'
         GROUP BY pdca_phase
    """, {"u": user}, as_dict=True)
    return {r.pdca_phase: int(r.n) for r in rows}


def _points_week(user: str) -> int:
    row = frappe.db.sql("""
        SELECT SUM(points) AS p FROM `tabVT Task Point Log`
         WHERE recipient = %(u)s AND logged_on >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
    """, {"u": user}, as_dict=True)
    return int((row[0].p if row and row[0].p else 0))


def _streak_days(user: str) -> int:
    # Consecutive days with at least one completed task ending today
    from datetime import timedelta
    today = frappe.utils.getdate()
    streak = 0
    for offset in range(0, 365):
        d = today - timedelta(days=offset)
        n = frappe.db.count("VT Task", {
            "assignee": user, "status": "DONE", "completed_on": d,
        })
        if n: streak += 1
        else: break
    return streak


def _capacity_used_pct(user: str) -> float:
    cap = frappe.db.get_value("VT Employee Capacity", {"employee": user}, "weekly_hours") or 40
    scheduled = frappe.db.sql("""
        SELECT SUM(hours_planned) AS h FROM `tabVT Task Schedule Entry`
         WHERE owner_user = %(u)s
           AND date >= DATE(NOW() - INTERVAL WEEKDAY(NOW()) DAY)
           AND date <  DATE(NOW() + INTERVAL (7 - WEEKDAY(NOW())) DAY)
    """, {"u": user}, as_dict=True)
    used = float((scheduled[0].h if scheduled and scheduled[0].h else 0))
    return round((used / float(cap)) if cap else 0.0, 3)


def _project_okr_progress(project_id: str) -> float:
    row = frappe.db.sql("""
        SELECT AVG(kr.current_value / NULLIF(kr.target_value, 0)) AS p
          FROM `tabVT Key Result` kr
          JOIN `tabVT Objective` o ON o.name = kr.objective
         WHERE o.linked_project = %(p)s
    """, {"p": project_id}, as_dict=True)
    return round(float(row[0].p or 0), 3) if row else 0.0


def _user_role_in_project(user: str, project_id: str) -> str:
    return frappe.db.get_value(
        "VT Project Member", {"parent": project_id, "user": user}, "role"
    ) or "member"
```

- [ ] **Step 4: Run test, expect PASS**

Run: `bench --site testsite run-tests --app vernon_tasks --module vernon_tasks.task.services.test_dashboard_aggregator`
Expected: PASS (some assertions may need test fixtures — if so, extend setUp with `_make_user_with_no_data` helper; the shape and exec swap must pass).

- [ ] **Step 5: Commit**

```bash
git add vernon_tasks/task/services/dashboard_aggregator.py vernon_tasks/task/services/test_dashboard_aggregator.py
git commit -m "feat(api): dashboard_aggregator service composes role-aware payload"
```

---

### Task 2: Backend — `get_home` whitelisted endpoint

**Files:**
- Create: `vernon_tasks/task/api/portal_dashboard.py`
- Create: `vernon_tasks/task/api/test_portal_dashboard.py`

- [ ] **Step 1: Failing test**

```python
import json
import frappe
from frappe.tests.utils import FrappeTestCase

class TestPortalDashboardApi(FrappeTestCase):
    def test_get_home_requires_login(self):
        frappe.set_user("Guest")
        with self.assertRaises(frappe.PermissionError):
            frappe.get_attr("vernon_tasks.task.api.portal_dashboard.get_home")(role="ic")

    def test_get_home_returns_payload_shape(self):
        frappe.set_user("Administrator")
        out = frappe.get_attr("vernon_tasks.task.api.portal_dashboard.get_home")(role="ic")
        self.assertIn("role", out)
        self.assertIn("today", out)
        self.assertIn("me", out)

    def test_invalid_role_clamped(self):
        frappe.set_user("Administrator")
        out = frappe.get_attr("vernon_tasks.task.api.portal_dashboard.get_home")(role="evil")
        self.assertEqual(out["role"], "ic")  # default fallback
```

- [ ] **Step 2: Run, expect FAIL.**

Run: `bench --site testsite run-tests --app vernon_tasks --module vernon_tasks.task.api.test_portal_dashboard`

- [ ] **Step 3: Implement `portal_dashboard.py`**

```python
"""Portal Dashboard API — single bundled endpoint."""
import frappe
from vernon_tasks.task.api.security import require_login
from vernon_tasks.task.services.dashboard_aggregator import build_home_payload

ALLOWED_ROLES = {"ic", "leader", "pm", "exec"}


@frappe.whitelist()
def get_home(role: str = "ic") -> dict:
    require_login()
    safe_role = role if role in ALLOWED_ROLES else "ic"
    return build_home_payload(user=frappe.session.user, role=safe_role)
```

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add vernon_tasks/task/api/portal_dashboard.py vernon_tasks/task/api/test_portal_dashboard.py
git commit -m "feat(api): get_home whitelisted endpoint for portal dashboard"
```

---

### Task 3: Frontend — types + dashboardApi

**Files:**
- Create: `www-react/src/features/dashboard/types.ts`
- Create: `www-react/src/features/dashboard/dashboardApi.ts`

- [ ] **Step 1: types.ts**

```ts
export type Role = 'ic' | 'leader' | 'pm' | 'exec';
export type HealthBucket = 'red' | 'amber' | 'green' | 'grey';

export type RiskItem = {
  project_id: string;
  project_name: string;
  reason: string;
  severity: 'high' | 'med';
};

export type TodayCardData = {
  ontime_rate_7d: number;
  blocked_count: number;
  okr_confidence_delta_wow: number;
  next_deadline: { id: string; title: string; due_date: string } | null;
  pdca_queue: Record<string, number>;
  org_health_score?: number;
};

export type MeCardData = {
  points_week: number;
  streak_days: number;
  capacity_used_pct: number;
  ontime_rate_7d: number;
};

export type SprintCardData = {
  id: string;
  name: string;
  days_left: number;
  percent_done: number;
  burndown_spark: number[];
};

export type ProjectCardData = {
  id: string;
  name: string;
  health: HealthBucket;
  okr_progress: number;
  my_role: string;
  blocked_count: number;
  days_left: number | null;
};

export type DashboardPayload = {
  role: Role;
  at_risk: RiskItem[];
  today: TodayCardData;
  me: MeCardData;
  sprints: SprintCardData[];
  projects: ProjectCardData[];
};
```

- [ ] **Step 2: dashboardApi.ts**

```ts
import { api } from '@/lib/api';
import type { DashboardPayload, Role } from './types';

export async function fetchHome(role: Role): Promise<DashboardPayload> {
  const res = await api.get<{ message: DashboardPayload }>(
    '/api/method/vernon_tasks.task.api.portal_dashboard.get_home',
    { params: { role } },
  );
  return res.data.message;
}

export const DASHBOARD_KEY = (role: Role) => ['dashboard', role] as const;
```

- [ ] **Step 3: Commit**

```bash
git add www-react/src/features/dashboard/types.ts www-react/src/features/dashboard/dashboardApi.ts
git commit -m "feat(www-react): dashboard types + fetch_home client"
```

---

### Task 4: Shared primitives — HealthDot + MetricTile + Sparkline

**Files:**
- Create: `www-react/src/features/dashboard/components/HealthDot.tsx`
- Create: `www-react/src/components/MetricTile.tsx`
- Create: `www-react/src/features/dashboard/components/Sparkline.tsx`

- [ ] **Step 1: HealthDot.tsx**

```tsx
import clsx from 'clsx';
import type { HealthBucket } from '../types';

const COLOR: Record<HealthBucket, string> = {
  red: 'bg-risk-red',
  amber: 'bg-risk-amber',
  green: 'bg-risk-green',
  grey: 'bg-slate-400',
};
const LETTER: Record<HealthBucket, string> = { red: '!', amber: '·', green: '✓', grey: '?' };

export function HealthDot({ bucket }: { bucket: HealthBucket }) {
  return (
    <span
      aria-label={`Health ${bucket}`}
      className={clsx(
        'inline-flex items-center justify-center w-4 h-4 rounded-full text-white text-[10px] font-bold',
        COLOR[bucket],
      )}
    >
      {LETTER[bucket]}
    </span>
  );
}
```

- [ ] **Step 2: MetricTile.tsx**

```tsx
import { ReactNode } from 'react';
import clsx from 'clsx';

export function MetricTile({
  label, value, hint, tone = 'neutral', onClick,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'neutral' | 'positive' | 'warning' | 'danger';
  onClick?: () => void;
}) {
  const toneColor = {
    neutral: 'text-slate-900 dark:text-slate-100',
    positive: 'text-risk-green',
    warning: 'text-risk-amber',
    danger: 'text-risk-red',
  }[tone];
  const Wrap = onClick ? 'button' : 'div';
  return (
    <Wrap
      onClick={onClick}
      className={clsx(
        'text-left rounded-lg border border-slate-200 dark:border-slate-800 p-4 bg-white dark:bg-slate-900',
        onClick && 'hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer',
      )}
    >
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={clsx('text-2xl font-semibold mt-1', toneColor)}>{value}</div>
      {hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
    </Wrap>
  );
}
```

- [ ] **Step 3: Sparkline.tsx**

```tsx
import { LineChart, Line, ResponsiveContainer } from 'recharts';

export function Sparkline({ data, height = 32 }: { data: number[]; height?: number }) {
  const points = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={points}>
        <Line type="monotone" dataKey="v" stroke="currentColor" strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 4: Install recharts**

Run: `cd www-react && npm i recharts`

- [ ] **Step 5: Commit**

```bash
git add www-react/src/features/dashboard/components www-react/src/components/MetricTile.tsx www-react/package.json www-react/package-lock.json
git commit -m "feat(www-react): HealthDot, MetricTile, Sparkline primitives"
```

---

### Task 5: AtRiskBanner

**Files:**
- Create: `www-react/src/features/dashboard/components/AtRiskBanner.tsx`
- Create: `www-react/tests/unit/dashboard/AtRiskBanner.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AtRiskBanner } from '@/features/dashboard/components/AtRiskBanner';

describe('AtRiskBanner', () => {
  it('renders nothing when list empty', () => {
    const { container } = render(<MemoryRouter><AtRiskBanner items={[]} /></MemoryRouter>);
    expect(container).toBeEmptyDOMElement();
  });

  it('summarises count and first two items', () => {
    render(
      <MemoryRouter>
        <AtRiskBanner items={[
          { project_id: 'p1', project_name: 'Alpha', reason: 'health -12 WoW', severity: 'high' },
          { project_id: 'p2', project_name: 'Beta',  reason: 'overdue',         severity: 'med'  },
          { project_id: 'p3', project_name: 'Gamma', reason: 'no checkin',      severity: 'med'  },
        ]} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/3 projects at risk/i)).toBeInTheDocument();
    expect(screen.getByText(/Alpha/)).toBeInTheDocument();
    expect(screen.getByText(/Beta/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement AtRiskBanner.tsx**

```tsx
import { Link } from 'react-router-dom';
import type { RiskItem } from '../types';

export function AtRiskBanner({ items }: { items: RiskItem[] }) {
  if (items.length === 0) return null;
  const head = items.slice(0, 2);
  return (
    <div
      role="alert"
      className="rounded-lg border border-risk-red/40 bg-risk-red/10 px-4 py-3 mb-6 flex items-center gap-3"
    >
      <span className="text-risk-red font-semibold text-sm">
        {items.length} {items.length === 1 ? 'project' : 'projects'} at risk
      </span>
      <span className="text-sm text-slate-600 dark:text-slate-300">·</span>
      <ul className="flex gap-4 text-sm">
        {head.map((it) => (
          <li key={it.project_id}>
            <Link to={`/portal/projects/${it.project_id}`} className="underline">
              {it.project_name}
            </Link>{' '}
            <span className="text-slate-500">— {it.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add www-react/src/features/dashboard/components/AtRiskBanner.tsx www-react/tests/unit/dashboard/AtRiskBanner.test.tsx
git commit -m "feat(www-react): AtRiskBanner with first-two-items summary"
```

---

### Task 6: TodayCard + MeCard

**Files:**
- Create: `www-react/src/features/dashboard/components/TodayCard.tsx`
- Create: `www-react/src/features/dashboard/components/MeCard.tsx`
- Create: `www-react/tests/unit/dashboard/TodayCard.test.tsx`

- [ ] **Step 1: TodayCard test (failing)**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TodayCard } from '@/features/dashboard/components/TodayCard';

const data = {
  ontime_rate_7d: 0.84,
  blocked_count: 3,
  okr_confidence_delta_wow: -0.05,
  next_deadline: { id: 't1', title: 'Ship login', due_date: '2026-05-25' },
  pdca_queue: { PLAN: 2, DO: 4, CHECK: 1 },
};

describe('TodayCard', () => {
  it('shows ontime rate as percentage', () => {
    render(<MemoryRouter><TodayCard data={data} /></MemoryRouter>);
    expect(screen.getByText('84%')).toBeInTheDocument();
  });

  it('highlights blocked count as danger when > 0', () => {
    render(<MemoryRouter><TodayCard data={data} /></MemoryRouter>);
    const tile = screen.getByRole('button', { name: /blocked/i });
    expect(tile).toHaveTextContent('3');
  });

  it('shows org_health_score when exec data provided', () => {
    render(
      <MemoryRouter>
        <TodayCard data={{ ...data, org_health_score: 72 }} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/72/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: TodayCard.tsx**

```tsx
import { useNavigate } from 'react-router-dom';
import { MetricTile } from '@/components/MetricTile';
import type { TodayCardData } from '../types';

function pct(n: number) { return `${Math.round(n * 100)}%`; }

export function TodayCard({ data }: { data: TodayCardData }) {
  const nav = useNavigate();
  const ontimeTone = data.ontime_rate_7d >= 0.8 ? 'positive' : data.ontime_rate_7d >= 0.7 ? 'warning' : 'danger';
  const blockedTone = data.blocked_count === 0 ? 'positive' : data.blocked_count <= 2 ? 'warning' : 'danger';
  const okrTone = data.okr_confidence_delta_wow >= 0 ? 'positive' : 'warning';

  if (data.org_health_score !== undefined) {
    return (
      <section aria-label="Today">
        <h2 className="text-sm font-semibold mb-3">Today</h2>
        <div className="grid grid-cols-3 gap-3">
          <MetricTile label="Org Health Score" value={Math.round(data.org_health_score)} />
          <MetricTile label="On-time 7d" value={pct(data.ontime_rate_7d)} tone={ontimeTone} />
          <MetricTile label="Blocked" value={data.blocked_count} tone={blockedTone}
            onClick={() => nav('/portal/projects?filter=has-blockers')} />
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Today">
      <h2 className="text-sm font-semibold mb-3">Today</h2>
      <div className="grid grid-cols-3 gap-3">
        <MetricTile label="On-time 7d" value={pct(data.ontime_rate_7d)} tone={ontimeTone}
          hint={data.next_deadline ? `Next: ${data.next_deadline.title}` : undefined} />
        <MetricTile label="Blocked" value={data.blocked_count} tone={blockedTone}
          onClick={() => nav('/portal/projects?filter=has-blockers')} />
        <MetricTile label="OKR Δ WoW" value={pct(Math.abs(data.okr_confidence_delta_wow))}
          hint={data.okr_confidence_delta_wow >= 0 ? '↑ improving' : '↓ slipping'}
          tone={okrTone} />
      </div>
    </section>
  );
}
```

- [ ] **Step 4: MeCard.tsx**

```tsx
import { MetricTile } from '@/components/MetricTile';
import type { MeCardData } from '../types';

function pct(n: number) { return `${Math.round(n * 100)}%`; }

export function MeCard({ data }: { data: MeCardData }) {
  return (
    <section aria-label="Me">
      <h2 className="text-sm font-semibold mb-3">Me</h2>
      <div className="grid grid-cols-2 gap-3">
        <MetricTile label="Points (7d)" value={data.points_week} />
        <MetricTile label="Streak" value={`${data.streak_days}d`} />
        <MetricTile label="Capacity used" value={pct(data.capacity_used_pct)}
          tone={data.capacity_used_pct > 1 ? 'danger' : data.capacity_used_pct > 0.8 ? 'warning' : 'neutral'} />
        <MetricTile label="On-time 7d" value={pct(data.ontime_rate_7d)} />
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Run TodayCard test, expect PASS.**

- [ ] **Step 6: Commit**

```bash
git add www-react/src/features/dashboard/components/TodayCard.tsx www-react/src/features/dashboard/components/MeCard.tsx www-react/tests/unit/dashboard/TodayCard.test.tsx
git commit -m "feat(www-react): TodayCard + MeCard metric tiles"
```

---

### Task 7: SprintsScroller + SprintCard

**Files:**
- Create: `www-react/src/features/dashboard/components/SprintCard.tsx`
- Create: `www-react/src/features/dashboard/components/SprintsScroller.tsx`

- [ ] **Step 1: SprintCard.tsx**

```tsx
import { Link } from 'react-router-dom';
import { Sparkline } from './Sparkline';
import type { SprintCardData } from '../types';

export function SprintCard({ sprint }: { sprint: SprintCardData }) {
  return (
    <Link
      to={`/portal/projects?sprint=${sprint.id}`}
      className="block min-w-[220px] rounded-lg border border-slate-200 dark:border-slate-800 p-3 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium truncate">{sprint.name}</span>
        <span className="text-xs text-slate-500">{sprint.days_left}d</span>
      </div>
      <div className="mt-1 h-1.5 rounded bg-slate-200 dark:bg-slate-700 overflow-hidden">
        <div
          className="h-full bg-brand"
          style={{ width: `${Math.round(sprint.percent_done * 100)}%` }}
        />
      </div>
      <div className="mt-2 text-brand">
        <Sparkline data={sprint.burndown_spark} height={28} />
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: SprintsScroller.tsx**

```tsx
import { SprintCard } from './SprintCard';
import type { SprintCardData } from '../types';

export function SprintsScroller({ sprints }: { sprints: SprintCardData[] }) {
  if (sprints.length === 0) {
    return <p className="text-sm text-slate-500">No active sprints.</p>;
  }
  return (
    <section aria-label="My active sprints">
      <h2 className="text-sm font-semibold mb-3">My Active Sprints</h2>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {sprints.map((s) => <SprintCard key={s.id} sprint={s} />)}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add www-react/src/features/dashboard/components/SprintCard.tsx www-react/src/features/dashboard/components/SprintsScroller.tsx
git commit -m "feat(www-react): SprintsScroller with burndown spark cards"
```

---

### Task 8: ProjectsGrid + ProjectCard

**Files:**
- Create: `www-react/src/features/dashboard/components/ProjectCard.tsx`
- Create: `www-react/src/features/dashboard/components/ProjectsGrid.tsx`

- [ ] **Step 1: ProjectCard.tsx**

```tsx
import { Link } from 'react-router-dom';
import { HealthDot } from './HealthDot';
import type { ProjectCardData } from '../types';

export function ProjectCard({ project }: { project: ProjectCardData }) {
  return (
    <Link
      to={`/portal/projects/${project.id}`}
      className="block rounded-lg border border-slate-200 dark:border-slate-800 p-4 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800"
    >
      <div className="flex items-start gap-2">
        <HealthDot bucket={project.health} />
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{project.name}</div>
          <div className="text-xs text-slate-500 mt-0.5">
            {project.my_role}
            {project.days_left !== null && ` · ${project.days_left}d left`}
            {project.blocked_count > 0 && (
              <span className="ml-1 text-risk-red">· {project.blocked_count} blocked</span>
            )}
          </div>
        </div>
      </div>
      <div className="mt-3 h-1.5 rounded bg-slate-200 dark:bg-slate-700 overflow-hidden">
        <div className="h-full bg-brand" style={{ width: `${Math.round(project.okr_progress * 100)}%` }} />
      </div>
      <div className="mt-1 text-[10px] text-slate-500">
        OKR {Math.round(project.okr_progress * 100)}%
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: ProjectsGrid.tsx**

```tsx
import { ProjectCard } from './ProjectCard';
import type { ProjectCardData } from '../types';

export function ProjectsGrid({ projects }: { projects: ProjectCardData[] }) {
  if (projects.length === 0) {
    return <p className="text-sm text-slate-500">No projects assigned to you.</p>;
  }
  return (
    <section aria-label="My projects">
      <h2 className="text-sm font-semibold mb-3">My Projects</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {projects.map((p) => <ProjectCard key={p.id} project={p} />)}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add www-react/src/features/dashboard/components/ProjectCard.tsx www-react/src/features/dashboard/components/ProjectsGrid.tsx
git commit -m "feat(www-react): ProjectsGrid with OKR bar + role hint"
```

---

### Task 9: DashboardPage assembly + replace router placeholder

**Files:**
- Create: `www-react/src/features/dashboard/DashboardPage.tsx`
- Modify: `www-react/src/app/router.tsx` (replace placeholder)
- Create: `www-react/tests/unit/dashboard/DashboardPage.test.tsx`

- [ ] **Step 1: DashboardPage.tsx**

```tsx
import { useQuery } from '@tanstack/react-query';
import { DASHBOARD_KEY, fetchHome } from './dashboardApi';
import { useSession } from '@/features/auth/useSession';
import { AtRiskBanner } from './components/AtRiskBanner';
import { TodayCard } from './components/TodayCard';
import { MeCard } from './components/MeCard';
import { SprintsScroller } from './components/SprintsScroller';
import { ProjectsGrid } from './components/ProjectsGrid';
import type { Role } from './types';

function inferRole(roles: string[]): Role {
  if (roles.includes('Vernon Exec')) return 'exec';
  if (roles.includes('Vernon Leader')) return 'leader';
  if (roles.includes('Vernon PM')) return 'pm';
  return 'ic';
}

export function DashboardPage() {
  const { data: session } = useSession();
  const role: Role = session ? inferRole(session.roles) : 'ic';
  const { data, isLoading, isError, error } = useQuery({
    queryKey: DASHBOARD_KEY(role),
    queryFn: () => fetchHome(role),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  if (isLoading) return <SkeletonDashboard />;
  if (isError) return <p className="text-sm text-risk-red">Failed to load dashboard: {String(error)}</p>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <AtRiskBanner items={data.at_risk} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2"><TodayCard data={data.today} /></div>
        <div><MeCard data={data.me} /></div>
      </div>
      <SprintsScroller sprints={data.sprints} />
      <ProjectsGrid projects={data.projects} />
    </div>
  );
}

function SkeletonDashboard() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded" />
      <div className="grid grid-cols-3 gap-3">
        {[0,1,2].map((i) => <div key={i} className="h-24 bg-slate-200 dark:bg-slate-800 rounded" />)}
      </div>
      <div className="h-32 bg-slate-200 dark:bg-slate-800 rounded" />
    </div>
  );
}
```

- [ ] **Step 2: Replace placeholder in router.tsx**

In `src/app/router.tsx` swap:
```tsx
{ path: 'dashboard', element: <PlaceholderPage title="Dashboard" /> },
```
to:
```tsx
{ path: 'dashboard', element: <DashboardPage /> },
```
Add lazy import:
```tsx
import { DashboardPage } from '@/features/dashboard/DashboardPage';
```

(Convert to `lazy()` when the bundle warrants it; keep eager for now since this is the landing page.)

- [ ] **Step 3: DashboardPage integration test**

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MockAdapter from 'axios-mock-adapter';
import { api } from '@/lib/api';
import { DashboardPage } from '@/features/dashboard/DashboardPage';

const sample = {
  message: {
    role: 'ic',
    at_risk: [],
    today: { ontime_rate_7d: 0.9, blocked_count: 0, okr_confidence_delta_wow: 0.02, next_deadline: null, pdca_queue: {} },
    me: { points_week: 12, streak_days: 3, capacity_used_pct: 0.6, ontime_rate_7d: 0.9 },
    sprints: [],
    projects: [],
  },
};

describe('DashboardPage', () => {
  let mock: MockAdapter;
  beforeEach(() => { mock = new MockAdapter(api); });

  it('renders Today and Me sections from payload', async () => {
    mock.onGet(/\/api\/method\/frappe\.auth\.get_logged_user/).reply(200, { message: 'u' });
    mock.onGet(/\/api\/resource\/User\//).reply(200, { data: { name: 'u', full_name: 'U', roles: [] } });
    mock.onGet(/portal_dashboard\.get_home/).reply(200, sample);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/portal/dashboard']}>
          <Routes><Route path="/portal/dashboard" element={<DashboardPage />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('region', { name: /today/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /me/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run all tests + build**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add www-react/src/features/dashboard/DashboardPage.tsx www-react/src/app/router.tsx www-react/tests/unit/dashboard/DashboardPage.test.tsx
git commit -m "feat(www-react): wire DashboardPage as /portal/dashboard"
```

---

### Task 10: e2e — dashboard end-to-end with mocked payload

**Files:**
- Create: `www-react/tests/e2e/dashboard.spec.ts`

- [ ] **Step 1: dashboard.spec.ts**

```ts
import { test, expect } from '@playwright/test';

const payload = {
  message: {
    role: 'ic',
    at_risk: [
      { project_id: 'p1', project_name: 'Alpha', reason: 'health -12 WoW', severity: 'high' },
    ],
    today: { ontime_rate_7d: 0.84, blocked_count: 3, okr_confidence_delta_wow: -0.05, next_deadline: null, pdca_queue: {} },
    me: { points_week: 18, streak_days: 4, capacity_used_pct: 0.7, ontime_rate_7d: 0.84 },
    sprints: [
      { id: 's1', name: 'Sprint 21', days_left: 4, percent_done: 0.6, burndown_spark: [10,8,6,5,3] },
    ],
    projects: [
      { id: 'p1', name: 'Alpha', health: 'amber', okr_progress: 0.45, my_role: 'lead', blocked_count: 2, days_left: 12 },
    ],
  },
};

test('dashboard renders banner + tiles + sprints + projects', async ({ page, context }) => {
  await context.route('**/api/method/login', (r) => r.fulfill({ status: 200, body: '{"message":"ok"}' }));
  await context.route('**/api/method/frappe.auth.get_logged_user', (r) => r.fulfill({ status: 200, body: '{"message":"u"}' }));
  await context.route('**/api/resource/User/**', (r) => r.fulfill({ status: 200, body: '{"data":{"name":"u","full_name":"U","roles":[]}}' }));
  await context.route('**/portal_dashboard.get_home**', (r) => r.fulfill({ status: 200, body: JSON.stringify(payload) }));

  await page.goto('/login');
  await page.getByLabel(/email/i).fill('u@v.id');
  await page.getByLabel(/password/i).fill('x');
  await page.getByRole('button', { name: /sign in/i }).click();

  await expect(page.getByRole('alert')).toContainText(/1 project at risk/i);
  await expect(page.getByRole('region', { name: /today/i })).toBeVisible();
  await expect(page.getByText('Sprint 21')).toBeVisible();
  await expect(page.getByText('Alpha')).toBeVisible();
});
```

- [ ] **Step 2: Run e2e**

Run: `npm run e2e -- dashboard`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add www-react/tests/e2e/dashboard.spec.ts
git commit -m "test(www-react): e2e dashboard with mocked payload"
```

---

## Definition of Done — Dashboard

- `vernon_tasks.task.api.portal_dashboard.get_home` returns the documented payload shape for all 4 roles
- Frontend `DashboardPage` renders skeleton → data → 4 sections without console errors
- Banner hides when `at_risk` is empty; renders count + first two when populated
- Today tile blocked-count click navigates to `/portal/projects?filter=has-blockers`
- E2E happy-path passes
- No console errors in build

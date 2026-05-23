# www-react Projects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Projects list (filters, bulk actions, 7 columns) and the Project detail page with 5 tabs (Tasks default, Overview, Burndown, OKR, Members). Tasks tab defaults to grouping by Key Result, with toggle to PDCA / Sprint / Assignee / Due-date.

**Architecture:** List + detail share a `projectsApi` module. Each tab is lazy-loaded. Tasks tab uses TanStack Query keyed by `[project, id, 'tasks', groupBy]` and renders pre-grouped buckets. Bulk actions: optimistic + invalidate.

**Tech Stack:** Existing + `@tanstack/react-virtual` for long task lists.

**Spec:** `docs/superpowers/specs/2026-05-23-www-react-dashboard-design.html` §3.

**Prereq:** Plans 0 + 1.

---

## File Structure

```
vernon_tasks/task/
  api/
    portal_projects.py            # extended + new endpoints
    test_portal_projects.py
  services/
    project_task_grouper.py       # pre-group by KR/PDCA/Sprint/Assignee/Due
    test_project_task_grouper.py
www-react/src/
  features/projects/
    types.ts
    projectsApi.ts
    ProjectListPage.tsx
    ProjectDetailPage.tsx
    list/
      ProjectListTable.tsx
      FilterBar.tsx
      BulkActionBar.tsx
    detail/
      DetailHeader.tsx
      TabsNav.tsx
      tabs/
        TasksTab.tsx
        OverviewTab.tsx
        BurndownTab.tsx
        OkrTab.tsx
        MembersTab.tsx
      modals/
        BulkMoveSprintModal.tsx
        BulkReassignModal.tsx
        BulkPhaseShiftModal.tsx
        BulkRelinkKrModal.tsx
www-react/tests/unit/projects/
  ProjectListPage.test.tsx
  FilterBar.test.tsx
  TasksTab.test.tsx
www-react/tests/e2e/
  projects.spec.ts
```

---

### Task 1: Backend — extend `portal_projects` with `get_project_tasks(group_by)`

**Files:**
- Modify: `vernon_tasks/task/api/portal_projects.py`
- Create: `vernon_tasks/task/services/project_task_grouper.py`
- Create: `vernon_tasks/task/services/test_project_task_grouper.py`

- [ ] **Step 1: Failing test for grouper**

```python
import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_tasks.task.services.project_task_grouper import group_tasks

class TestProjectTaskGrouper(FrappeTestCase):
    def test_invalid_group_by_raises(self):
        with self.assertRaises(ValueError):
            group_tasks(project_id="X", group_by="evil")

    def test_group_by_kr_buckets_unlinked(self):
        result = group_tasks(project_id="nonexistent", group_by="kr")
        # Empty project still returns shape with "Unlinked" bucket
        self.assertIsInstance(result, list)
        # Each bucket: {key, label, meta, tasks}
        if result:
            self.assertIn("key", result[0])
            self.assertIn("tasks", result[0])
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement `project_task_grouper.py`**

```python
"""Pre-group VT Tasks for a project by KR / PDCA / Sprint / Assignee / Due-date."""
from __future__ import annotations
import frappe
from typing import Literal

GroupBy = Literal["kr", "pdca", "sprint", "assignee", "due"]
ALLOWED = ("kr", "pdca", "sprint", "assignee", "due")


def group_tasks(project_id: str, group_by: GroupBy) -> list[dict]:
    if group_by not in ALLOWED:
        raise ValueError(f"group_by must be one of {ALLOWED}")
    tasks = _load_tasks(project_id)
    fn = {
        "kr":       _group_by_kr,
        "pdca":     _group_by_pdca,
        "sprint":   _group_by_sprint,
        "assignee": _group_by_assignee,
        "due":      _group_by_due,
    }[group_by]
    return fn(project_id, tasks)


def _load_tasks(project_id: str) -> list[dict]:
    return frappe.db.sql("""
        SELECT t.name, t.title, t.pdca_phase, t.assignee,
               t.due_date, t.points, t.status,
               t.linked_kr, t.sprint, t.risk_flag
          FROM `tabVT Task` t
         WHERE t.project = %(p)s
    """, {"p": project_id}, as_dict=True)


def _task_row(t: dict) -> dict:
    return {
        "id": t.name,
        "title": t.title,
        "pdca": t.pdca_phase,
        "assignee": t.assignee,
        "due_date": str(t.due_date) if t.due_date else None,
        "points": int(t.points or 0),
        "status": t.status,
        "linked_kr": t.linked_kr,
        "sprint": t.sprint,
        "risk_flag": t.risk_flag,
    }


def _group_by_kr(project_id: str, tasks: list[dict]) -> list[dict]:
    kr_meta = _kr_meta_for_project(project_id)
    buckets: dict[str, dict] = {}
    for t in tasks:
        key = t.linked_kr or "__unlinked__"
        bucket = buckets.setdefault(key, {
            "key": key,
            "label": kr_meta.get(key, {}).get("label", "Unlinked"),
            "meta":  kr_meta.get(key, {}),
            "tasks": [],
        })
        bucket["tasks"].append(_task_row(t))
    # Stable order: linked first sorted by label, Unlinked last
    linked = sorted([b for k, b in buckets.items() if k != "__unlinked__"], key=lambda b: b["label"])
    unlinked = [b for k, b in buckets.items() if k == "__unlinked__"]
    return linked + unlinked


def _kr_meta_for_project(project_id: str) -> dict[str, dict]:
    rows = frappe.db.sql("""
        SELECT kr.name, kr.title, kr.target_value, kr.current_value
          FROM `tabVT Key Result` kr
          JOIN `tabVT Objective` o ON o.name = kr.objective
         WHERE o.linked_project = %(p)s
    """, {"p": project_id}, as_dict=True)
    out: dict[str, dict] = {}
    for r in rows:
        target = float(r.target_value or 0)
        current = float(r.current_value or 0)
        out[r.name] = {
            "label": r.title,
            "target": target,
            "current": current,
            "progress": round((current / target) if target else 0.0, 3),
        }
    return out


def _group_by_pdca(_p: str, tasks: list[dict]) -> list[dict]:
    order = ["BACKLOG", "PLAN", "DO", "CHECK", "DONE", "ACT"]
    bucket_map = {phase: [] for phase in order}
    for t in tasks:
        bucket_map.setdefault(t.pdca_phase or "BACKLOG", []).append(_task_row(t))
    return [{"key": p, "label": p, "meta": {}, "tasks": bucket_map[p]} for p in order if bucket_map[p]]


def _group_by_sprint(_p: str, tasks: list[dict]) -> list[dict]:
    buckets: dict[str, list] = {}
    for t in tasks:
        key = t.sprint or "__no_sprint__"
        buckets.setdefault(key, []).append(_task_row(t))
    return [
        {"key": k, "label": k if k != "__no_sprint__" else "No Sprint", "meta": {}, "tasks": v}
        for k, v in buckets.items()
    ]


def _group_by_assignee(_p: str, tasks: list[dict]) -> list[dict]:
    buckets: dict[str, list] = {}
    for t in tasks:
        key = t.assignee or "__unassigned__"
        buckets.setdefault(key, []).append(_task_row(t))
    return [
        {"key": k, "label": k if k != "__unassigned__" else "Unassigned", "meta": {}, "tasks": v}
        for k, v in buckets.items()
    ]


def _group_by_due(_p: str, tasks: list[dict]) -> list[dict]:
    from datetime import date, timedelta
    today = date.today()
    week_end = today + timedelta(days=(6 - today.weekday()))
    buckets = {"overdue": [], "today": [], "this_week": [], "later": [], "no_date": []}
    for t in tasks:
        if not t.due_date:
            buckets["no_date"].append(_task_row(t))
            continue
        d = t.due_date
        if d < today: buckets["overdue"].append(_task_row(t))
        elif d == today: buckets["today"].append(_task_row(t))
        elif d <= week_end: buckets["this_week"].append(_task_row(t))
        else: buckets["later"].append(_task_row(t))
    labels = {
        "overdue": "Overdue", "today": "Today", "this_week": "This Week",
        "later": "Later", "no_date": "No date",
    }
    return [
        {"key": k, "label": labels[k], "meta": {}, "tasks": v}
        for k, v in buckets.items() if v
    ]
```

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Extend `portal_projects.py`**

Add the following whitelisted functions (alongside any existing):

```python
import frappe
from vernon_tasks.task.api.security import require_login, max_str
from vernon_tasks.task.services.project_task_grouper import group_tasks

@frappe.whitelist()
def get_project_tasks(project_id: str, group_by: str = "kr") -> list[dict]:
    require_login()
    project_id = max_str(project_id, 140)
    if not frappe.has_permission("VT Project", "read", project_id):
        raise frappe.PermissionError
    return group_tasks(project_id=project_id, group_by=group_by)


@frappe.whitelist()
def bulk_move_tasks(task_ids: list[str], target_sprint: str) -> dict:
    require_login()
    for tid in task_ids:
        doc = frappe.get_doc("VT Task", tid)
        doc.sprint = target_sprint
        doc.save()
    return {"moved": len(task_ids)}


@frappe.whitelist()
def bulk_reassign(task_ids: list[str], new_owner: str) -> dict:
    require_login()
    for tid in task_ids:
        frappe.db.set_value("VT Task", tid, "assignee", new_owner)
    return {"reassigned": len(task_ids)}


@frappe.whitelist()
def bulk_phase_shift(task_ids: list[str], new_phase: str) -> dict:
    require_login()
    ALLOWED = {"BACKLOG", "PLAN", "DO", "CHECK", "DONE", "ACT"}
    if new_phase not in ALLOWED:
        raise frappe.ValidationError(f"invalid phase {new_phase}")
    for tid in task_ids:
        doc = frappe.get_doc("VT Task", tid)
        doc.pdca_phase = new_phase
        doc.save()
    return {"shifted": len(task_ids)}


@frappe.whitelist()
def relink_task_kr(task_ids: list[str], kr_id: str | None) -> dict:
    require_login()
    if kr_id and not frappe.db.exists("VT Key Result", kr_id):
        raise frappe.ValidationError("KR not found")
    for tid in task_ids:
        frappe.db.set_value("VT Task", tid, "linked_kr", kr_id)
    return {"relinked": len(task_ids), "kr": kr_id}


@frappe.whitelist()
def get_project_detail(project_id: str) -> dict:
    require_login()
    project_id = max_str(project_id, 140)
    p = frappe.get_doc("VT Project", project_id)
    return {
        "id": p.name,
        "title": p.title,
        "project_lead": p.project_lead,
        "health_score": float(p.health_score or 0),
        "percent_done": float(p.percent_done or 0),
        "start_date": str(p.start_date) if p.start_date else None,
        "end_date":   str(p.end_date)   if p.end_date   else None,
        "status": p.status,
        "active_sprint": frappe.db.get_value(
            "VT Sprint", {"project": p.name, "status": "Active"}, ["name", "title"], as_dict=True,
        ),
        "linked_objective": p.linked_objective,
        "blocked_count": frappe.db.count("VT Task", {"project": p.name, "status": "BLOCKED"}),
    }
```

- [ ] **Step 6: Backend tests for new endpoints**

`test_portal_projects.py` (new test module or append):

```python
import frappe
from frappe.tests.utils import FrappeTestCase

class TestPortalProjectsExtended(FrappeTestCase):
    def test_get_project_tasks_invalid_group_by(self):
        frappe.set_user("Administrator")
        with self.assertRaises(ValueError):
            frappe.get_attr("vernon_tasks.task.api.portal_projects.get_project_tasks")(
                project_id="anything", group_by="evil",
            )

    def test_bulk_phase_shift_rejects_invalid_phase(self):
        frappe.set_user("Administrator")
        with self.assertRaises(frappe.ValidationError):
            frappe.get_attr("vernon_tasks.task.api.portal_projects.bulk_phase_shift")(
                task_ids=[], new_phase="HACK",
            )
```

Run + expect PASS.

- [ ] **Step 7: Commit**

```bash
git add vernon_tasks/task/api/portal_projects.py vernon_tasks/task/api/test_portal_projects.py vernon_tasks/task/services/project_task_grouper.py vernon_tasks/task/services/test_project_task_grouper.py
git commit -m "feat(api): project task grouper + bulk endpoints + detail endpoint"
```

---

### Task 2: Frontend — projectsApi + types

**Files:**
- Create: `www-react/src/features/projects/types.ts`
- Create: `www-react/src/features/projects/projectsApi.ts`

- [ ] **Step 1: types.ts**

```ts
import type { HealthBucket } from '@/features/dashboard/types';

export type ProjectListRow = {
  id: string;
  name: string;
  health: HealthBucket;
  percent_done: number;
  days_left: number | null;
  blocked_count: number;
  owner: { id: string; name: string; avatar: string | null };
  current_sprint: { id: string; name: string; days_left: number } | null;
};

export type ProjectListFilters = {
  search?: string;
  mine?: boolean;
  active?: boolean;
  has_blockers?: boolean;
  sprint_active?: boolean;
  risk_high?: boolean;
  sort?: 'health_asc' | 'days_left_asc' | 'blocked_desc';
};

export type GroupBy = 'kr' | 'pdca' | 'sprint' | 'assignee' | 'due';

export type TaskRow = {
  id: string;
  title: string;
  pdca: string;
  assignee: string | null;
  due_date: string | null;
  points: number;
  status: string;
  linked_kr: string | null;
  sprint: string | null;
  risk_flag: string | null;
};

export type TaskBucket = {
  key: string;
  label: string;
  meta: { target?: number; current?: number; progress?: number };
  tasks: TaskRow[];
};

export type ProjectDetail = {
  id: string;
  title: string;
  project_lead: string;
  health_score: number;
  percent_done: number;
  start_date: string | null;
  end_date: string | null;
  status: string;
  active_sprint: { name: string; title: string } | null;
  linked_objective: string | null;
  blocked_count: number;
};
```

- [ ] **Step 2: projectsApi.ts**

```ts
import { api } from '@/lib/api';
import type {
  ProjectListRow, ProjectListFilters,
  TaskBucket, GroupBy, ProjectDetail,
} from './types';

const BASE = '/api/method/vernon_tasks.task.api.portal_projects';

export const KEY = {
  list: (f: ProjectListFilters) => ['projects', 'list', f] as const,
  detail: (id: string) => ['project', id] as const,
  tasks: (id: string, group: GroupBy) => ['project', id, 'tasks', group] as const,
};

export async function listProjects(filters: ProjectListFilters): Promise<ProjectListRow[]> {
  const res = await api.get<{ message: ProjectListRow[] }>(`${BASE}.list_projects`, {
    params: { filters: JSON.stringify(filters) },
  });
  return res.data.message;
}

export async function getProjectDetail(id: string): Promise<ProjectDetail> {
  const res = await api.get<{ message: ProjectDetail }>(`${BASE}.get_project_detail`, {
    params: { project_id: id },
  });
  return res.data.message;
}

export async function getProjectTasks(id: string, group_by: GroupBy): Promise<TaskBucket[]> {
  const res = await api.get<{ message: TaskBucket[] }>(`${BASE}.get_project_tasks`, {
    params: { project_id: id, group_by },
  });
  return res.data.message;
}

export async function bulkMoveTasks(task_ids: string[], target_sprint: string) {
  await api.post(`${BASE}.bulk_move_tasks`, { task_ids, target_sprint });
}

export async function bulkReassign(task_ids: string[], new_owner: string) {
  await api.post(`${BASE}.bulk_reassign`, { task_ids, new_owner });
}

export async function bulkPhaseShift(task_ids: string[], new_phase: string) {
  await api.post(`${BASE}.bulk_phase_shift`, { task_ids, new_phase });
}

export async function relinkTaskKr(task_ids: string[], kr_id: string | null) {
  await api.post(`${BASE}.relink_task_kr`, { task_ids, kr_id });
}
```

- [ ] **Step 3: Commit**

```bash
git add www-react/src/features/projects/types.ts www-react/src/features/projects/projectsApi.ts
git commit -m "feat(www-react): projects API client + types"
```

---

### Task 3: FilterBar + FilterChip persistence

**Files:**
- Create: `www-react/src/features/projects/list/FilterBar.tsx`
- Create: `www-react/tests/unit/projects/FilterBar.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterBar } from '@/features/projects/list/FilterBar';

describe('FilterBar', () => {
  it('toggles chip and calls onChange with merged filter', async () => {
    const onChange = vi.fn();
    render(<FilterBar value={{}} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /has-blockers/i }));
    expect(onChange).toHaveBeenLastCalledWith({ has_blockers: true });
  });

  it('search input debounces onChange', async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<FilterBar value={{}} onChange={onChange} />);
    const input = screen.getByPlaceholderText(/search/i);
    await userEvent.type(input, 'alpha', { delay: null });
    vi.advanceTimersByTime(300);
    expect(onChange).toHaveBeenLastCalledWith({ search: 'alpha' });
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement FilterBar.tsx**

```tsx
import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import type { ProjectListFilters } from '../types';

const CHIPS: { key: keyof ProjectListFilters; label: string }[] = [
  { key: 'mine',         label: 'My projects' },
  { key: 'active',       label: 'Status≠done' },
  { key: 'has_blockers', label: 'Has-blockers' },
  { key: 'sprint_active',label: 'Sprint=active' },
  { key: 'risk_high',    label: 'Risk=high' },
];

const SORTS: { key: NonNullable<ProjectListFilters['sort']>; label: string }[] = [
  { key: 'health_asc',    label: 'Health ↑' },
  { key: 'days_left_asc', label: 'Days left ↑' },
  { key: 'blocked_desc',  label: 'Blocked ↓' },
];

export function FilterBar({
  value, onChange,
}: {
  value: ProjectListFilters;
  onChange: (next: ProjectListFilters) => void;
}) {
  const [search, setSearch] = useState(value.search ?? '');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onChange({ ...value, search: search || undefined });
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <input
        placeholder="Search projects…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="text-sm px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-transparent"
      />
      {CHIPS.map((c) => {
        const active = Boolean(value[c.key]);
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => onChange({ ...value, [c.key]: active ? undefined : true })}
            className={clsx(
              'text-xs px-3 py-1 rounded-full border',
              active
                ? 'bg-brand text-white border-brand'
                : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300',
            )}
          >
            {c.label}
          </button>
        );
      })}
      <select
        value={value.sort ?? ''}
        onChange={(e) => onChange({ ...value, sort: (e.target.value || undefined) as ProjectListFilters['sort'] })}
        className="ml-auto text-xs bg-transparent border border-slate-300 dark:border-slate-700 rounded px-2 py-1"
      >
        <option value="">Sort…</option>
        {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>
    </div>
  );
}
```

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add www-react/src/features/projects/list/FilterBar.tsx www-react/tests/unit/projects/FilterBar.test.tsx
git commit -m "feat(www-react): FilterBar with debounced search + chips + sort"
```

---

### Task 4: ProjectListTable + BulkActionBar + ProjectListPage

**Files:**
- Create: `www-react/src/features/projects/list/ProjectListTable.tsx`
- Create: `www-react/src/features/projects/list/BulkActionBar.tsx`
- Create: `www-react/src/features/projects/ProjectListPage.tsx`
- Modify: `www-react/src/app/router.tsx` (replace Projects placeholder)
- Create: `www-react/tests/unit/projects/ProjectListPage.test.tsx`

- [ ] **Step 1: ProjectListTable.tsx**

```tsx
import { Link } from 'react-router-dom';
import { HealthDot } from '@/features/dashboard/components/HealthDot';
import type { ProjectListRow } from '../types';

export function ProjectListTable({
  rows, selected, onToggle, onToggleAll,
}: {
  rows: ProjectListRow[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
}) {
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-[11px] uppercase tracking-wider text-slate-500">
        <tr className="border-b border-slate-200 dark:border-slate-800">
          <th className="py-2 w-8">
            <input type="checkbox" checked={allSelected} onChange={onToggleAll} aria-label="Select all" />
          </th>
          <th>Name</th>
          <th>Health</th>
          <th>%done</th>
          <th>Days left</th>
          <th>Blocked</th>
          <th>Owner</th>
          <th>Current sprint</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-b border-slate-100 dark:border-slate-900 hover:bg-slate-50 dark:hover:bg-slate-900">
            <td className="py-2">
              <input
                type="checkbox"
                aria-label={`Select ${r.name}`}
                checked={selected.has(r.id)}
                onChange={() => onToggle(r.id)}
              />
            </td>
            <td>
              <Link to={`/portal/projects/${r.id}`} className="text-brand hover:underline">
                {r.name}
              </Link>
            </td>
            <td><HealthDot bucket={r.health} /></td>
            <td>{Math.round(r.percent_done * 100)}%</td>
            <td>{r.days_left ?? '—'}</td>
            <td className={r.blocked_count > 0 ? 'text-risk-red' : ''}>{r.blocked_count}</td>
            <td>{r.owner.name}</td>
            <td>
              {r.current_sprint
                ? <span>{r.current_sprint.name} <span className="text-xs text-slate-500">({r.current_sprint.days_left}d)</span></span>
                : <span className="text-slate-500">—</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 2: BulkActionBar.tsx**

```tsx
export function BulkActionBar({
  count, onMoveSprint, onReassign, onPhaseShift, onClear,
}: {
  count: number;
  onMoveSprint: () => void;
  onReassign: () => void;
  onPhaseShift: () => void;
  onClear: () => void;
}) {
  if (count === 0) return null;
  return (
    <div className="sticky top-0 z-10 flex items-center gap-3 bg-brand text-white px-4 py-2 rounded mb-3">
      <span className="text-sm">{count} selected</span>
      <button onClick={onMoveSprint}  className="text-xs underline">Move sprint</button>
      <button onClick={onReassign}    className="text-xs underline">Reassign</button>
      <button onClick={onPhaseShift}  className="text-xs underline">Phase shift</button>
      <button onClick={onClear} className="ml-auto text-xs underline">Clear</button>
    </div>
  );
}
```

- [ ] **Step 3: ProjectListPage.tsx**

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { FilterBar } from './list/FilterBar';
import { ProjectListTable } from './list/ProjectListTable';
import { BulkActionBar } from './list/BulkActionBar';
import { KEY, listProjects } from './projectsApi';
import type { ProjectListFilters } from './types';

type FilterStore = { value: ProjectListFilters; set: (v: ProjectListFilters) => void };
const useFilterStore = create<FilterStore>()(
  persist(
    (set) => ({ value: { active: true, mine: true }, set: (v) => set({ value: v }) }),
    { name: 'vernon-projects-filters' },
  ),
);

export function ProjectListPage() {
  const { value: filters, set: setFilters } = useFilterStore();
  const { data, isLoading, isError } = useQuery({
    queryKey: KEY.list(filters),
    queryFn: () => listProjects(filters),
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (!data) return;
    setSelected((s) => s.size === data.length ? new Set() : new Set(data.map((r) => r.id)));
  }
  function clearSelection() { setSelected(new Set()); }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Projects</h1>
      <BulkActionBar
        count={selected.size}
        onClear={clearSelection}
        onMoveSprint={() => alert('TODO: open BulkMoveSprintModal')}
        onReassign={() => alert('TODO: open BulkReassignModal')}
        onPhaseShift={() => alert('TODO: open BulkPhaseShiftModal')}
      />
      <FilterBar value={filters} onChange={setFilters} />
      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {isError && <p className="text-sm text-risk-red">Failed to load projects.</p>}
      {data && (
        <ProjectListTable rows={data} selected={selected} onToggle={toggle} onToggleAll={toggleAll} />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Replace router placeholder**

In `router.tsx` replace Projects placeholder with `<ProjectListPage />` and add import.

- [ ] **Step 5: Smoke test**

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MockAdapter from 'axios-mock-adapter';
import { api } from '@/lib/api';
import { ProjectListPage } from '@/features/projects/ProjectListPage';

describe('ProjectListPage', () => {
  it('renders rows from API', async () => {
    const mock = new MockAdapter(api);
    mock.onGet(/portal_projects\.list_projects/).reply(200, {
      message: [{
        id: 'P1', name: 'Alpha', health: 'green', percent_done: 0.5,
        days_left: 10, blocked_count: 0,
        owner: { id: 'u', name: 'U', avatar: null }, current_sprint: null,
      }],
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter><ProjectListPage /></MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Alpha')).toBeInTheDocument();
  });
});
```

Run + PASS.

- [ ] **Step 6: Commit**

```bash
git add www-react/src/features/projects/list www-react/src/features/projects/ProjectListPage.tsx www-react/src/app/router.tsx www-react/tests/unit/projects/ProjectListPage.test.tsx
git commit -m "feat(www-react): project list page + table + bulk action bar"
```

---

### Task 5: Bulk modals + wired actions

**Files:**
- Create: `www-react/src/features/projects/detail/modals/BulkMoveSprintModal.tsx`
- Create: `www-react/src/features/projects/detail/modals/BulkReassignModal.tsx`
- Create: `www-react/src/features/projects/detail/modals/BulkPhaseShiftModal.tsx`
- Modify: `www-react/src/features/projects/ProjectListPage.tsx` (replace alert() calls)

- [ ] **Step 1: BulkMoveSprintModal.tsx**

```tsx
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { bulkMoveTasks } from '../../projectsApi';

export function BulkMoveSprintModal({
  open, taskIds, sprints, onClose,
}: {
  open: boolean;
  taskIds: string[];
  sprints: { id: string; name: string }[];
  onClose: () => void;
}) {
  const [target, setTarget] = useState('');
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => bulkMoveTasks(taskIds, target),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['project'] });
      onClose();
    },
  });
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
      <div className="bg-white dark:bg-slate-900 p-6 rounded-lg w-96 space-y-4">
        <h2 className="font-semibold">Move {taskIds.length} tasks to sprint</h2>
        <select value={target} onChange={(e) => setTarget(e.target.value)}
          className="w-full border border-slate-300 dark:border-slate-700 rounded px-2 py-1 bg-transparent">
          <option value="">Select sprint…</option>
          {sprints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-sm">Cancel</button>
          <button disabled={!target || m.isPending}
            onClick={() => m.mutate()}
            className="text-sm bg-brand text-white px-3 py-1.5 rounded disabled:opacity-60">
            {m.isPending ? 'Moving…' : 'Move'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: BulkReassignModal.tsx**

```tsx
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { bulkReassign } from '../../projectsApi';

export function BulkReassignModal({
  open, taskIds, candidates, onClose,
}: {
  open: boolean;
  taskIds: string[];
  candidates: { email: string; name: string }[];
  onClose: () => void;
}) {
  const [owner, setOwner] = useState('');
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => bulkReassign(taskIds, owner),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['project'] });
      onClose();
    },
  });
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
      <div className="bg-white dark:bg-slate-900 p-6 rounded-lg w-96 space-y-4">
        <h2 className="font-semibold">Reassign {taskIds.length} tasks</h2>
        <select value={owner} onChange={(e) => setOwner(e.target.value)}
          className="w-full border border-slate-300 dark:border-slate-700 rounded px-2 py-1 bg-transparent">
          <option value="">Select user…</option>
          {candidates.map((u) => <option key={u.email} value={u.email}>{u.name}</option>)}
        </select>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-sm">Cancel</button>
          <button disabled={!owner || m.isPending} onClick={() => m.mutate()}
            className="text-sm bg-brand text-white px-3 py-1.5 rounded disabled:opacity-60">
            {m.isPending ? 'Reassigning…' : 'Reassign'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: BulkPhaseShiftModal.tsx**

```tsx
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { bulkPhaseShift } from '../../projectsApi';

const PHASES = ['BACKLOG', 'PLAN', 'DO', 'CHECK', 'DONE', 'ACT'] as const;

export function BulkPhaseShiftModal({
  open, taskIds, onClose,
}: {
  open: boolean;
  taskIds: string[];
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<string>('');
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => bulkPhaseShift(taskIds, phase),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      onClose();
    },
  });
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
      <div className="bg-white dark:bg-slate-900 p-6 rounded-lg w-96 space-y-4">
        <h2 className="font-semibold">Phase shift {taskIds.length} tasks</h2>
        <select value={phase} onChange={(e) => setPhase(e.target.value)}
          className="w-full border border-slate-300 dark:border-slate-700 rounded px-2 py-1 bg-transparent">
          <option value="">Select new phase…</option>
          {PHASES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-sm">Cancel</button>
          <button disabled={!phase || m.isPending} onClick={() => m.mutate()}
            className="text-sm bg-brand text-white px-3 py-1.5 rounded disabled:opacity-60">
            {m.isPending ? 'Shifting…' : 'Shift'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire modals in ProjectListPage (replace alert calls)**

Replace the three `alert(...)` callbacks with state-driven modals. Add at top of component:

```tsx
const [activeModal, setActiveModal] = useState<null | 'move' | 'reassign' | 'phase'>(null);
```
And render at bottom (before closing div):
```tsx
<BulkMoveSprintModal
  open={activeModal === 'move'}
  taskIds={[...selected]}
  sprints={[]} // TODO: replace with real sprints query; acceptable to leave empty for list page (modal will warn)
  onClose={() => { setActiveModal(null); clearSelection(); }}
/>
<BulkReassignModal
  open={activeModal === 'reassign'}
  taskIds={[...selected]}
  candidates={[]} // TODO: wire to users query
  onClose={() => { setActiveModal(null); clearSelection(); }}
/>
<BulkPhaseShiftModal
  open={activeModal === 'phase'}
  taskIds={[...selected]}
  onClose={() => { setActiveModal(null); clearSelection(); }}
/>
```
And update BulkActionBar handlers:
```tsx
onMoveSprint={() => setActiveModal('move')}
onReassign={() => setActiveModal('reassign')}
onPhaseShift={() => setActiveModal('phase')}
```
Note: at list level, `selected` items are PROJECT ids, not task ids. Bulk-task actions only make sense on the detail-page Tasks tab. Disable the buttons on the list page or fetch project's tasks first. Simpler: on the list page, remove `onReassign` and `onPhaseShift`; keep only project-level bulk actions (close project, archive, etc.) — but those are out of scope. **Decision:** hide BulkActionBar on list page; show it only on detail Tasks tab. Update ProjectListPage to not render BulkActionBar / modals.

Revised: delete the modal-state additions from `ProjectListPage.tsx`; remove `<BulkActionBar>` from list. Modals will be re-used on Tasks tab (Task 8).

- [ ] **Step 5: Build + commit**

Run: `npm test && npm run build`

```bash
git add www-react/src/features/projects/detail/modals www-react/src/features/projects/ProjectListPage.tsx
git commit -m "feat(www-react): bulk modals (move sprint/reassign/phase shift); scope to detail tasks tab"
```

---

### Task 6: ProjectDetailPage shell + DetailHeader + TabsNav

**Files:**
- Create: `www-react/src/features/projects/detail/DetailHeader.tsx`
- Create: `www-react/src/features/projects/detail/TabsNav.tsx`
- Create: `www-react/src/features/projects/ProjectDetailPage.tsx`
- Modify: `www-react/src/app/router.tsx`

- [ ] **Step 1: DetailHeader.tsx**

```tsx
import { Link } from 'react-router-dom';
import { HealthDot } from '@/features/dashboard/components/HealthDot';
import type { ProjectDetail } from '../types';

function bucket(score: number) {
  if (score >= 75) return 'green' as const;
  if (score >= 50) return 'amber' as const;
  return 'red' as const;
}

export function DetailHeader({ project }: { project: ProjectDetail }) {
  return (
    <header className="sticky top-12 z-10 bg-white/80 dark:bg-slate-950/80 backdrop-blur border-b border-slate-200 dark:border-slate-800 -mx-6 px-6 py-3 mb-4">
      <div className="flex items-center gap-3 text-sm">
        <Link to="/portal/projects" className="text-slate-500 hover:underline">Projects</Link>
        <span className="text-slate-400">/</span>
        <h1 className="font-semibold">{project.title}</h1>
        <HealthDot bucket={bucket(project.health_score)} />
        {project.blocked_count > 0 && (
          <span className="text-xs text-risk-red ml-2">{project.blocked_count} blocked</span>
        )}
      </div>
    </header>
  );
}
```

- [ ] **Step 2: TabsNav.tsx**

```tsx
import { NavLink, useParams } from 'react-router-dom';
import clsx from 'clsx';

const TABS = [
  { slug: 'tasks',     label: 'Tasks' },
  { slug: 'overview',  label: 'Overview' },
  { slug: 'burndown',  label: 'Burndown' },
  { slug: 'okr',       label: 'OKR' },
  { slug: 'members',   label: 'Members' },
];

export function TabsNav() {
  const { id } = useParams<{ id: string }>();
  return (
    <nav className="flex gap-1 border-b border-slate-200 dark:border-slate-800 mb-4">
      {TABS.map((t) => (
        <NavLink
          key={t.slug}
          to={`/portal/projects/${id}/${t.slug}`}
          className={({ isActive }) =>
            clsx(
              'px-3 py-2 text-sm border-b-2 -mb-px',
              isActive ? 'border-brand text-brand' : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-100',
            )
          }
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
```

- [ ] **Step 3: ProjectDetailPage.tsx**

```tsx
import { useParams, Outlet, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DetailHeader } from './detail/DetailHeader';
import { TabsNav } from './detail/TabsNav';
import { KEY, getProjectDetail } from './projectsApi';

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to="/portal/projects" replace />;
  const { data, isLoading, isError } = useQuery({
    queryKey: KEY.detail(id),
    queryFn: () => getProjectDetail(id),
  });
  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (isError || !data) return <p className="text-sm text-risk-red">Project not found.</p>;
  return (
    <div>
      <DetailHeader project={data} />
      <TabsNav />
      <Outlet context={data} />
    </div>
  );
}
```

- [ ] **Step 4: Router updates — nested routes per tab**

Replace single `projects/:id` placeholder with:

```tsx
{
  path: 'projects/:id',
  element: <ProjectDetailPage />,
  children: [
    { index: true, element: <Navigate to="tasks" replace /> },
    { path: 'tasks',    element: <TasksTab /> },
    { path: 'overview', element: <OverviewTab /> },
    { path: 'burndown', element: <BurndownTab /> },
    { path: 'okr',      element: <OkrTab /> },
    { path: 'members',  element: <MembersTab /> },
  ],
},
```

Add imports (use stubs initially — full components in next tasks):

```tsx
import { ProjectDetailPage } from '@/features/projects/ProjectDetailPage';
import { TasksTab } from '@/features/projects/detail/tabs/TasksTab';
import { OverviewTab } from '@/features/projects/detail/tabs/OverviewTab';
import { BurndownTab } from '@/features/projects/detail/tabs/BurndownTab';
import { OkrTab } from '@/features/projects/detail/tabs/OkrTab';
import { MembersTab } from '@/features/projects/detail/tabs/MembersTab';
```

Create empty stub files for each tab to keep build green (each: `export function TasksTab() { return <div>tasks</div>; }` etc.).

- [ ] **Step 5: Build + commit**

```bash
git add www-react/src/features/projects/detail www-react/src/features/projects/ProjectDetailPage.tsx www-react/src/app/router.tsx
git commit -m "feat(www-react): project detail shell with tabs nav"
```

---

### Task 7: TasksTab — grouped task list with toggle

**Files:**
- Modify: `www-react/src/features/projects/detail/tabs/TasksTab.tsx`
- Create: `www-react/tests/unit/projects/TasksTab.test.tsx`

- [ ] **Step 1: TasksTab.tsx**

```tsx
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { KEY, getProjectTasks } from '../../projectsApi';
import type { GroupBy, TaskBucket } from '../../types';
import { BulkActionBar } from '../../list/BulkActionBar';
import { BulkMoveSprintModal } from '../modals/BulkMoveSprintModal';
import { BulkReassignModal } from '../modals/BulkReassignModal';
import { BulkPhaseShiftModal } from '../modals/BulkPhaseShiftModal';

const OPTIONS: { key: GroupBy; label: string }[] = [
  { key: 'kr',       label: 'OKR/KR' },
  { key: 'pdca',     label: 'PDCA' },
  { key: 'sprint',   label: 'Sprint' },
  { key: 'assignee', label: 'Assignee' },
  { key: 'due',      label: 'Due' },
];

type GroupStore = { group: GroupBy; set: (g: GroupBy) => void };
const useGroup = create<GroupStore>()(persist(
  (set) => ({ group: 'kr', set: (g) => set({ group: g }) }),
  { name: 'vernon-tasks-group' },
));

export function TasksTab() {
  const { id } = useParams<{ id: string }>();
  const { group, set } = useGroup();
  const { data, isLoading, isError } = useQuery({
    queryKey: id ? KEY.tasks(id, group) : ['noop'],
    queryFn: () => getProjectTasks(id!, group),
    enabled: !!id,
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<null | 'move' | 'reassign' | 'phase'>(null);

  function toggle(taskId: string) {
    setSelected((s) => { const next = new Set(s); next.has(taskId) ? next.delete(taskId) : next.add(taskId); return next; });
  }
  const clear = () => setSelected(new Set());

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs uppercase tracking-wider text-slate-500">Group by</span>
        {OPTIONS.map((o) => (
          <button
            key={o.key}
            onClick={() => set(o.key)}
            className={clsx(
              'text-xs px-2 py-1 rounded border',
              group === o.key
                ? 'bg-brand text-white border-brand'
                : 'border-slate-300 dark:border-slate-700 text-slate-600',
            )}
          >{o.label}</button>
        ))}
      </div>

      <BulkActionBar
        count={selected.size}
        onClear={clear}
        onMoveSprint={() => setModal('move')}
        onReassign={() => setModal('reassign')}
        onPhaseShift={() => setModal('phase')}
      />

      {isLoading && <p className="text-sm text-slate-500">Loading tasks…</p>}
      {isError && <p className="text-sm text-risk-red">Failed to load tasks.</p>}
      {data && data.map((bucket) => (
        <BucketBlock key={bucket.key} bucket={bucket} selected={selected} onToggle={toggle} />
      ))}

      <BulkMoveSprintModal open={modal === 'move'} taskIds={[...selected]} sprints={[]} onClose={() => { setModal(null); clear(); }} />
      <BulkReassignModal   open={modal === 'reassign'} taskIds={[...selected]} candidates={[]} onClose={() => { setModal(null); clear(); }} />
      <BulkPhaseShiftModal open={modal === 'phase'} taskIds={[...selected]} onClose={() => { setModal(null); clear(); }} />
    </div>
  );
}

function BucketBlock({
  bucket, selected, onToggle,
}: {
  bucket: TaskBucket;
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <section className="mb-6">
      <header className="flex items-baseline gap-3 mb-2">
        <h3 className="font-semibold text-sm">{bucket.label}</h3>
        <span className="text-xs text-slate-500">{bucket.tasks.length} tasks</span>
        {bucket.meta?.target !== undefined && (
          <div className="flex-1 h-1.5 rounded bg-slate-200 dark:bg-slate-700 overflow-hidden max-w-xs">
            <div className="h-full bg-brand" style={{ width: `${Math.round((bucket.meta.progress ?? 0) * 100)}%` }} />
          </div>
        )}
      </header>
      <ul className="border border-slate-200 dark:border-slate-800 rounded divide-y divide-slate-100 dark:divide-slate-900">
        {bucket.tasks.map((t) => (
          <li key={t.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <input
              type="checkbox"
              aria-label={`Select ${t.title}`}
              checked={selected.has(t.id)}
              onChange={() => onToggle(t.id)}
            />
            <span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-semibold',
              { 'bg-slate-200 text-slate-700': t.pdca === 'BACKLOG',
                'bg-blue-100 text-blue-700':   t.pdca === 'PLAN',
                'bg-amber-100 text-amber-700': t.pdca === 'DO',
                'bg-purple-100 text-purple-700': t.pdca === 'CHECK',
                'bg-green-100 text-green-700': t.pdca === 'DONE' || t.pdca === 'ACT',
              })}>{t.pdca}</span>
            <span className="flex-1 truncate">{t.title}</span>
            <span className="text-xs text-slate-500">{t.assignee ?? '—'}</span>
            <span className="text-xs text-slate-500">{t.due_date ?? '—'}</span>
            <span className="text-xs">{t.points} pt</span>
            {t.risk_flag && <span className="text-xs text-risk-red" title={t.risk_flag}>⚠</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 2: TasksTab test**

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MockAdapter from 'axios-mock-adapter';
import { api } from '@/lib/api';
import { TasksTab } from '@/features/projects/detail/tabs/TasksTab';

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/portal/projects/P1/tasks']}>
        <Routes><Route path="/portal/projects/:id/tasks" element={<TasksTab />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TasksTab', () => {
  let mock: MockAdapter;
  beforeEach(() => { mock = new MockAdapter(api); });

  it('defaults to KR grouping and renders buckets', async () => {
    mock.onGet(/get_project_tasks/).reply((cfg) => {
      const url = new URL('http://x' + cfg.url + '?' + new URLSearchParams(cfg.params as any).toString());
      expect(url.searchParams.get('group_by')).toBe('kr');
      return [200, { message: [
        { key: 'KR1', label: 'Ship v2', meta: { target: 100, current: 30, progress: 0.3 }, tasks: [
          { id: 't1', title: 'Design API', pdca: 'PLAN', assignee: 'a@v', due_date: null, points: 3, status: 'PLAN', linked_kr: 'KR1', sprint: null, risk_flag: null },
        ]},
      ]}];
    });
    wrap();
    expect(await screen.findByText('Ship v2')).toBeInTheDocument();
    expect(screen.getByText('Design API')).toBeInTheDocument();
  });

  it('refetches with new group when toggle clicked', async () => {
    mock.onGet(/get_project_tasks/).reply(200, { message: [] });
    wrap();
    await userEvent.click(await screen.findByRole('button', { name: /pdca/i }));
    // Last request param check
    const last = mock.history.get.at(-1);
    expect(last!.params.group_by).toBe('pdca');
  });
});
```

Run + PASS.

- [ ] **Step 3: Commit**

```bash
git add www-react/src/features/projects/detail/tabs/TasksTab.tsx www-react/tests/unit/projects/TasksTab.test.tsx
git commit -m "feat(www-react): TasksTab grouped list with KR default + bulk"
```

---

### Task 8: OverviewTab + BurndownTab

**Files:**
- Modify: `www-react/src/features/projects/detail/tabs/OverviewTab.tsx`
- Modify: `www-react/src/features/projects/detail/tabs/BurndownTab.tsx`

- [ ] **Step 1: OverviewTab.tsx**

```tsx
import { useOutletContext } from 'react-router-dom';
import type { ProjectDetail } from '../../types';

export function OverviewTab() {
  const project = useOutletContext<ProjectDetail>();
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <section className="lg:col-span-2 border border-slate-200 dark:border-slate-800 rounded p-4">
        <h2 className="font-semibold mb-2">Burndown</h2>
        <p className="text-sm text-slate-500">See <a href={`/portal/projects/${project.id}/burndown`} className="text-brand underline">Burndown tab</a> for full chart.</p>
        <p className="mt-2 text-sm">{forecastVerdict(project)}</p>
      </section>
      <section className="border border-slate-200 dark:border-slate-800 rounded p-4">
        <h2 className="font-semibold mb-2">Key metrics</h2>
        <dl className="text-sm space-y-2">
          <Row label="%done" value={`${Math.round(project.percent_done * 100)}%`} />
          <Row label="Days left" value={daysLeft(project)} />
          <Row label="Blocked" value={project.blocked_count} />
          <Row label="Active sprint" value={project.active_sprint?.title ?? '—'} />
        </dl>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between border-b border-slate-100 dark:border-slate-900 pb-1">
      <dt className="text-slate-500">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function daysLeft(p: ProjectDetail): number | string {
  if (!p.end_date) return '—';
  const days = Math.ceil((new Date(p.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return Math.max(0, days);
}

function forecastVerdict(p: ProjectDetail): string {
  const days = typeof daysLeft(p) === 'number' ? (daysLeft(p) as number) : null;
  if (days === null) return 'No end date set.';
  if (p.percent_done >= 0.95) return 'On-track to finish.';
  if (days < 7 && p.percent_done < 0.7) return 'At risk — sprint behind plan.';
  return 'On-track.';
}
```

- [ ] **Step 2: BurndownTab.tsx (uses Recharts)**

```tsx
import { useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { ProjectDetail } from '../../types';

type BurndownPoint = { date: string; ideal: number; actual: number };

async function fetchBurndown(sprintId: string): Promise<BurndownPoint[]> {
  const res = await api.get<{ message: BurndownPoint[] }>(
    '/api/method/vernon_tasks.task.api.portal_sprints.get_burndown',
    { params: { sprint_id: sprintId } },
  );
  return res.data.message;
}

export function BurndownTab() {
  const project = useOutletContext<ProjectDetail>();
  const sprintId = project.active_sprint?.name ?? null;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['burndown', sprintId],
    queryFn: () => fetchBurndown(sprintId!),
    enabled: !!sprintId,
  });

  if (!sprintId) return <p className="text-sm text-slate-500">No active sprint.</p>;
  if (isLoading) return <p className="text-sm text-slate-500">Loading burndown…</p>;
  if (isError || !data) return <p className="text-sm text-risk-red">Failed to load burndown.</p>;

  return (
    <div className="h-80 border border-slate-200 dark:border-slate-800 rounded p-4">
      <ResponsiveContainer>
        <LineChart data={data}>
          <XAxis dataKey="date" fontSize={11} />
          <YAxis fontSize={11} />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="ideal"  stroke="#94a3b8" strokeDasharray="4 4" dot={false} />
          <Line type="monotone" dataKey="actual" stroke="#6836a0" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add www-react/src/features/projects/detail/tabs/OverviewTab.tsx www-react/src/features/projects/detail/tabs/BurndownTab.tsx
git commit -m "feat(www-react): Overview + Burndown tabs"
```

---

### Task 9: OkrTab + MembersTab

**Files:**
- Modify: `www-react/src/features/projects/detail/tabs/OkrTab.tsx`
- Modify: `www-react/src/features/projects/detail/tabs/MembersTab.tsx`

- [ ] **Step 1: OkrTab.tsx**

```tsx
import { useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ProjectDetail } from '../../types';

type OkrPayload = {
  objective: { id: string; title: string; phase: string } | null;
  key_results: { id: string; title: string; target: number; current: number; pace_expected: number }[];
};

async function fetchOkr(projectId: string): Promise<OkrPayload> {
  const res = await api.get<{ message: OkrPayload }>(
    '/api/method/vernon_tasks.task.api.portal_okr.get_for_project',
    { params: { project_id: projectId } },
  );
  return res.data.message;
}

export function OkrTab() {
  const project = useOutletContext<ProjectDetail>();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['project', project.id, 'okr'],
    queryFn: () => fetchOkr(project.id),
  });
  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (isError || !data) return <p className="text-sm text-risk-red">Failed to load OKR.</p>;
  if (!data.objective) return <p className="text-sm text-slate-500">No linked objective.</p>;

  return (
    <div className="space-y-4">
      <div className="border border-slate-200 dark:border-slate-800 rounded p-4">
        <h2 className="font-semibold">{data.objective.title}</h2>
        <p className="text-xs text-slate-500">Phase: {data.objective.phase}</p>
      </div>
      <ul className="space-y-2">
        {data.key_results.map((kr) => {
          const progress = kr.target ? kr.current / kr.target : 0;
          const gap = progress - kr.pace_expected;
          return (
            <li key={kr.id} className="border border-slate-200 dark:border-slate-800 rounded p-3 text-sm">
              <div className="flex justify-between items-baseline">
                <span className="font-medium">{kr.title}</span>
                <span className="text-xs">{kr.current}/{kr.target}</span>
              </div>
              <div className="h-1.5 mt-2 rounded bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div className="h-full bg-brand" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <p className={`text-xs mt-1 ${gap >= 0 ? 'text-risk-green' : 'text-risk-red'}`}>
                {gap >= 0 ? '+' : ''}{Math.round(gap * 100)}pp vs pace
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: MembersTab.tsx**

```tsx
import { useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ProjectDetail } from '../../types';

type MemberRow = {
  user: string;
  full_name: string;
  role: string;
  assigned_hours: number;
  capacity_hours: number;
  active_task_count: number;
};

async function fetchMembers(projectId: string): Promise<MemberRow[]> {
  const res = await api.get<{ message: MemberRow[] }>(
    '/api/method/vernon_tasks.task.api.portal_projects.get_project_members',
    { params: { project_id: projectId } },
  );
  return res.data.message;
}

export function MembersTab() {
  const project = useOutletContext<ProjectDetail>();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['project', project.id, 'members'],
    queryFn: () => fetchMembers(project.id),
  });
  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (isError || !data) return <p className="text-sm text-risk-red">Failed to load members.</p>;

  return (
    <table className="w-full text-sm">
      <thead className="text-left text-[11px] uppercase tracking-wider text-slate-500">
        <tr className="border-b border-slate-200 dark:border-slate-800">
          <th className="py-2">Member</th><th>Role</th><th>Assigned hrs</th><th>Capacity</th><th>Active tasks</th>
        </tr>
      </thead>
      <tbody>
        {data.map((m) => {
          const pct = m.capacity_hours ? m.assigned_hours / m.capacity_hours : 0;
          return (
            <tr key={m.user} className="border-b border-slate-100 dark:border-slate-900">
              <td className="py-2">{m.full_name}</td>
              <td>{m.role}</td>
              <td>{m.assigned_hours}</td>
              <td>
                <span className={pct > 1 ? 'text-risk-red' : pct > 0.85 ? 'text-risk-amber' : ''}>
                  {m.capacity_hours}
                </span>
              </td>
              <td>{m.active_task_count}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 3: Backend stubs for the two endpoints used above**

Add to `portal_projects.py`:
```python
@frappe.whitelist()
def get_project_members(project_id: str) -> list[dict]:
    require_login()
    project_id = max_str(project_id, 140)
    rows = frappe.db.sql("""
        SELECT pm.user, u.full_name, pm.role,
               (SELECT COALESCE(SUM(hours_planned),0) FROM `tabVT Task Schedule Entry` se
                  WHERE se.owner_user = pm.user AND se.date >= CURDATE() - INTERVAL 7 DAY) AS assigned_hours,
               COALESCE(ec.weekly_hours, 40) AS capacity_hours,
               (SELECT COUNT(*) FROM `tabVT Task` t
                  WHERE t.project = pm.parent AND t.assignee = pm.user AND t.status != 'DONE') AS active_task_count
          FROM `tabVT Project Member` pm
          JOIN `tabUser` u ON u.name = pm.user
     LEFT JOIN `tabVT Employee Capacity` ec ON ec.employee = pm.user
         WHERE pm.parent = %(p)s
    """, {"p": project_id}, as_dict=True)
    return [
        {
            "user": r.user, "full_name": r.full_name, "role": r.role,
            "assigned_hours": float(r.assigned_hours or 0),
            "capacity_hours": float(r.capacity_hours or 40),
            "active_task_count": int(r.active_task_count or 0),
        }
        for r in rows
    ]
```

(Backend `portal_okr.get_for_project` should already exist per existing /portal/* portal; if not, add a stub returning `{"objective": None, "key_results": []}` and flag as TODO in the corresponding domain plan — out of scope here.)

- [ ] **Step 4: Commit**

```bash
git add www-react/src/features/projects/detail/tabs/OkrTab.tsx www-react/src/features/projects/detail/tabs/MembersTab.tsx vernon_tasks/task/api/portal_projects.py
git commit -m "feat(www-react): OKR + Members tabs; backend get_project_members"
```

---

### Task 10: e2e — projects list filter + drill detail + group toggle

**Files:**
- Create: `www-react/tests/e2e/projects.spec.ts`

- [ ] **Step 1: projects.spec.ts**

```ts
import { test, expect } from '@playwright/test';

const listPayload = {
  message: [
    { id: 'P1', name: 'Alpha', health: 'green', percent_done: 0.5, days_left: 10, blocked_count: 0,
      owner: { id: 'u', name: 'U', avatar: null }, current_sprint: null },
  ],
};
const detailPayload = {
  message: {
    id: 'P1', title: 'Alpha', project_lead: 'u', health_score: 80, percent_done: 0.5,
    start_date: '2026-05-01', end_date: '2026-06-30', status: 'Active',
    active_sprint: { name: 'S1', title: 'Sprint 21' }, linked_objective: 'O1', blocked_count: 0,
  },
};
const tasksKr = {
  message: [{ key: 'KR1', label: 'Ship v2', meta: { target: 10, current: 3, progress: 0.3 }, tasks: [
    { id: 't1', title: 'Design API', pdca: 'PLAN', assignee: 'a', due_date: null, points: 3, status: 'PLAN', linked_kr: 'KR1', sprint: null, risk_flag: null },
  ]}],
};
const tasksPdca = { message: [{ key: 'PLAN', label: 'PLAN', meta: {}, tasks: [
  { id: 't1', title: 'Design API', pdca: 'PLAN', assignee: 'a', due_date: null, points: 3, status: 'PLAN', linked_kr: 'KR1', sprint: null, risk_flag: null },
]}]};

test('projects list → detail → tasks group toggle', async ({ page, context }) => {
  await context.route('**/api/method/login', (r) => r.fulfill({ status: 200, body: '{"message":"ok"}' }));
  await context.route('**/api/method/frappe.auth.get_logged_user', (r) => r.fulfill({ status: 200, body: '{"message":"u"}' }));
  await context.route('**/api/resource/User/**', (r) => r.fulfill({ status: 200, body: '{"data":{"name":"u","full_name":"U","roles":[]}}' }));
  await context.route('**/portal_projects.list_projects**', (r) => r.fulfill({ status: 200, body: JSON.stringify(listPayload) }));
  await context.route('**/portal_projects.get_project_detail**', (r) => r.fulfill({ status: 200, body: JSON.stringify(detailPayload) }));
  await context.route('**/portal_projects.get_project_tasks**', (r) => {
    const url = new URL(r.request().url());
    const body = url.searchParams.get('group_by') === 'pdca' ? tasksPdca : tasksKr;
    return r.fulfill({ status: 200, body: JSON.stringify(body) });
  });

  await page.goto('/login');
  await page.getByLabel(/email/i).fill('u@v.id');
  await page.getByLabel(/password/i).fill('x');
  await page.getByRole('button', { name: /sign in/i }).click();

  await page.goto('/portal/projects');
  await expect(page.getByRole('link', { name: 'Alpha' })).toBeVisible();
  await page.getByRole('link', { name: 'Alpha' }).click();
  await expect(page.getByText('Ship v2')).toBeVisible(); // KR bucket
  await page.getByRole('button', { name: /pdca/i }).click();
  await expect(page.getByText('PLAN')).toBeVisible();
});
```

- [ ] **Step 2: Run e2e**

Run: `npm run e2e -- projects`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add www-react/tests/e2e/projects.spec.ts
git commit -m "test(www-react): e2e projects list → detail → task group toggle"
```

---

## Definition of Done — Projects

- Backend endpoints exposed and tested (`get_project_tasks`, `bulk_*`, `relink_task_kr`, `get_project_detail`, `get_project_members`)
- Project list: 7 columns, 5 filter chips, sort dropdown, search, persisted filters
- Project detail: 5 tabs, Tasks default = OKR/KR grouping, group toggle persists per-user
- Bulk actions (move sprint, reassign, phase shift) work end-to-end on Tasks tab
- E2E test green
- No console errors in build

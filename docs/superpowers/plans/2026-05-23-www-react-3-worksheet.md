# www-react Worksheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Weekly planner at `/portal/worksheet`. Auto-pulls user's tasks for this/next week, lets user drag tasks from an Unscheduled tray into Mon–Sun day columns, with capacity bars, optimistic updates + undo toast, Friday review wrap-up, and a read-only PM team view (capacity figures only).

**Architecture:** dnd-kit drag-drop. Single `useWorksheet(week_start)` query feeds tray + week grid. Each drag fires a `schedule_task` mutation with optimistic cache update + 5s undo toast via sonner. Schedule entries persist in existing doctype `VT Task Schedule Entry`.

**Tech Stack:** Existing + `@dnd-kit/core`, `@dnd-kit/sortable`, `sonner` (toast), `date-fns`.

**Spec:** `docs/superpowers/specs/2026-05-23-www-react-dashboard-design.html` §4.

**Prereq:** Plans 0 + 1.

---

## File Structure

```
vernon_tasks/task/
  api/
    portal_worksheet.py
    test_portal_worksheet.py
  services/
    worksheet_aggregator.py
    test_worksheet_aggregator.py
www-react/src/
  features/worksheet/
    types.ts
    worksheetApi.ts
    WorksheetPage.tsx
    WeekHeader.tsx
    UnscheduledTray.tsx
    WeekGrid.tsx
    DayColumn.tsx
    TaskBlock.tsx
    CapacityBar.tsx
    FridayReviewBanner.tsx
    TeamView.tsx
www-react/tests/unit/worksheet/
  WorksheetPage.test.tsx
  DayColumn.test.tsx
www-react/tests/e2e/
  worksheet.spec.ts
```

---

### Task 1: Backend — worksheet aggregator service + endpoints

**Files:**
- Create: `vernon_tasks/task/services/worksheet_aggregator.py`
- Create: `vernon_tasks/task/services/test_worksheet_aggregator.py`
- Create: `vernon_tasks/task/api/portal_worksheet.py`
- Create: `vernon_tasks/task/api/test_portal_worksheet.py`

- [ ] **Step 1: Aggregator failing test**

```python
import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_tasks.task.services.worksheet_aggregator import build_worksheet

class TestWorksheetAggregator(FrappeTestCase):
    def test_payload_shape(self):
        frappe.set_user("Administrator")
        out = build_worksheet(user="Administrator", week_start="2026-05-18")
        self.assertEqual(set(out.keys()), {"week_start", "week_end", "capacity_hours", "days", "unscheduled"})
        self.assertEqual(len(out["days"]), 7)
        for d in out["days"]:
            self.assertIn("date", d)
            self.assertIn("entries", d)
            self.assertIn("scheduled_hours", d)

    def test_week_start_must_be_monday(self):
        with self.assertRaises(ValueError):
            build_worksheet(user="Administrator", week_start="2026-05-19")  # Tuesday
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement aggregator**

```python
"""Compose user's weekly worksheet payload."""
from __future__ import annotations
import frappe
from datetime import date, timedelta


def build_worksheet(user: str, week_start: str) -> dict:
    start = _parse_monday(week_start)
    end = start + timedelta(days=6)

    capacity = float(
        frappe.db.get_value("VT Employee Capacity", {"employee": user}, "weekly_hours") or 40
    )

    entries = frappe.db.sql("""
        SELECT se.name, se.task, se.date, se.hour_start, se.hours_planned,
               t.title, t.pdca_phase, t.points, t.linked_kr, t.project
          FROM `tabVT Task Schedule Entry` se
          JOIN `tabVT Task` t ON t.name = se.task
         WHERE se.owner_user = %(u)s
           AND se.date BETWEEN %(s)s AND %(e)s
    """, {"u": user, "s": start, "e": end}, as_dict=True)

    days = []
    for i in range(7):
        d = start + timedelta(days=i)
        day_entries = [_entry(e) for e in entries if e.date == d]
        scheduled = sum(e["hours_planned"] for e in day_entries)
        days.append({
            "date": str(d),
            "entries": sorted(day_entries, key=lambda e: e["hour_start"]),
            "scheduled_hours": round(scheduled, 2),
        })

    scheduled_task_ids = {e.task for e in entries}
    unscheduled_rows = frappe.db.sql("""
        SELECT name, title, pdca_phase, points, linked_kr, project, due_date
          FROM `tabVT Task`
         WHERE assignee = %(u)s
           AND status IN ('PLAN', 'DO', 'CHECK')
    """, {"u": user}, as_dict=True)
    unscheduled = [_unscheduled(r) for r in unscheduled_rows if r.name not in scheduled_task_ids]

    return {
        "week_start": str(start),
        "week_end":   str(end),
        "capacity_hours": capacity,
        "days": days,
        "unscheduled": unscheduled,
    }


def _parse_monday(s: str) -> date:
    d = date.fromisoformat(s)
    if d.weekday() != 0:
        raise ValueError("week_start must be a Monday")
    return d


def _entry(e: dict) -> dict:
    return {
        "id": e.name,
        "task_id": e.task,
        "title": e.title,
        "pdca": e.pdca_phase,
        "points": int(e.points or 0),
        "linked_kr": e.linked_kr,
        "project": e.project,
        "hour_start": int(e.hour_start or 8),
        "hours_planned": float(e.hours_planned or 1),
    }


def _unscheduled(r: dict) -> dict:
    return {
        "task_id": r.name,
        "title": r.title,
        "pdca": r.pdca_phase,
        "points": int(r.points or 0),
        "linked_kr": r.linked_kr,
        "project": r.project,
        "due_date": str(r.due_date) if r.due_date else None,
    }
```

- [ ] **Step 4: Endpoint failing test**

```python
import frappe
from frappe.tests.utils import FrappeTestCase

class TestPortalWorksheetApi(FrappeTestCase):
    def test_get_worksheet_requires_login(self):
        frappe.set_user("Guest")
        with self.assertRaises(frappe.PermissionError):
            frappe.get_attr("vernon_tasks.task.api.portal_worksheet.get_worksheet")(week_start="2026-05-18")

    def test_get_worksheet_returns_shape(self):
        frappe.set_user("Administrator")
        out = frappe.get_attr("vernon_tasks.task.api.portal_worksheet.get_worksheet")(week_start="2026-05-18")
        self.assertIn("days", out)
        self.assertIn("unscheduled", out)

    def test_team_view_requires_leader_role(self):
        frappe.set_user("Administrator")  # has all roles
        out = frappe.get_attr("vernon_tasks.task.api.portal_worksheet.get_team_worksheet")(week_start="2026-05-18")
        self.assertIsInstance(out, list)
```

- [ ] **Step 5: Run, expect FAIL.**

- [ ] **Step 6: Implement endpoints**

```python
"""Portal Worksheet API."""
import frappe
from frappe.utils import getdate
from vernon_tasks.task.api.security import require_login, max_str, clamp
from vernon_tasks.task.services.worksheet_aggregator import build_worksheet


@frappe.whitelist()
def get_worksheet(week_start: str) -> dict:
    require_login()
    return build_worksheet(user=frappe.session.user, week_start=max_str(week_start, 10))


@frappe.whitelist()
def schedule_task(task_id: str, date: str, hour_start: int = 8, hours: float = 1.0) -> dict:
    require_login()
    user = frappe.session.user
    # Verify task ownership
    owner = frappe.db.get_value("VT Task", task_id, "assignee")
    if owner != user:
        raise frappe.PermissionError("Cannot schedule another user's task")

    entry = frappe.get_doc({
        "doctype": "VT Task Schedule Entry",
        "task": task_id,
        "owner_user": user,
        "date": date,
        "hour_start": clamp(int(hour_start), 0, 23),
        "hours_planned": float(clamp(float(hours), 0.25, 12)),
    }).insert()
    return {"entry_id": entry.name}


@frappe.whitelist()
def update_entry(entry_id: str, date: str | None = None, hour_start: int | None = None, hours: float | None = None) -> dict:
    require_login()
    e = frappe.get_doc("VT Task Schedule Entry", entry_id)
    if e.owner_user != frappe.session.user:
        raise frappe.PermissionError
    if date is not None: e.date = date
    if hour_start is not None: e.hour_start = clamp(int(hour_start), 0, 23)
    if hours is not None: e.hours_planned = float(clamp(float(hours), 0.25, 12))
    e.save()
    return {"entry_id": e.name}


@frappe.whitelist()
def unschedule(entry_id: str) -> dict:
    require_login()
    e = frappe.get_doc("VT Task Schedule Entry", entry_id)
    if e.owner_user != frappe.session.user:
        raise frappe.PermissionError
    e.delete()
    return {"deleted": entry_id}


@frappe.whitelist()
def bulk_carry_over(week_start: str) -> dict:
    require_login()
    user = frappe.session.user
    from datetime import date as Date, timedelta
    cur = Date.fromisoformat(week_start)
    nxt = cur + timedelta(days=7)
    incomplete = frappe.db.sql("""
        SELECT se.name, se.task FROM `tabVT Task Schedule Entry` se
          JOIN `tabVT Task` t ON t.name = se.task
         WHERE se.owner_user = %(u)s
           AND se.date BETWEEN %(s)s AND %(e)s
           AND t.status NOT IN ('DONE','ACT')
    """, {"u": user, "s": cur, "e": cur + timedelta(days=6)}, as_dict=True)
    moved = 0
    for row in incomplete:
        frappe.db.set_value("VT Task Schedule Entry", row.name, "date", nxt)
        moved += 1
    return {"moved": moved}


@frappe.whitelist()
def get_team_worksheet(week_start: str) -> list[dict]:
    require_login()
    if not (frappe.has_role("Vernon Leader") or frappe.has_role("Vernon PM")):
        raise frappe.PermissionError("Team view requires Leader/PM role")

    from datetime import date as Date, timedelta
    start = Date.fromisoformat(week_start)
    end = start + timedelta(days=6)

    rows = frappe.db.sql("""
        SELECT se.owner_user AS user, u.full_name, se.date,
               SUM(se.hours_planned) AS hours,
               COUNT(*) AS task_count
          FROM `tabVT Task Schedule Entry` se
          JOIN `tabUser` u ON u.name = se.owner_user
         WHERE se.date BETWEEN %(s)s AND %(e)s
         GROUP BY se.owner_user, se.date, u.full_name
         ORDER BY u.full_name, se.date
    """, {"s": start, "e": end}, as_dict=True)

    by_user: dict[str, dict] = {}
    for r in rows:
        u = by_user.setdefault(r.user, {
            "user": r.user, "full_name": r.full_name,
            "days": {str(start + timedelta(days=i)): {"hours": 0, "task_count": 0} for i in range(7)},
        })
        u["days"][str(r.date)] = {"hours": float(r.hours or 0), "task_count": int(r.task_count or 0)}
    return list(by_user.values())
```

- [ ] **Step 7: Run all backend tests + PASS.**

- [ ] **Step 8: Commit**

```bash
git add vernon_tasks/task/services/worksheet_aggregator.py vernon_tasks/task/services/test_worksheet_aggregator.py vernon_tasks/task/api/portal_worksheet.py vernon_tasks/task/api/test_portal_worksheet.py
git commit -m "feat(api): worksheet aggregator + schedule/update/unschedule/carry_over endpoints"
```

---

### Task 2: Frontend types + worksheetApi

**Files:**
- Create: `www-react/src/features/worksheet/types.ts`
- Create: `www-react/src/features/worksheet/worksheetApi.ts`

- [ ] **Step 1: types.ts**

```ts
export type ScheduleEntry = {
  id: string;
  task_id: string;
  title: string;
  pdca: string;
  points: number;
  linked_kr: string | null;
  project: string;
  hour_start: number;
  hours_planned: number;
};

export type UnscheduledTask = {
  task_id: string;
  title: string;
  pdca: string;
  points: number;
  linked_kr: string | null;
  project: string;
  due_date: string | null;
};

export type WorksheetDay = {
  date: string;        // YYYY-MM-DD
  entries: ScheduleEntry[];
  scheduled_hours: number;
};

export type Worksheet = {
  week_start: string;
  week_end: string;
  capacity_hours: number;
  days: WorksheetDay[];
  unscheduled: UnscheduledTask[];
};

export type TeamWorksheetRow = {
  user: string;
  full_name: string;
  days: Record<string, { hours: number; task_count: number }>;
};
```

- [ ] **Step 2: worksheetApi.ts**

```ts
import { api } from '@/lib/api';
import type { Worksheet, TeamWorksheetRow } from './types';

const BASE = '/api/method/vernon_tasks.task.api.portal_worksheet';

export const WORKSHEET_KEY = (weekStart: string) => ['worksheet', weekStart] as const;
export const TEAM_WORKSHEET_KEY = (weekStart: string) => ['worksheet', 'team', weekStart] as const;

export async function getWorksheet(week_start: string): Promise<Worksheet> {
  const res = await api.get<{ message: Worksheet }>(`${BASE}.get_worksheet`, { params: { week_start } });
  return res.data.message;
}

export async function scheduleTask(args: { task_id: string; date: string; hour_start?: number; hours?: number }) {
  const res = await api.post<{ message: { entry_id: string } }>(`${BASE}.schedule_task`, args);
  return res.data.message;
}

export async function updateEntry(entry_id: string, patch: { date?: string; hour_start?: number; hours?: number }) {
  await api.post(`${BASE}.update_entry`, { entry_id, ...patch });
}

export async function unschedule(entry_id: string) {
  await api.post(`${BASE}.unschedule`, { entry_id });
}

export async function bulkCarryOver(week_start: string) {
  const res = await api.post<{ message: { moved: number } }>(`${BASE}.bulk_carry_over`, { week_start });
  return res.data.message.moved;
}

export async function getTeamWorksheet(week_start: string): Promise<TeamWorksheetRow[]> {
  const res = await api.get<{ message: TeamWorksheetRow[] }>(`${BASE}.get_team_worksheet`, { params: { week_start } });
  return res.data.message;
}
```

- [ ] **Step 3: Commit**

```bash
git add www-react/src/features/worksheet/types.ts www-react/src/features/worksheet/worksheetApi.ts
git commit -m "feat(www-react): worksheet API client + types"
```

---

### Task 3: WeekHeader + week navigation state

**Files:**
- Create: `www-react/src/features/worksheet/WeekHeader.tsx`
- Install: `date-fns`

- [ ] **Step 1: Install date-fns**

Run: `cd www-react && npm i date-fns`

- [ ] **Step 2: WeekHeader.tsx**

```tsx
import { addDays, format, parseISO, startOfWeek } from 'date-fns';

export function thisMondayISO(): string {
  return format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
}

export function WeekHeader({
  weekStart, capacityUsedPct, capacityHours, onPrev, onNext, onToday, view, onViewChange,
}: {
  weekStart: string;
  capacityUsedPct: number;
  capacityHours: number;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  view: 'week' | 'today' | 'next';
  onViewChange: (v: 'week' | 'today' | 'next') => void;
}) {
  const start = parseISO(weekStart);
  const end = addDays(start, 6);
  const usedHours = Math.round(capacityUsedPct * capacityHours);
  const barColor =
    capacityUsedPct > 1 ? 'bg-risk-red' :
    capacityUsedPct > 0.8 ? 'bg-risk-amber' :
    'bg-risk-green';

  return (
    <header className="flex items-center gap-3 mb-4">
      <div className="flex items-center gap-1">
        <button onClick={onPrev} aria-label="Previous week" className="w-8 h-8 rounded border border-slate-300 dark:border-slate-700">«</button>
        <button onClick={onToday} className="text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-700">Today</button>
        <button onClick={onNext} aria-label="Next week" className="w-8 h-8 rounded border border-slate-300 dark:border-slate-700">»</button>
      </div>
      <h1 className="font-semibold text-lg">
        {format(start, 'MMM d')} – {format(end, 'MMM d, yyyy')}
      </h1>
      <select value={view} onChange={(e) => onViewChange(e.target.value as 'week' | 'today' | 'next')}
        className="text-xs bg-transparent border border-slate-300 dark:border-slate-700 rounded px-2 py-1">
        <option value="week">This Week</option>
        <option value="today">Today</option>
        <option value="next">Next Week</option>
      </select>
      <div className="ml-auto flex items-center gap-3">
        <span className="text-xs text-slate-500">Capacity: {usedHours}h / {capacityHours}h</span>
        <div className="w-40 h-2 bg-slate-200 dark:bg-slate-700 rounded overflow-hidden">
          <div className={barColor} style={{ width: `${Math.min(100, capacityUsedPct * 100)}%`, height: '100%' }} />
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add www-react/src/features/worksheet/WeekHeader.tsx www-react/package.json www-react/package-lock.json
git commit -m "feat(www-react): WeekHeader with navigation + capacity bar"
```

---

### Task 4: TaskBlock + DayColumn + UnscheduledTray

**Files:**
- Create: `www-react/src/features/worksheet/TaskBlock.tsx`
- Create: `www-react/src/features/worksheet/CapacityBar.tsx`
- Create: `www-react/src/features/worksheet/DayColumn.tsx`
- Create: `www-react/src/features/worksheet/UnscheduledTray.tsx`
- Install: `@dnd-kit/core`, `sonner`

- [ ] **Step 1: Install deps**

Run: `cd www-react && npm i @dnd-kit/core sonner`

- [ ] **Step 2: TaskBlock.tsx**

```tsx
import { useDraggable } from '@dnd-kit/core';
import clsx from 'clsx';

type Props = {
  id: string;                     // draggable id: 'entry:<id>' or 'task:<id>'
  title: string;
  project: string;
  points: number;
  pdca: string;
  hours?: number;
  linkedKr?: string | null;
  variant?: 'tray' | 'scheduled';
};

export function TaskBlock({ id, title, project, points, pdca, hours, linkedKr, variant = 'tray' }: Props) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="button"
      aria-grabbed={isDragging}
      className={clsx(
        'rounded border bg-white dark:bg-slate-900 p-2 text-xs cursor-grab active:cursor-grabbing',
        variant === 'scheduled' ? 'border-brand/40' : 'border-slate-200 dark:border-slate-800',
        isDragging && 'opacity-50',
      )}
    >
      <div className="flex justify-between gap-2">
        <span className="font-medium truncate">{title}</span>
        <span className="text-[10px] text-slate-500">{project}</span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
        <span className="px-1 rounded bg-slate-100 dark:bg-slate-800">{pdca}</span>
        <span>{points} pt</span>
        {hours !== undefined && <span>{hours}h</span>}
        {linkedKr && <span title="Linked KR">◎</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: CapacityBar.tsx**

```tsx
import clsx from 'clsx';

export function CapacityBar({ scheduled, capacity }: { scheduled: number; capacity: number }) {
  const pct = capacity ? scheduled / capacity : 0;
  const color = pct > 1 ? 'bg-risk-red' : pct > 0.8 ? 'bg-risk-amber' : 'bg-risk-green';
  return (
    <div className="mt-auto">
      <div className="h-1.5 rounded bg-slate-200 dark:bg-slate-700 overflow-hidden">
        <div className={clsx('h-full', color)} style={{ width: `${Math.min(100, pct * 100)}%` }} />
      </div>
      <div className="text-[10px] text-slate-500 text-center mt-1">{scheduled}h / {capacity}h</div>
    </div>
  );
}
```

- [ ] **Step 4: DayColumn.tsx**

```tsx
import { useDroppable } from '@dnd-kit/core';
import { format, parseISO } from 'date-fns';
import clsx from 'clsx';
import { TaskBlock } from './TaskBlock';
import { CapacityBar } from './CapacityBar';
import type { WorksheetDay } from './types';

const DAILY_CAPACITY_HOURS = 8;

export function DayColumn({ day }: { day: WorksheetDay }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${day.date}` });
  const dt = parseISO(day.date);
  return (
    <div
      ref={setNodeRef}
      className={clsx(
        'flex flex-col gap-2 border border-slate-200 dark:border-slate-800 rounded p-2 min-h-[24rem]',
        isOver && 'bg-brand/5 border-brand',
      )}
    >
      <header className="text-xs">
        <div className="font-semibold">{format(dt, 'EEE')}</div>
        <div className="text-slate-500">{format(dt, 'MMM d')}</div>
      </header>
      <ul className="flex flex-col gap-2 flex-1">
        {day.entries.map((e) => (
          <li key={e.id}>
            <TaskBlock
              id={`entry:${e.id}`}
              title={e.title}
              project={e.project}
              points={e.points}
              pdca={e.pdca}
              hours={e.hours_planned}
              linkedKr={e.linked_kr}
              variant="scheduled"
            />
          </li>
        ))}
      </ul>
      <CapacityBar scheduled={day.scheduled_hours} capacity={DAILY_CAPACITY_HOURS} />
    </div>
  );
}
```

- [ ] **Step 5: UnscheduledTray.tsx**

```tsx
import { useState } from 'react';
import { TaskBlock } from './TaskBlock';
import type { UnscheduledTask } from './types';

export function UnscheduledTray({ tasks }: { tasks: UnscheduledTask[] }) {
  const [q, setQ] = useState('');
  const filtered = tasks.filter((t) =>
    t.title.toLowerCase().includes(q.toLowerCase()) ||
    t.project.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <aside className="w-64 border border-slate-200 dark:border-slate-800 rounded p-2 flex flex-col gap-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search unscheduled…"
        className="text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-transparent"
      />
      <div className="text-[10px] uppercase tracking-wider text-slate-500">
        Unscheduled · {tasks.length}
      </div>
      <ul className="flex flex-col gap-2 flex-1 overflow-y-auto">
        {filtered.map((t) => (
          <li key={t.task_id}>
            <TaskBlock
              id={`task:${t.task_id}`}
              title={t.title}
              project={t.project}
              points={t.points}
              pdca={t.pdca}
              linkedKr={t.linked_kr}
            />
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="text-xs text-slate-500">No tasks.</li>
        )}
      </ul>
    </aside>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add www-react/src/features/worksheet/TaskBlock.tsx www-react/src/features/worksheet/CapacityBar.tsx www-react/src/features/worksheet/DayColumn.tsx www-react/src/features/worksheet/UnscheduledTray.tsx www-react/package.json www-react/package-lock.json
git commit -m "feat(www-react): worksheet draggable blocks + day column + tray"
```

---

### Task 5: WeekGrid + WorksheetPage with drag-drop wiring

**Files:**
- Create: `www-react/src/features/worksheet/WeekGrid.tsx`
- Create: `www-react/src/features/worksheet/WorksheetPage.tsx`
- Modify: `www-react/src/app/router.tsx`
- Modify: `www-react/src/app/providers.tsx` (mount sonner Toaster)

- [ ] **Step 1: Mount Toaster in providers.tsx**

Add to JSX inside `<QueryClientProvider>`:

```tsx
import { Toaster } from 'sonner';
// …
<Toaster richColors position="bottom-right" />
```

- [ ] **Step 2: WeekGrid.tsx**

```tsx
import { DayColumn } from './DayColumn';
import type { WorksheetDay } from './types';

export function WeekGrid({ days }: { days: WorksheetDay[] }) {
  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((d) => <DayColumn key={d.date} day={d} />)}
    </div>
  );
}
```

- [ ] **Step 3: WorksheetPage.tsx**

```tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { addDays, parseISO, format } from 'date-fns';
import { toast } from 'sonner';
import { WORKSHEET_KEY, getWorksheet, scheduleTask, updateEntry, unschedule } from './worksheetApi';
import { thisMondayISO, WeekHeader } from './WeekHeader';
import { WeekGrid } from './WeekGrid';
import { UnscheduledTray } from './UnscheduledTray';
import { FridayReviewBanner } from './FridayReviewBanner';
import type { Worksheet } from './types';

export function WorksheetPage() {
  const [weekStart, setWeekStart] = useState<string>(thisMondayISO());
  const [view, setView] = useState<'week' | 'today' | 'next'>('week');
  const qc = useQueryClient();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const { data, isLoading, isError } = useQuery({
    queryKey: WORKSHEET_KEY(weekStart),
    queryFn: () => getWorksheet(weekStart),
  });

  const scheduleM = useMutation({
    mutationFn: scheduleTask,
    onMutate: async ({ task_id, date }) => {
      await qc.cancelQueries({ queryKey: WORKSHEET_KEY(weekStart) });
      const prev = qc.getQueryData<Worksheet>(WORKSHEET_KEY(weekStart));
      if (!prev) return { prev };
      const t = prev.unscheduled.find((u) => u.task_id === task_id);
      if (!t) return { prev };
      const optimisticEntry = {
        id: `tmp-${task_id}-${date}`,
        task_id, title: t.title, project: t.project, pdca: t.pdca,
        points: t.points, linked_kr: t.linked_kr, hour_start: 8, hours_planned: 1,
      };
      const next: Worksheet = {
        ...prev,
        unscheduled: prev.unscheduled.filter((u) => u.task_id !== task_id),
        days: prev.days.map((d) =>
          d.date === date
            ? { ...d, entries: [...d.entries, optimisticEntry], scheduled_hours: d.scheduled_hours + 1 }
            : d,
        ),
      };
      qc.setQueryData(WORKSHEET_KEY(weekStart), next);
      return { prev };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(WORKSHEET_KEY(weekStart), ctx.prev);
      toast.error('Failed to schedule task');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: WORKSHEET_KEY(weekStart) }),
  });

  const moveM = useMutation({
    mutationFn: ({ entry_id, date }: { entry_id: string; date: string }) => updateEntry(entry_id, { date }),
    onSettled: () => qc.invalidateQueries({ queryKey: WORKSHEET_KEY(weekStart) }),
  });

  function onDragEnd(e: DragEndEvent) {
    const dragId = String(e.active.id);
    const dropId = e.over?.id ? String(e.over.id) : null;
    if (!dropId || !dropId.startsWith('day:')) return;
    const date = dropId.slice(4);

    if (dragId.startsWith('task:')) {
      const taskId = dragId.slice(5);
      scheduleM.mutate({ task_id: taskId, date, hour_start: 8, hours: 1 });
      toast('Scheduled', {
        action: {
          label: 'Undo',
          onClick: async () => {
            const ws = qc.getQueryData<Worksheet>(WORKSHEET_KEY(weekStart));
            const entry = ws?.days.find((d) => d.date === date)?.entries.find((en) => en.task_id === taskId);
            if (entry && !entry.id.startsWith('tmp-')) await unschedule(entry.id);
            qc.invalidateQueries({ queryKey: WORKSHEET_KEY(weekStart) });
          },
        },
        duration: 5000,
      });
    } else if (dragId.startsWith('entry:')) {
      const entryId = dragId.slice(6);
      moveM.mutate({ entry_id: entryId, date });
    }
  }

  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (isError || !data) return <p className="text-sm text-risk-red">Failed to load worksheet.</p>;

  const capacityUsedPct = data.capacity_hours
    ? data.days.reduce((sum, d) => sum + d.scheduled_hours, 0) / data.capacity_hours
    : 0;

  const visibleDays =
    view === 'today'
      ? data.days.filter((d) => d.date === format(new Date(), 'yyyy-MM-dd'))
      : data.days;

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <WeekHeader
        weekStart={weekStart}
        capacityHours={data.capacity_hours}
        capacityUsedPct={capacityUsedPct}
        onPrev={() => setWeekStart(format(addDays(parseISO(weekStart), -7), 'yyyy-MM-dd'))}
        onNext={() => setWeekStart(format(addDays(parseISO(weekStart), 7),  'yyyy-MM-dd'))}
        onToday={() => setWeekStart(thisMondayISO())}
        view={view}
        onViewChange={setView}
      />
      <FridayReviewBanner weekStart={weekStart} />
      <div className="flex gap-3">
        <UnscheduledTray tasks={data.unscheduled} />
        <div className="flex-1">
          <WeekGrid days={visibleDays} />
        </div>
      </div>
    </DndContext>
  );
}
```

- [ ] **Step 4: Replace router placeholder**

In `router.tsx`: replace `worksheet` element with `<WorksheetPage />`. Add import.

- [ ] **Step 5: Build, expect PASS.**

- [ ] **Step 6: Commit**

```bash
git add www-react/src/features/worksheet/WeekGrid.tsx www-react/src/features/worksheet/WorksheetPage.tsx www-react/src/app/providers.tsx www-react/src/app/router.tsx
git commit -m "feat(www-react): worksheet page with dnd-kit + optimistic schedule + undo"
```

---

### Task 6: FridayReviewBanner + bulk carry-over

**Files:**
- Create: `www-react/src/features/worksheet/FridayReviewBanner.tsx`

- [ ] **Step 1: FridayReviewBanner.tsx**

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { bulkCarryOver, WORKSHEET_KEY } from './worksheetApi';

function isFridayAfternoon(): boolean {
  const d = new Date();
  return d.getDay() === 5 && d.getHours() >= 15;
}

export function FridayReviewBanner({ weekStart }: { weekStart: string }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => bulkCarryOver(weekStart),
    onSuccess: (moved) => {
      toast.success(`Carried over ${moved} tasks to next week`);
      qc.invalidateQueries({ queryKey: WORKSHEET_KEY(weekStart) });
    },
  });
  if (!isFridayAfternoon()) return null;
  return (
    <div className="rounded border border-brand/40 bg-brand-subtle px-4 py-2 mb-3 flex items-center gap-3 text-sm">
      <span>Wrap up the week: move incomplete tasks to next Monday?</span>
      <button
        onClick={() => m.mutate()}
        disabled={m.isPending}
        className="ml-auto text-xs bg-brand text-white px-3 py-1 rounded"
      >
        {m.isPending ? 'Working…' : 'Carry over now'}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add www-react/src/features/worksheet/FridayReviewBanner.tsx
git commit -m "feat(www-react): Friday review banner with bulk carry-over"
```

---

### Task 7: TeamView toggle for PM/Leader

**Files:**
- Create: `www-react/src/features/worksheet/TeamView.tsx`
- Modify: `www-react/src/features/worksheet/WorksheetPage.tsx`

- [ ] **Step 1: TeamView.tsx**

```tsx
import { useQuery } from '@tanstack/react-query';
import { TEAM_WORKSHEET_KEY, getTeamWorksheet } from './worksheetApi';
import clsx from 'clsx';
import { parseISO, format, addDays } from 'date-fns';

export function TeamView({ weekStart }: { weekStart: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: TEAM_WORKSHEET_KEY(weekStart),
    queryFn: () => getTeamWorksheet(weekStart),
  });
  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (isError || !data) return <p className="text-sm text-risk-red">Forbidden or failed to load.</p>;

  const start = parseISO(weekStart);
  const dates = Array.from({ length: 7 }, (_, i) => format(addDays(start, i), 'yyyy-MM-dd'));

  return (
    <table className="w-full text-xs">
      <thead className="text-left text-[10px] uppercase tracking-wider text-slate-500">
        <tr className="border-b border-slate-200 dark:border-slate-800">
          <th className="py-2">Member</th>
          {dates.map((d) => <th key={d}>{format(parseISO(d), 'EEE d')}</th>)}
        </tr>
      </thead>
      <tbody>
        {data.map((row) => (
          <tr key={row.user} className="border-b border-slate-100 dark:border-slate-900">
            <td className="py-2">{row.full_name}</td>
            {dates.map((d) => {
              const cell = row.days[d] ?? { hours: 0, task_count: 0 };
              const overload = cell.hours > 8;
              return (
                <td key={d} className={clsx(overload && 'text-risk-red font-medium')}>
                  {cell.hours}h
                  <span className="text-[10px] text-slate-500 block">{cell.task_count} t</span>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 2: Add toggle to WorksheetPage**

In `WorksheetPage.tsx`:
```tsx
import { useSession } from '@/features/auth/useSession';
import { TeamView } from './TeamView';
// …
const { data: session } = useSession();
const canSeeTeam = !!session?.roles.some((r) => r === 'Vernon Leader' || r === 'Vernon PM');
const [tab, setTab] = useState<'personal' | 'team'>('personal');
```
Add toggle to top right of WeekHeader area (or duplicate small toolbar):
```tsx
{canSeeTeam && (
  <div className="flex justify-end mb-2">
    <div className="inline-flex border border-slate-300 dark:border-slate-700 rounded">
      <button onClick={() => setTab('personal')}
        className={clsx('px-3 py-1 text-xs', tab === 'personal' ? 'bg-brand text-white' : '')}>Personal</button>
      <button onClick={() => setTab('team')}
        className={clsx('px-3 py-1 text-xs', tab === 'team' ? 'bg-brand text-white' : '')}>Team</button>
    </div>
  </div>
)}
```
Render `<TeamView weekStart={weekStart} />` when `tab === 'team'`; otherwise existing grid.

- [ ] **Step 3: Commit**

```bash
git add www-react/src/features/worksheet/TeamView.tsx www-react/src/features/worksheet/WorksheetPage.tsx
git commit -m "feat(www-react): team worksheet read-only capacity view"
```

---

### Task 8: e2e — drag task → day cell

**Files:**
- Create: `www-react/tests/e2e/worksheet.spec.ts`

- [ ] **Step 1: worksheet.spec.ts**

```ts
import { test, expect } from '@playwright/test';

const initialPayload = {
  message: {
    week_start: '2026-05-18', week_end: '2026-05-24', capacity_hours: 40,
    days: Array.from({ length: 7 }, (_, i) => ({
      date: `2026-05-${18 + i}`, entries: [], scheduled_hours: 0,
    })),
    unscheduled: [
      { task_id: 'T1', title: 'Write spec', pdca: 'PLAN', points: 3, linked_kr: null, project: 'Alpha', due_date: null },
    ],
  },
};
const afterSchedule = {
  message: {
    ...initialPayload.message,
    unscheduled: [],
    days: initialPayload.message.days.map((d, i) =>
      i === 0
        ? { ...d, entries: [{ id: 'E1', task_id: 'T1', title: 'Write spec', pdca: 'PLAN', points: 3, linked_kr: null, project: 'Alpha', hour_start: 8, hours_planned: 1 }], scheduled_hours: 1 }
        : d,
    ),
  },
};

test('drag unscheduled task into Monday', async ({ page, context }) => {
  let calls = 0;
  await context.route('**/api/method/login', (r) => r.fulfill({ status: 200, body: '{"message":"ok"}' }));
  await context.route('**/api/method/frappe.auth.get_logged_user', (r) => r.fulfill({ status: 200, body: '{"message":"u"}' }));
  await context.route('**/api/resource/User/**', (r) => r.fulfill({ status: 200, body: '{"data":{"name":"u","full_name":"U","roles":[]}}' }));
  await context.route('**/portal_worksheet.get_worksheet**', (r) => {
    calls++;
    return r.fulfill({ status: 200, body: JSON.stringify(calls === 1 ? initialPayload : afterSchedule) });
  });
  await context.route('**/portal_worksheet.schedule_task**', (r) =>
    r.fulfill({ status: 200, body: '{"message":{"entry_id":"E1"}}' }),
  );

  await page.goto('/login');
  await page.getByLabel(/email/i).fill('u@v.id');
  await page.getByLabel(/password/i).fill('x');
  await page.getByRole('button', { name: /sign in/i }).click();

  await page.goto('/portal/worksheet');
  const card = page.getByRole('button', { name: /write spec/i });
  await expect(card).toBeVisible();
  const target = page.locator('[data-day-date]', { hasText: 'May 18' }).first();
  // dnd-kit requires pointer events:
  await card.dragTo(target);
  // Server response triggers refetch → entry visible
  await expect(page.getByText(/write spec/i).first()).toBeVisible();
});
```

> Note: `data-day-date` attribute — add it in `DayColumn.tsx`:
```tsx
<div ref={setNodeRef} data-day-date={day.date} className="…">
```

- [ ] **Step 2: Update DayColumn.tsx with data attribute (see Step 1 note).**

- [ ] **Step 3: Run e2e**

Run: `npm run e2e -- worksheet`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add www-react/tests/e2e/worksheet.spec.ts www-react/src/features/worksheet/DayColumn.tsx
git commit -m "test(www-react): e2e worksheet drag → schedule"
```

---

## Definition of Done — Worksheet

- Backend `portal_worksheet.*` endpoints + ownership/role checks tested
- Drag unscheduled task → day creates entry, optimistic UI flips, undo toast restores
- Capacity bar colours change at thresholds (≤80% green, ≤100% amber, >100% red)
- Friday banner appears Fri 15:00+, bulk-moves incomplete tasks
- PM team view loads (Leader/PM only) — capacity figures only, no content peek
- E2E green

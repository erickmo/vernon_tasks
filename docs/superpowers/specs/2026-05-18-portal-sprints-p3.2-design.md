# Portal Sprints P3.2 — Design Spec

**Date:** 2026-05-18
**Parent PRD:** `docs/superpowers/specs/2026-05-17-portal-projects-p3-design.md`
**Status:** Draft — pending review
**Owner:** Erick Mo

## 1. Scope

Desktop portal Sprint domain — sprint board (project-level), sprint detail with task board (sprint-level), task drag/reorder, sprint create/edit, burndown chart. Mounts at `/portal/projects/:projectId/sprints/*` behind `portal_sprints_enabled` flag. Replaces ad-hoc sprint management in Frappe desk for portal users.

**In scope (P3.2):**
- Sprint board: 4 columns (Planning / Active / Review / Closed), sprint cards, drag sprint → status change.
- Sprint CRUD: create, edit (title, project locked, dates, goal, status). No delete in portal (use desk).
- Task board (per-sprint): toggle between `kanban_status` (default, 7 cols) and `pdca_phase` (6 cols) groupings. Drag task → column change + reorder within column.
- Burndown chart: estimated_hours-based, daily series, ideal vs actual line.
- Permission model: Manager/Leader full edit; Member moves only own (`assigned_to=session.user`) tasks.

**Non-goals (P3.2, deferred):**
- Task CRUD inside board — move only. Create/edit tasks still via Frappe desk (P3.3 handles).
- Cross-sprint task drag.
- Sprint delete from portal.
- Sprint templates / recurring sprints.
- Velocity history chart (P3.3).
- Sprint Task child table cleanup — soft-deprecated here, removed in P3.3 after observation window.

## 2. Architecture

### 2.1 Backend module — `vernon_tasks/api/sprints.py`

Sibling to `vernon_tasks/api/projects.py` (matches existing portal-backend convention). Whitelisted RPC endpoints (exposed as `vernon_tasks.api.sprints.*`):

- `list_sprints(project, filters)` — filter by status (IN), date-range overlap on start_date/end_date; aggregates `{task_count, open_hours, completed_hours}` per sprint; ORDER BY start_date DESC; LIMIT 200.
- `get_sprint_with_relations(name)` — returns `{sprint, project_summary, tasks}`. `tasks` is the full task list for the board: `{name, title, assigned_to, kanban_status, pdca_phase, kanban_rank, estimated_hours, weight, priority}`.
- `create_sprint(payload)` — `{sprint_title, project, start_date, end_date, goal, status}`. Validates date sequence and project permission.
- `update_sprint(name, payload)` — same fields, project not mutable. Permission per Frappe doc perm.
- `bulk_update_sprints(names, payload)` — `status` batch only; transactional; returns `{updated, skipped}` with reasons.
- `move_task(task, kanban_status?, pdca_phase?, kanban_rank?, sprint?)` — single atomic write. Server-side perm: Manager/Leader any task; Member only when `task.assigned_to == frappe.session.user`. Returns updated task. Invalidates burndown cache for the affected sprint.
- `get_sprint_burndown(sprint)` — see §5.
- `rebalance_column(sprint, axis, column_value)` — recompute ranks for the given column; sets `kanban_rank = (index+1) * 1000` ordered by current rank ASC; transactional.

Reuse `vernon_tasks/okr/pdca.py` for PDCA transitions; do not copy.

### 2.2 Schema delta

- Add field `kanban_rank` (Float, no default, no required) to `VT Task` via patch.
- Lazy populate: on first call to `get_sprint_with_relations`, any task with `kanban_rank IS NULL` gets `rank = creation_unix_ts * 1000` written back in a single batch. Idempotent.
- `Sprint Task` child table: leave intact, stop writing. P3.3 removes after 2 sprints of zero new writes (telemetry tracked).

### 2.3 Feature flag

- `portal_sprints_enabled` (Check, default `0`) added to `VT Settings`. Gates route registration + nav link visibility. Server endpoints still callable (validate flag at endpoint entry; raise `frappe.PermissionError` if off).

### 2.4 Frontend module — `pwa/src/portal/sprints/`

Mirrors `portal/projects/` layout:

```
SprintRoutes.tsx          // nested under :projectId/sprints/*
SprintsFeatureGate.tsx    // reads portal_sprints_enabled
SprintBoard.tsx           // 4-col board, sprint cards, dnd-kit
SprintCard.tsx
SprintEditor.tsx          // modal: create/edit
SprintDetail.tsx          // header + tabs: Board | Burndown
TaskBoard.tsx             // toggle kanban_status / pdca_phase
TaskCard.tsx
BurndownChart.tsx         // inline SVG
api/sprints.ts            // RPC wrappers
hooks/useSprintBoard.ts
hooks/useTaskBoard.ts
hooks/useBurndown.ts
lib/rank.ts               // fractional indexing
```

Mounted from `ProjectRoutes.tsx`:

```tsx
<Route path=":projectId/sprints/*" element={
  <SprintsFeatureGate><SprintRoutes/></SprintsFeatureGate>
} />
```

`ProjectDetail.tsx` gains a "Sprints" link that navigates to the nested board.

## 3. Drag-drop semantics

### 3.1 dnd-kit configuration

- One `DndContext` per board. `SortableContext` per column with `verticalListSortingStrategy`.
- Sensors: `PointerSensor` (activation distance 5px) + `KeyboardSensor` (a11y — Space picks up, arrows move, Enter drops).
- `DragOverlay` for visual lift; original card grays.
- Member-disallowed cards: `disabled` prop on `useSortable`; visually muted.

### 3.2 Fractional rank — `lib/rank.ts`

- Insert between A (rank=1000) and B (rank=2000) → midpoint 1500.
- Top of column (no prev) → `next_rank - 1000`.
- Bottom (no next) → `prev_rank + 1000`.
- Collision: when `|new_rank - neighbor_rank| < 0.0001`, request server rebalance for the entire column (`POST portal.sprints.rebalance_column`, scope=`{sprint, kanban_status_or_pdca_phase}`, sets ranks = (index+1) * 1000).

### 3.3 Optimistic flow

1. On drop, mutate local React Query cache: card removed from source column, inserted at target index, `kanban_status`/`kanban_rank` updated.
2. POST `move_task` with new field values.
3. Success → reconcile server response into cache (server is authoritative on final rank).
4. Failure → rollback to pre-drag cache snapshot, show error toast quoting server message.
5. Concurrent moves: last-write-wins on rank. Server returns the resulting rank; client diffs and re-renders.

### 3.4 Cross-column side-effects

- Moving to `kanban_status=Done` column → server sets `completion_date = today` if null.
- Moving to `pdca_phase=DONE` column (PDCA view) → server runs existing PDCA hooks (scoring, points, etc.).
- The two fields are independent: switching the view toggle does not auto-sync the unselected field. Moving in PDCA view does not change kanban_status, and vice versa. This is intentional — they represent different lifecycle axes.

## 4. Permissions

Enforced server-side in `move_task`, `create_sprint`, `update_sprint`, `bulk_update_sprints`:

| Action | Manager | Leader | Member |
|---|---|---|---|
| View sprint board / task board | yes | yes | yes (where project visible) |
| Create / edit sprint | yes | yes | no |
| Bulk update sprint status | yes | yes | no |
| Move sprint card (drag) | yes | yes | no |
| Move any task | yes | yes | no |
| Move own task (`assigned_to=self`) | yes | yes | yes |
| Rebalance column | yes | yes | no |

Client hides/disables disallowed affordances; server is authoritative — UI hint only.

## 5. Burndown calculation

### 5.1 Series

- x-axis: each day from `sprint.start_date` to `min(today, sprint.end_date)`.
- `remaining_hours[d]` = Σ `estimated_hours` of tasks WHERE `task.sprint = :sprint` AND task was not in a Done state by EOD of `d`.
- "Done by EOD `d`" source priority:
  1. Most recent `tabVersion` row for that task with `data` containing `kanban_status: Done` and `creation <= EOD(d)`.
  2. Fallback: `completion_date <= d` if no version log.
- `ideal_hours[d]` = `total_hours_at_sprint_start * (1 - (d - start) / (end - start))`. Clamped ≥ 0.
- `total_hours_at_sprint_start` is the snapshot at start; later scope additions appear as upward bumps in `remaining` line.

### 5.2 API

```
GET vernon_tasks.api.sprints.get_sprint_burndown?sprint=SP-2026-00001
→ {
    "sprint": "SP-2026-00001",
    "start_date": "2026-05-18",
    "end_date": "2026-05-31",
    "total_hours": 120,
    "series": [
      {"date": "2026-05-18", "remaining": 120, "ideal": 120.0},
      {"date": "2026-05-19", "remaining": 118, "ideal": 111.4},
      ...
    ]
  }
```

### 5.3 Caching

- `frappe.cache().set_value(f"burndown:{sprint}", payload, expires_in_sec=300)`.
- Invalidated in `move_task` when affected task's sprint is set.
- Invalidated in `update_sprint` when dates change.

### 5.4 Render

- Inline SVG, no chart library. ~80 LOC component.
- Two `<path>` elements (ideal, actual), x-axis tick per day or per week (per sprint length).
- Tooltip on hover shows `{date, remaining, ideal}`.

## 6. Testing

### 6.1 Backend — `tests/portal/test_sprints.py`

- `list_sprints` filter matrix: status, date range, project scoping.
- `move_task` permission matrix: Manager/Leader/Member × own/other task × move type.
- `move_task` rank semantics: midpoint, top, bottom, collision → rebalance.
- `get_sprint_burndown` math: empty sprint, mid-sprint snapshot, fully done, scope creep mid-sprint.
- `create_sprint` / `update_sprint` validation: date sequence, project perm.
- `bulk_update_sprints` partial-skip cases.

### 6.2 Frontend — Vitest + RTL

- Per-component `.test.tsx` for SprintBoard, SprintCard, SprintEditor, TaskBoard, TaskCard, BurndownChart.
- Drag tests via `@dnd-kit/test` keyboard sensor — deterministic.
- `__integration.test.tsx` over `SprintRoutes` mirroring P3.1 pattern.
- BurndownChart snapshot test with fixed-fixture series.
- Optimistic rollback test: mock `move_task` reject → assert cache reverted + toast shown.

## 7. Telemetry

Events emitted via existing portal telemetry sink:

- `sprint_board_view` `{project, sprint_count}`
- `sprint_move` `{sprint, from_status, to_status}`
- `sprint_created` `{sprint, project}`
- `sprint_updated` `{sprint, changed_fields}`
- `task_move` `{task, sprint, axis: "kanban"|"pdca", from, to}`
- `task_rank_change` `{task, sprint}`
- `task_board_axis_toggle` `{sprint, axis}`
- `burndown_view` `{sprint}`
- `rank_rebalance` `{sprint, axis, column}`

## 8. Rollout

1. Schema patch — add `VT Task.kanban_rank` Float; no backfill.
2. Backend deploy behind `portal_sprints_enabled=0`. Verify endpoints reject when flag off.
3. Pilot org flips flag → smoke 1 sprint cycle: create sprint → assign tasks (via desk) → run board through Planning → Active → Review → Closed → review burndown.
4. Enable globally.
5. After 2 closed sprints with zero `Sprint Task` writes (telemetry): schedule P3.3 cleanup to drop child table.

## 9. Open questions / risks

- **Sprint Task child table soft-deprecation** — existing Frappe desk forms may still write to it via form scripts; need to scan and disable.
- **Rebalance under load** — if multiple users drag simultaneously in same column, repeated rebalances could thrash. Mitigation: rebalance threshold conservative (collision floor 0.0001 is generous); rebalance is transactional.
- **Burndown version-log dependency** — relies on Frappe `tabVersion` capturing `kanban_status` changes. Verify `track_changes=1` on VT Task (it is, per schema) and that the field is in tracked set.

## 10. Sub-PRD chain

- Parent: `2026-05-17-portal-projects-p3-design.md`
- Predecessor: P3.1 (Implemented).
- Successors: P3.3 (VT Task CRUD + dependencies in portal), P3.4 (Milestones + Documentation), P3.5 (Team Member capacity).

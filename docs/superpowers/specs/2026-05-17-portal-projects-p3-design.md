# PRD — Portal Projects Module (P3.1)

**Status:** Implemented (P3.1)
**Date:** 2026-05-17
**Owner:** Vernon Tasks
**Parent:** [Desktop Portal Foundation (Phase 1)](2026-05-17-desktop-portal-foundation-design.md)
**Sibling:** [Portal OKR Module (P2)](2026-05-17-portal-okr-p2-design.md)
**Scope:** Desktop portal Projects domain — list, detail, filters, linked-OKR preview, inline status/PDCA, create/edit Project, bulk status/PDCA actions. Mounts at `/portal/projects/*` behind `portal_projects_enabled` flag. Sprint/Task/Milestone management deferred to P3.2+.

---

## 1. Background & Goal

`VT Project` DocType ships in `vernon_tasks/project/` with fields: title, owner, leader, dates, status, PDCA phase, objective link (to `Objective`), team_members table, milestones table, documentation table, analytics thresholds. Today managers manage projects via Frappe Desk — slow for cross-project review and weekly status updates. P1 reserves `/portal/projects` as a `project.read`-gated route currently rendering a stub.

**Goal:** Ship a manager-grade desktop Projects view that supports browse + filter, inline status/PDCA updates, view of the linked OKR Objective with KR progress preview, bulk PDCA/status transitions across selected projects, and full create/edit form for VT Project (excluding child tables).

**Non-goals (P3.1, deferred to P3.2+):**
- Sprint kanban / sprint CRUD
- VT Task list/board/CRUD
- Project Milestone CRUD (read-count only)
- Team Member inline management
- Project Documentation inline editor
- Gantt / timeline visualizations
- CSV/PDF export
- Cross-project capacity heatmap
- Comments / discussion

---

## 2. Users & Personas

| Persona | Primary jobs |
|---------|--------------|
| Project Manager / Leader | Browse own + team projects, update status weekly, advance PDCA, jump to linked OKR |
| PMO / Admin | Cross-portfolio bulk status/PDCA transitions, project creation at cycle start |
| Member | Read-only access if granted `project.read`; cannot edit |

---

## 3. Architecture

### 3.1 Routes

```
/portal/projects                → <ProjectList>     (master-detail)
/portal/projects/new            → <ProjectEditor>   (create)
/portal/projects/:id/edit       → <ProjectEditor>   (edit)
```

Selection in `?proj=<name>` URL param (bookmarkable).

### 3.2 Folder Layout (additive)

```
pwa/src/portal/projects/
├── ProjectRoutes.tsx
├── ProjectsFeatureGate.tsx
├── ProjectList.tsx
├── ProjectTable.tsx
├── ProjectDetail.tsx
├── ProjectEditor.tsx
├── FiltersBar.tsx
├── BulkActions.tsx
├── ObjectiveLink.tsx
├── api/
│   ├── projects.ts
│   └── bulk.ts
├── hooks/
│   ├── useProjects.ts
│   ├── useProject.ts
│   └── useProjectsBulk.ts
└── lib/
    └── projectStatus.ts
```

### 3.3 Backend

- `vernon_tasks/api/projects.py` (whitelisted):
  - `list_projects(filters)` — date-range overlap on start_date/end_date + status/pdca/leader/owner IN; JOINs Objective for linked title; aggregates team/milestone/sprint counts; ORDER BY start_date DESC LIMIT 500.
  - `get_project_with_relations(name)` — project doc + linked_objective_summary (`{name, title, period, status, avg_kr_progress}`) + counts `{team_members, milestones, sprints, documentation}`.
  - `bulk_update_projects(names, payload)` — payload supports `status` and/or `pdca_phase`; permission-filtered per name; for `pdca_phase` uses `vernon_tasks.okr.pdca.next_pdca_phase` when payload signals "advance" intent (explicit phase value also allowed but validated against sequence); transactional; returns `{updated, skipped}` with reasons `no_permission` | `already_closed` | `invalid_status`.
- Reuse `vernon_tasks/okr/pdca.py` (no copy).
- Feature flag `portal_projects_enabled` (Check, default `0`) added to VT Settings.
- No VT Project schema changes; no patches.

### 3.4 Cross-domain Reuse

- `<ObjectiveLink>` consumes `useObjective` from `pwa/src/portal/okr/hooks/useObjective.ts` directly (no duplication).
- `useVtSettings` hook extended to include `portal_projects_enabled`.

---

## 4. UX & Components

### 4.1 `<ProjectList>`
- `PageLayout` title="Projects", actions `+ New Project` → `/portal/projects/new`.
- Top: `<FiltersBar>` + `<BulkActions selected={selected} />`.
- Grid: `<ProjectTable>` (~60%) + `<ProjectDetail name={activeName} />` (~40%, sticky).

### 4.2 `<FiltersBar>`
- start_date + end_date inputs (URL-synced).
- status multi-chip (read options from doctype; expected: Planning / Active / On Hold / Completed / Cancelled).
- pdca_phase multi-chip (PLAN/DO/CHECK/ACT/CLOSED).
- leader free-text input (Frappe User id).
- "Clear filters".

### 4.3 `<ProjectTable>`
- Cols: checkbox, Title, Leader, Owner, Period (`start_date — end_date`), Status, PDCA, Linked OKR (compact title or "—"), Updated.
- Sort by start_date DESC default.
- Bulk-select header + per-row checkbox; row click → set `?proj=<name>` (stopPropagation on checkbox/title).

### 4.4 `<BulkActions>`
- Visible when ≥1 selected.
- "Advance PDCA → (N)" — confirm dialog → `bulk_update_projects({pdca_phase: "__next__"})`.
- "Set Status…" — dropdown menu (5 options) → confirm dialog with target+count → `bulk_update_projects({status: target})`.

### 4.5 `<ProjectDetail>`
- Header: title, leader, owner, period, status badge, PDCA badge, edit icon → `/portal/projects/:id/edit`.
- Inline quick actions (require `project.write`): status select dropdown (autosave on change); PDCA "Advance →" button.
- Body:
  - `<ObjectiveLink objectiveName={proj.objective}>` (if linked).
  - Counts row: team_members · milestones · sprints · documentation.
  - Analytics thresholds (collapsed): blocked_days_threshold, slip_pct_threshold, capacity_pct_threshold.

### 4.6 `<ObjectiveLink>`
- Fetches via `useObjective(name)`.
- Loading inline skeleton; 404 → "(linked OKR not found)"; 403 → "OKR linked (no access)".
- Renders compact card: title, period, status, avg KR progress bar. Click → `/portal/okr?obj=<name>`.

### 4.7 `<ProjectEditor>`
- react-hook-form + zod (deps already installed P2).
- Fields: title, project_owner, project_leader, start_date, end_date, status, pdca_phase (default PLAN), objective (optional Link Objective — free text Phase 1), blocked_days_threshold (default 7), slip_pct_threshold (default 20), capacity_pct_threshold (default 80).
- NO child table editing (team/milestones/docs).
- Submit → POST/PUT → nav `/portal/projects?proj=<id>`.

---

## 5. Data Flow & Cache

### 5.1 react-query keys

```ts
projectKeys = {
  all: ["projects"] as const,
  lists: () => [...all, "list"],
  list: (filters) => [...lists(), filters],
  details: () => [...all, "detail"],
  detail: (name) => [...details(), name],
}
```

### 5.2 Invalidation

- Single edit (Editor / inline action) → invalidate `lists()` + `detail(name)`.
- Bulk → invalidate `lists()` + each `detail(name)` for updated entries.
- No auto cross-domain (OKR) invalidation Phase 1.

### 5.3 Permission Gate

- Read: `project.read`. Write (create/update/bulk): `project.write`.
- Frontend hides edit/bulk/inline-action buttons via `hasPermission('project.write')`.
- Backend re-checks via `frappe.has_permission`.

### 5.4 Telemetry

Extend `pwa/src/telemetry.ts`:

| Event | Payload |
|-------|---------|
| `projects.list_view` | `{ filters_count }` |
| `projects.detail_view` | `{ name }` |
| `projects.create` | `{ name }` |
| `projects.edit` | `{ name }` |
| `projects.bulk_pdca_advance` | `{ count, from_to_pairs }` |
| `projects.bulk_status_set` | `{ count, target_status }` |
| `projects.inline_status_change` | `{ name, from, to }` |
| `projects.objective_link_click` | `{ project, objective }` |
| `projects.permission_denied` | `{ path, action }` |

---

## 6. Error Handling

### 6.1 Form Validation (zod)

- title required ≤140
- owner/leader non-empty
- start_date ≤ end_date
- status enum, pdca_phase enum
- thresholds: blocked_days 0-365 int, percentages 0-100

### 6.2 API Errors

| Status | Behavior |
|--------|----------|
| 401 | Redirect `/login` |
| 403 | Toast + `projects.permission_denied` telemetry |
| 404 (detail) | `<NotFound>` in detail panel only |
| 409/417 | Inline field error from response body |
| 5xx | Toast + retry; inline status/PDCA shows red w/ retry |

### 6.3 Inline Save

Optimistic update; on error rollback + toast "Save failed, reverted". Disable controls during in-flight.

### 6.4 Bulk Edge Cases

- Already-CLOSED PDCA → skipped `already_closed`.
- No permission → skipped `no_permission`.
- Invalid status (out of enum) → 417 inline (shouldn't fire from UI).
- Toast: "N updated, M skipped (X already closed, Y no permission)".

### 6.5 Linked Objective Failures

- 404 → "(linked OKR not found)" inline.
- 403 → "OKR linked (no access)" placeholder, no name leak.
- Loading → skeleton.

### 6.6 Date Filter Independence

Backend handles `start_date` and `end_date` independently:
- Only start → projects ending ≥ start.
- Only end → projects starting ≤ end.
- Neither → no constraint.

### 6.7 Empty / Loading

| Case | UI |
|------|-----|
| List loading | `<PageSkeleton>` |
| List empty (filter) | `<EmptyState>` + "Clear filters" |
| List empty (none) | `<EmptyState>` + "+ Create first Project" |
| Detail idle | "Select a Project to view details" |
| Linked OKR loading | inline skeleton |
| Counts loading | "—" per count |

### 6.8 Concurrency

Reuse Frappe `_modified` token on PUT. 409 → toast "Updated by another user, refreshing" + invalidate detail.

---

## 7. Testing

| Layer | Coverage |
|-------|----------|
| Unit (vitest) | FiltersBar URL-sync; ProjectTable sort+bulk; ProjectEditor zod validation; ObjectiveLink loading/error/success; projectStatus.ts helper |
| Component | ProjectDetail header + counts + linked OKR; BulkActions PDCA confirm + status dropdown; inline status optimistic+rollback |
| Integration (MSW) | list w/ filters → table; bulk_update_projects partial skip → split toast; cross-domain OKR fetch |
| Backend (Frappe) | list_projects date-range + filters; get_project_with_relations counts + linked summary; bulk_update_projects PDCA + status + permission + transaction |
| E2E (playwright) | manager → /portal/projects list → click row → detail; /portal/projects/new form open |
| Coverage gate | `pwa/src/portal/projects/` ≥80% lines, ≥75% functions (OKR precedent), ≥70% branches |

---

## 8. Build & Bundle

- Add `pwa/src/portal/projects/` to vite `manualChunks` → `projects` chunk lazy-loaded.
- Budget: projects chunk ≤120KB gzip Phase 1.

---

## 9. Rollout

### 9.1 Feature Flag

`portal_projects_enabled` (VT Settings, Check, default `0`) — independent of foundation + OKR flags.

### 9.2 Phases

| Phase | Scope |
|-------|-------|
| P3.1.1 | Backend (3 endpoints + tests) + flag field. Ship dark. |
| P3.1.2 | Frontend read-only list + detail + filters + linked OKR. Flip flag staging. |
| P3.1.3 | Inline status/PDCA + bulk actions. |
| P3.1.4 | Create/edit Project form. UAT 1 week → GA. |

---

## 10. Success Metrics

| Metric | Target |
|--------|--------|
| Time-to-first-action (median manager session) | <45s |
| Inline status/PDCA update adoption | ≥40% manager sessions |
| Linked-OKR click-through | baseline established Phase 1 |
| Unhandled errors in telemetry (7d post-GA) | 0 |
| Coverage `projects/` lines | ≥80% |
| Bundle (projects chunk, gz) | ≤120KB |

---

## 11. Open Questions

- Should "Set Status" to "Completed" require PDCA to be CLOSED? (Default: orthogonal, no gating.)
- Linked Objective autocomplete in editor — search by title? (Default Phase 1: free-text id input, autocomplete deferred.)
- "Advance PDCA" button on detail — disabled when CLOSED or hidden? (Default: disabled with tooltip.)

---

## 12. Out of Scope (Future PRDs)

- P3.2 Sprint kanban + sprint CRUD
- P3.3 VT Task management (list/board/dependencies/scoring)
- P3.4 Milestones + Documentation child editors
- P3.5 Team Member capacity management
- Charts / Gantt / timeline
- CSV/PDF export
- Cross-project capacity heatmap
- Comments / discussion threads
- Mobile-portal handoff

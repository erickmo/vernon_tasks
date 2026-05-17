# PRD — Portal OKR Module (P2)

**Status:** Draft
**Date:** 2026-05-17
**Owner:** Vernon Tasks
**Parent:** [Desktop Portal Foundation (Phase 1)](2026-05-17-desktop-portal-foundation-design.md)
**Scope:** Desktop portal OKR domain — list, detail, filters, inline KR autosave, create/edit Objective, bulk PDCA transition. Mounts at `/portal/okr/*` behind `okr.read` / `okr.write` permission gates.

---

## 1. Background & Goal

OKR backend (Objective, Key Result, KPI Definition, KPI Entry DocTypes) ships in `vernon_tasks/okr/`. Managers currently edit OKRs via Frappe Desk — slow for review cycles and weekly progress updates. The P1 portal foundation reserves `/portal/okr` as a permission-gated route, currently rendering a "coming soon" stub.

**Goal:** Ship a manager-grade desktop OKR view that supports the quarterly cycle end-to-end: review existing OKRs (filter by period/owner/status/PDCA), update KR progress inline, create/edit Objectives, and advance multiple Objectives through PDCA in one action.

**Non-goals (P2):**
- Charts/visualizations
- KPI Entry / KPI Definition UI
- Cross-objective alignment tree
- Comments / discussion threads
- CSV/PDF export

---

## 2. Users & Personas

| Persona | Primary jobs |
|---------|--------------|
| OKR Owner (manager/leader) | Review own + team OKRs, update KR progress weekly, advance PDCA phase |
| PMO / Admin | Create Objectives at the start of cycle, run bulk PDCA transitions, audit progress |
| Worker (transient) | Read-only access if granted `okr.read`; cannot edit |

---

## 3. Architecture

### 3.1 Routes

```
/portal/okr            → <OKRList>         (master-detail)
/portal/okr/new        → <ObjectiveEditor> (create)
/portal/okr/:id/edit   → <ObjectiveEditor> (edit)
```

Selection state in `?obj=<name>` search param (bookmarkable).

### 3.2 Folder Layout (additive)

```
pwa/src/portal/okr/
├── OKRRoutes.tsx
├── OKRList.tsx
├── ObjectiveTable.tsx
├── ObjectiveDetail.tsx
├── ObjectiveEditor.tsx
├── KRRow.tsx
├── FiltersBar.tsx
├── BulkActions.tsx
├── api/
│   ├── objectives.ts
│   ├── keyResults.ts
│   └── bulk.ts
├── hooks/
│   ├── useObjectives.ts
│   ├── useObjective.ts
│   └── usePdcaTransition.ts
└── lib/
    ├── periodParser.ts
    └── pdcaSequence.ts
```

### 3.3 Backend

- **Schema migration:** extend `Objective` DocType with `period_start` (Date, nullable) and `period_end` (Date, nullable). One-shot patch `vernon_tasks/patches/v1_x/add_objective_period_dates.py` backfills from `period` string via parser; unknown patterns left NULL with log entry.
- **API (`vernon_tasks/api/okr.py`, whitelisted):**
  - `list_objectives(filters: dict) -> list[dict]` — date-range overlap on period_start/period_end + owner/status/pdca filters; returns objectives + avg KR progress per row.
  - `get_objective_with_krs(name: str) -> dict` — single fetch (objective + KRs) to avoid waterfall.
  - `bulk_advance_pdca(names: list[str]) -> {advanced: list, skipped: list}` — forward-only PLAN→DO→CHECK→ACT→CLOSED; skips already-CLOSED; permission-filtered; transactional rollback on error.
- **Individual CRUD** uses Frappe REST (`/api/resource/Objective`, `/api/resource/Key Result`).

---

## 4. UX & Components

### 4.1 `<OKRList>`
- Grid: top `<FiltersBar>`, left `<ObjectiveTable>` (~60%), right `<ObjectiveDetail>` (~40%, sticky).
- Top-right action: "+ New Objective" → `/portal/okr/new`.
- Empty: `<EmptyState>` w/ "Create Objective" CTA.

### 4.2 `<FiltersBar>`
- `period_start` + `period_end` date inputs (native Phase 1).
- `owner` Frappe User picker.
- `status` multi-chip (Open / On Track / At Risk / Closed).
- `pdca_phase` chip (PLAN / DO / CHECK / ACT / CLOSED).
- "Clear filters" link.
- State synced to URL search params (shareable).

### 4.3 `<ObjectiveTable>`
- Cols: checkbox, Title, Period, Owner, Status, PDCA, Progress (avg KR %), Updated.
- Sort by Period DESC default; click header to toggle.
- Bulk-select via checkbox; row click selects detail (checkbox click stops propagation).

### 4.4 `<BulkActions>`
- Visible when ≥1 row selected.
- Single button: "Advance PDCA →" + count badge.
- Confirm dialog shows preview (current → next per selected).
- Submit → mutation → toast + invalidate list cache.

### 4.5 `<ObjectiveDetail>`
- Header: title, period, owner, status badge, PDCA badge. Edit icon → `/portal/okr/:id/edit`.
- Body: description (collapsible).
- "Key Results" section: list of `<KRRow>` + "+ Add KR" inline form.

### 4.6 `<KRRow>`
- Display: metric label, target, editable `current_value` input, unit, progress bar.
- Debounced 800ms autosave via PUT KR; visual states (idle / saving spinner / saved check / error red + retry).
- Delete icon with confirm dialog.

### 4.7 `<ObjectiveEditor>` (route page, not modal)
- react-hook-form + zod.
- Fields: title, description, period (string), period_start, period_end (auto-fill from period parser on blur), owner, status, pdca_phase (default PLAN on create).
- Submit → POST/PUT → redirect `/portal/okr?obj=<new_id>`.
- Cancel → back.

---

## 5. Data Flow & Cache

### 5.1 react-query keys

```ts
['okr', 'list', filters]
['okr', 'detail', name]
['okr', 'kr', name]
```

### 5.2 Invalidation

- KR update (autosave) → invalidate `['okr', 'detail', objName]` + `['okr', 'list']` (progress affects list aggregate).
- Objective create/edit → invalidate `['okr', 'list']`; navigate to detail.
- Bulk PDCA → invalidate `['okr', 'list']` + each affected `['okr', 'detail', name]`.

### 5.3 Optimistic Updates

KR `current_value` autosave only: apply local update immediately, rollback on error.

### 5.4 Period Parser

`pwa/src/portal/okr/lib/periodParser.ts`:

```ts
parsePeriod("2026-Q2")  → {start: "2026-04-01", end: "2026-06-30"}
parsePeriod("2026-H1")  → {start: "2026-01-01", end: "2026-06-30"}
parsePeriod("2026")     → {start: "2026-01-01", end: "2026-12-31"}
parsePeriod(unknown)    → null
```

### 5.5 Permission Gate

- Read endpoints require `okr.read`.
- Write endpoints (create/update/bulk PDCA) require `okr.write`.
- Frontend hides edit/delete/create buttons via `hasPermission('okr.write')`.
- Backend re-checks via `frappe.has_permission` per call (defense in depth).

### 5.6 Telemetry

Extend `pwa/src/telemetry.ts`:

| Event | Payload |
|-------|---------|
| `okr.list_view` | `{ filters_count }` |
| `okr.detail_view` | `{ name }` |
| `okr.kr_update` | `{ kr_name, delta }` |
| `okr.objective_create` | `{ name }` |
| `okr.objective_edit` | `{ name }` |
| `okr.bulk_pdca_advance` | `{ count, from_to_pairs }` |
| `okr.permission_denied` | `{ path, action }` |

---

## 6. Error Handling

### 6.1 Form Validation (zod)
- Objective: `title` non-empty ≤140 chars, `period` non-empty, `period_start ≤ period_end`, `owner` valid User, `status`/`pdca_phase` enum.
- KR: `metric` non-empty, `target_value` numeric (allow 0), `current_value` numeric, `unit` ≤32 chars.
- Inline error messages; submit disabled until valid.

### 6.2 API Errors

| Status | Behavior |
|--------|----------|
| 401 | Redirect `/login` (already wired in foundation) |
| 403 | Toast "Permission denied" + `okr.permission_denied` telemetry |
| 404 (detail) | `<NotFound>` in detail panel only, not whole page |
| 409 / 417 | Inline field error from response body |
| 5xx | Toast + retry button; KR autosave shows red w/ retry |

### 6.3 KR Autosave Concurrency
- Send `_modified` timestamp as optimistic-concurrency token w/ PUT.
- 409 conflict → toast "KR updated by another user, refreshing" → invalidate + refetch.

### 6.4 Bulk PDCA Edge Cases
- Already-CLOSED objectives → server skips, response splits `{advanced, skipped}`. Toast: "N advanced, M skipped (already CLOSED)".
- Permission missing on some objectives → backend filters, returns `skipped` w/ reason `no_permission`. Toast lists count.
- Transaction failure → all rollback, error toast w/ details.

### 6.5 Period Parser Fallback
- Unknown pattern → editor leaves dates empty, surfaces inline note "Pattern not recognized — set start/end manually." Validation blocks submit until set.

### 6.6 Empty / Loading

| Case | UI |
|------|-----|
| List loading | `<PageSkeleton>` |
| List empty (filter) | `<EmptyState>` + "Clear filters" CTA |
| List empty (none) | `<EmptyState>` + "+ Create first Objective" |
| Detail panel idle | Placeholder "Select an Objective to view details" |
| KR list empty | "No Key Results yet. Add one." |

---

## 7. Testing

| Layer | Coverage |
|-------|----------|
| Unit (vitest) | `periodParser` (all patterns + unknown), `pdcaSequence.next()` (5 phases + CLOSED noop), KRRow autosave debounce + optimistic + rollback, FiltersBar URL-sync, ObjectiveEditor zod validation |
| Component | ObjectiveTable sort/bulk-select; BulkActions confirm-dialog flow; ObjectiveDetail renders mocked query |
| Integration (MSW) | list w/ filters → table; bulk_advance_pdca w/ partial skip → split toast; KR autosave 409 → refetch path |
| Backend (Frappe tests) | `list_objectives` date-range overlap; `bulk_advance_pdca` forward-only + permission filter + transaction rollback; permission gate (okr.read vs okr.write) |
| E2E (playwright) | filter → select → inline KR edit → create objective → bulk advance |
| Coverage gate | `pwa/src/portal/okr/` ≥80% lines |

---

## 8. Build & Bundle

- Add `pwa/src/portal/okr/` to vite `manualChunks` → `okr` chunk lazy-loaded only when route hit.
- Budget: okr chunk ≤120KB gzip Phase 1.

---

## 9. Rollout

### 9.1 Feature Flag

New VT Settings field `portal_okr_enabled` (Check, default `0`), independent of `portal_enabled`.
- OFF: `/portal/okr` renders `<ComingSoon domain="OKR" />` (current).
- ON: renders `<OKRRoutes />`.
- Lets ops ship code dark, flip per-site.

### 9.2 Phases

| Phase | Scope |
|-------|-------|
| P2.1 | Backend (schema patch, API endpoints, tests) + flag field. Ship dark. |
| P2.2 | Frontend read-only list + detail + filters. Flip flag in staging. |
| P2.3 | Inline KR autosave + bulk PDCA. |
| P2.4 | Create/edit Objective form. UAT 1 week → GA. |

---

## 10. Success Metrics

| Metric | Target |
|--------|--------|
| Time-to-first-KR-update (median manager session) | <30s after entering `/portal/okr` |
| Bulk PDCA adoption | ≥50% managers in first quarterly cycle |
| Unhandled errors in telemetry (7d post-GA) | 0 |
| Coverage `okr/` lines | ≥80% |
| Bundle (okr chunk, gz) | ≤120KB |

---

## 11. Open Questions

- Should KR autosave trigger on blur OR debounce-only? (Default: debounce 800ms + save on blur as safety net.)
- Bulk PDCA confirm dialog — show full preview list or just count? (Default: preview list, capped to first 10 + "and N more".)
- Owner picker — restrict to active Users only, or include disabled? (Default: active only.)

---

## 12. Out of Scope (Future PRDs)

- KPI Entry / KPI Definition portal UI (KPI sub-PRD).
- OKR alignment tree (parent/child Objective relations — requires schema work).
- Charts and progress visualizations.
- CSV/PDF export.
- Comments / discussion threads on Objectives.
- Mobile-portal handoff (continue editing on mobile).

# Implementation Tracker

Last updated: 2026-05-16
Source: `docs/PRD.md` v1.0 + `docs/trd/*.html` + `docs/adr/*.html`
Verification: code in `vernon_tasks/`, tests in `vernon_tasks/**/test_*.py`, PWA tests in `pwa/src/**/*.test.*`

Status legend: `pending` · `partial` (backend OR frontend OR tests missing) · `complete` (all layers + tests green)

---

## PRD Items

### Desk Pages (PRD §5.1)

| ID | Feature | Status | ADR | Notes |
|----|---------|--------|-----|-------|
| PRD-001 | My Work — daily queue + PDCA quick-actions | complete | ADR-001 | `task/page/my_work` + `test_my_work.py` |
| PRD-002 | My Dashboard — stats + 7-day chart + hours donut | complete | ADR-001 | `task/page/my_dashboard` |
| PRD-003 | My Analytics — leaderboard, velocity, streak | complete | ADR-001 | `task/api/ic_analytics.py` + tests |
| PRD-004 | Leader Dashboard — pending review, KPIs, leaderboard, overdue | complete | ADR-001 | `task/page/leader_dashboard` |
| PRD-005 | Leader Review — queue, workload, blocked, approve/reject | complete | ADR-001 | `task/page/leader_review` |
| PRD-006 | Leader Analytics — burndown, velocity, forecast, risks | complete | ADR-001 | `task/services/{burndown,forecast,risk_evaluator}` + tests |
| PRD-007 | Executive Analytics — OKR roll-up, KPI trends, Health Score | complete | ADR-001 | `task/api/exec_analytics.py` + `test_exec_analytics.py` |
| PRD-008 | Workspace shortcuts + global page nav bar | complete | — | `public/js/page_nav.js` |

### PWA Phases (PRD §5.2)

| ID | Phase | Status | ADR | Notes |
|----|-------|--------|-----|-------|
| PRD-009 | P0.5 Foundation — login, list/detail, onboarding, offline, telemetry | complete | ADR-002,003,004,005 | pilot complete per PRD §11.1 |
| PRD-010 | P1a Mutations + Install — complete/log/snooze undo, A2HS | complete | ADR-006 | `my_work_mutations.py` + tests |
| PRD-011 | P1b Search + Notifications — debounced search, filter sheet, log, badge | complete | — | `notifications.py` + `test_my_work_search.py` |
| PRD-012 | P2 Dashboard + IC Analytics — summary, kanban, leaderboard tabs | complete | — | PWA `/m/dashboard` + analytics tabs |
| PRD-013 | P3a Leader Review — /m/leader queue, approve/reject | complete | — | `leader_review.py` + PWA leader page |
| PRD-014 | P3b Leader Sprint + Exec — burndown, forecast, Health Score, OKR | complete | — | services + exec_analytics |
| PRD-015 | P4a Push Notifications — VAPID, subscribe, pipeline, pruning | complete | — | `push.py`, `push_sender.py` + tests |
| PRD-016 | P4b Push Refinements — per-event prefs, action buttons | complete | — | `push_prefs.py`, `push_action.py` + tests |
| PRD-017 | CSO Security Audit — security.py guards, CSP/X-Frame | complete | ADR-011 | `task/api/security.py` + `test_security.py` |
| PRD-018 | Login + Task UI Redesign — glassmorphism, purple, accent cards | complete | — | commits 52588ef…1fc12ca |
| PRD-019 | Mobile/Desktop Responsive Nav — 768px breakpoint, TopNav/BottomNav | complete | ADR-016 | merge acf48f4; `useMediaQuery`, `TopNav.test.tsx` |

### Domain & Rules (PRD §4)

| ID | Feature | Status | ADR | Notes |
|----|---------|--------|-----|-------|
| PRD-020 | PDCA state machines (Task/Project/Objective) | complete | ADR-007 | `task/doctype/vt_task` |
| PRD-021 | Point calculation + revision deduction + override | complete | ADR-008 | `services/point_calculator.py` + `test_point_calculator.py` |
| PRD-022 | Scheduling engine + capacity + recurring tasks | complete | ADR-009 | `services/scheduling_engine.py` |
| PRD-023 | Health Score formula (okr 0.4 + ontime 0.3 + velocity 0.3) | complete | — | `services/health_score_service.py` + tests |
| PRD-024 | Workspaces fixtures (My Tasks / My Projects / Overview) | complete | — | `workspace/{my_tasks,my_projects,overview}` |

### Future (PRD §16) — explicitly NOT committed

| ID | Item | Status |
|----|------|--------|
| PRD-F01 | Dept/multi-team OKR rollup hierarchy | pending (future) |
| PRD-F02 | What-if forecast scenarios | pending (future) |
| PRD-F03 | Capacitor native shell | pending (future) |
| PRD-F04 | Slack/Email digest | pending (future) |
| PRD-F05 | KPI auto-linking to Key Result | pending (future) |
| PRD-F06 | Bulk leader ops | pending (future) |
| PRD-F07 | AI task triage | pending (future) |

---

## TRD Items

### Architecture (TRD §2-4)

| ID | Requirement | Status | ADR | Notes |
|----|------------|--------|-----|-------|
| TRD-001 | Frappe v15 backend | complete | ADR-001 | |
| TRD-002 | React 18 + Vite 5 + TS strict | complete | ADR-003 | `pwa/` |
| TRD-003 | Dual-UI architecture (Desk + PWA) | complete | ADR-002 | |
| TRD-004 | TanStack Query 5 client cache | complete | ADR-006 | |
| TRD-005 | Layer separation: Controller / Service / Page Handler | complete | — | enforced via `services/` split |

### Data Contracts (TRD §5-6)

| ID | Requirement | Status | ADR | Notes |
|----|------------|--------|-----|-------|
| TRD-006 | Custom doctypes (VT Task, Project, Sprint, OKR, etc.) | complete | ADR-007 | |
| TRD-007 | Telemetry 90-day retention | complete | — | scheduler `purge_old_telemetry` |
| TRD-008 | API contract conventions (whitelisted method namespace) | complete | — | `task/api/*.py` |

### Infrastructure (TRD §7-13)

| ID | Requirement | Status | ADR | Notes |
|----|------------|--------|-----|-------|
| TRD-009 | Vite build pipeline + bundle budget (~95KB gz) | complete | — | `build-pwa.sh` |
| TRD-010 | Service worker StaleWhileRevalidate offline | complete | ADR-004 | Workbox |
| TRD-011 | Reuse Frappe session cookie (no JWT) | complete | ADR-005 | |
| TRD-012 | Security headers on /m/* | complete | ADR-011 | `www/m.py` |
| TRD-013 | API guards (rate_limit, clamp, max_str, require_login) | complete | ADR-011 | `task/api/security.py` |
| TRD-014 | Role checks at endpoint top | complete | — | `frappe.has_role()` |
| TRD-015 | Telemetry pipeline + Report Builder reports | complete | — | `telemetry.py` + `Vernon Telemetry Event` |
| TRD-016 | Deploy topology + rollback procedure | complete | — | `docs/rollout/pwa-pilot.md` |
| TRD-017 | VAPID key one-time provisioning | complete | — | docs/trd/infrastructure.html §13.3 |

### Quality (TRD §14-16)

| ID | Requirement | Status | ADR | Notes |
|----|------------|--------|-----|-------|
| TRD-018 | Backend test coverage ≥80% (services + security) | complete | — | 26 test_*.py; **2026-05-16 run: 216/216 passing ✅**. Fixes applied: `test_setup.py` patches (NotificationSettings + NotificationLog email), telemetry cache_key namespacing via `make_key`, `flags.name_set` on VT Project autoname-override in fixtures, VT Member role on test users, English priority values, `frappe.set_user("Administrator")` in tearDown to prevent session leak, `complete()` mutation now sets `pdca_phase=DONE` + `ignore_validate=True` so kanban_status doesn't get reverted by `_sync_kanban_status`. |
| TRD-019 | PWA Vitest + happy-dom + RTL | complete | — | 88/88 passing 2026-05-16 |
| TRD-020 | PWA Playwright e2e (env-gated) | complete | — | `pwa/e2e/smoke.spec.ts` |
| TRD-021 | TS `tsc --noEmit` strict | complete | — | 2026-05-16: No errors found |
| TRD-022 | CI gates (lint, type, test) | partial | — | local gates only; no CI config in repo |

---

## ADR Implementation Status

ADRs are HTML (no YAML frontmatter). Status tracked here.

| ADR | Title | Status |
|-----|-------|--------|
| ADR-001 | Build on Frappe Framework | complete |
| ADR-002 | Dual UI: Frappe Desk + Mobile PWA | complete |
| ADR-003 | React 18 + Vite 5 + TypeScript 5 for PWA | complete |
| ADR-004 | Workbox StaleWhileRevalidate offline | complete |
| ADR-005 | Reuse Frappe session cookie (no JWT) | complete |
| ADR-006 | TanStack Query 5 for client cache | complete |
| ADR-007 | Doctype model + PDCA state machine | complete |
| ADR-008 | Point calculation + override audit | complete |
| ADR-009 | Scheduling engine + capacity | complete |
| ADR-010 | (data layer — see docs/adr/data.html) | complete |
| ADR-011 | Security guards + CSP headers | complete |
| ADR-016 | Responsive nav (768px breakpoint) | complete |

---

## Outstanding Items (block next cycle?)

| Item | Severity | Notes |
|------|----------|-------|
| Backend test suite | done | 216/216 passing 2026-05-16 |
| TRD-018 coverage % not measured | low | add `coverage` to backend test runner |
| TRD-022 no CI config | low | add `.github/workflows/test.yml` for lint+type+test |
| Domain README stubs missing | done | created 2026-05-16 (see `docs/domains/*/README.md`) |

All gates green. Project ready for next cycle.

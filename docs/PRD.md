# Vernon Tasks — Product Requirements Document (PRD)

> Master PRD synthesized from `docs/DEVELOPER_GUIDE.md`, `docs/API_REFERENCE.md`, `docs/rollout/pwa-pilot.md`, and all design specs + implementation plans under `docs/superpowers/`.
>
> **Version:** 1.0
> **Date:** 2026-05-16
> **Owner:** Vernon Corp — Internal Tooling
> **Status:** Living document; updated per phase ship

---

## 1. Executive Summary

**Vernon Tasks** is a company-wide task, project, and performance management platform built on **Frappe v15**. It unifies three management methodologies under a single doctype graph:

1. **PDCA Cycle** — Plan-Do-Check-Act lifecycle on every Task, Project, and Objective.
2. **OKR / KPI** — Strategic objectives with measurable Key Results and KPI definitions, rolled up to a company Health Score.
3. **Agile Sprints** — Time-boxed iterations with velocity, burndown, and forecast analytics.

A **gamified point system** rewards on-time delivery and penalizes late completion / revision cycles. Points feed monthly leaderboards, personal streaks, and team velocity metrics.

The platform ships **two coordinated UIs**:

- **Frappe Desk** (desktop, Python/Jinja) — 7 custom pages for power users, leaders, and execs.
- **Vernon PWA** (mobile-first React) — Installable progressive web app at `/m/` route, offline-capable, push-enabled.

### 1.1 Vision

> Make execution status, blockers, and outcomes visible to every member of the organization in real time, on any device — and reward consistent delivery with auditable, math-driven points.

### 1.2 Non-Goals

- External-facing customer portal.
- Replacement for Frappe HR, ERPNext Projects, or general-purpose CRM.
- Time-tracking as a billing engine (hours are for capacity/effort, not invoicing).

---

## 2. Target Users & Roles

| Role | Profile | Primary Surface | Key Permissions |
|---|---|---|---|
| **VT Member** | Individual contributor | `/m/work`, Desk `my_work`, `my_dashboard`, `my_analytics` | CRUD own tasks, transition `BACKLOG→PLAN→DO→CHECK`, log hours, view leaderboard |
| **VT Leader** | Project lead / team manager | `/m/leader`, Desk `leader_review`, `leader_dashboard`, `leader_analytics` | All Member perms + approve/reject reviews, override points & schedules within own projects, view team analytics (burndown, velocity, risks) |
| **VT Manager** | Department head / executive | Desk `exec_analytics`, all leader screens | All Leader perms + executive analytics (OKR roll-up, KPI trends, Health Score), edit `VT Settings`, system-wide overrides |
| **System Manager** | Frappe admin | Frappe Desk | Same as VT Manager + role assignment, fixtures, migrations |
| **Guest** | Unauthenticated | `/m/login` only | None |

Roles are **fixtures** auto-created on `bench migrate`: `VT Manager`, `VT Leader`, `VT Member`.

---

## 3. Tech Stack

### 3.1 Backend
- **Framework:** Frappe v15+ (Python 3.11+)
- **Database:** MariaDB 10.6+ / MySQL 8+
- **Cache / Rate Limit:** Frappe Redis (`frappe.cache()`)
- **Deployment:** Standard `frappe-bench` topology

### 3.2 Frontend — Desktop (Frappe Desk)
- Jinja templates + Frappe asset pipeline
- 7 Frappe Pages with whitelisted Python API handlers
- Frappe Charts (built-in) for desk dashboards
- Shared nav bar injected globally via `public/js/page_nav.js`

### 3.3 Frontend — Mobile (PWA at `/m/`)
- **React 18** + **TypeScript 5** + **Vite 5**
- **Routing:** `react-router-dom@6`
- **Data:** `@tanstack/react-query@5` (stale-while-revalidate)
- **Offline cache:** `idb-keyval` (IndexedDB) + Workbox 7 service worker
- **Charts:** `recharts` (lazy-loaded, shared across IC + Leader analytics)
- **PWA:** `vite-plugin-pwa` (workbox generateSW)
- **Testing:** Vitest + happy-dom + @testing-library/react; Playwright for e2e
- **Localization:** id-ID formal ("Anda"), DD MMM YYYY dates, HH:mm times
- **Theme:** CSS variables, light/dark, warm purple palette
  (`--vt-primary: #9561ab`, `--vt-primary-dark: #2d1540`, `--vt-bg-light: #f5f0f8`)

### 3.4 Build / Serve Pipeline
- `pwa/` Vite build → `vernon_tasks/www/m/` static output (git-ignored)
- Frappe `website_route_rules` maps `/m/*` to SPA controller `www/m.py`
- Service worker cache-key includes git short SHA → invalidates on deploy

---

## 4. Domain Model

### 4.1 Modules

```
vernon_tasks/
├── task/        Core task lifecycle (Tasks, Schedule, Points, Recurring)
├── project/     Projects, Sprints, Milestones, Team
├── okr/         Objectives, Key Results, KPI definitions & entries
├── workforce/   Work profiles, capacities, user point summaries
├── vt_settings/ App-wide configuration (single doctype)
└── workspace/   Frappe workspace fixtures (My Tasks / My Projects / Overview)
```

### 4.2 Doctypes

**Task module**
- `VT Task` — main entity (PDCA phase, Kanban status, weight, deadline, assignments, points)
- `Task Dependency` — child table for blocking links
- `Task Schedule Entry` — child table for per-day hour distribution
- `Task Point Log` — immutable audit log (earned / bonus / penalty / revision / override)
- `Recurring Rule` — auto-generate task instances (daily/weekly/monthly)

**Project module**
- `VT Project`, `VT Sprint`, `Sprint Task`, `Project Team Member`, `Project Milestone`, `Project Documentation`

**OKR module**
- `Objective`, `Key Result`, `KPI Definition`, `KPI Entry`

**Workforce module**
- `Work Profile`, `Work Schedule Day`, `User Point Summary`, `Daily Summary`

**Settings & telemetry**
- `VT Settings` (single) — all multipliers, rates, capacity thresholds, VAPID keys
- `Vernon Telemetry Event` — client-emitted, allowlisted, 90-day retention
- `Vernon Push Subscription` (P4a) — web-push endpoint registry
- `Vernon Push Preference` (P4b) — per-user event-type toggles

### 4.3 PDCA State Machines

**VT Task**
```
BACKLOG → PLAN → DO → CHECK → DONE
                 ↑     │
                 └─ ACT┘     (CHECK can return to ACT on rejection)
```

| Kanban Status | PDCA Phase |
|---|---|
| Backlog | BACKLOG |
| Scheduled | PLAN |
| In Progress | DO |
| In Review | CHECK |
| Revision | ACT |
| Done | DONE |

**VT Project**: `PLAN → DO → CHECK → (ACT | CLOSED)`; `ACT → PLAN | DO`.

### 4.4 Point Calculation

```
base               = weight × weight_multiplier
early_bonus        = base × early_bonus_rate × max(0, days_early)
late_penalty       = base × late_penalty_rate × max(0, days_late)
revision_deduction = base × revision_deduct_rate × revision_count
earned             = base + early_bonus − late_penalty − revision_deduction
```

Defaults (in `VT Settings`):
- `weight_multiplier = 10`
- `early_bonus_rate = 0.05` (5%/day early)
- `late_penalty_rate = 0.08` (8%/day late)
- `revision_deduct_rate = 0.10` (10%/revision)

Every transaction writes a row to `Task Point Log` (types: `earned`, `early_bonus`, `late_penalty`, `revision_deduction`, `leader_override`). Monthly aggregates persist to `User Point Summary`.

### 4.5 Scheduling & Capacity
- Distribute `estimated_hours` evenly across assignee's working days (from `Work Profile`).
- Manual daily overrides auto-rebalance remainder.
- Capacity conflict = scheduled hours > daily target; surfaced to leaders.
- Recurring tasks generated daily by scheduler from `Recurring Rule`.

---

## 5. Feature Inventory

### 5.1 Shipped — Desk (Web)

| # | Feature | Page / Workspace | Roles |
|---|---|---|---|
| 1 | My Work — daily task queue + PDCA quick-actions | `my_work` | Member+ |
| 2 | My Dashboard — personal stats + 7-day chart + hours donut | `my_dashboard` | Member+ |
| 3 | My Analytics — leaderboard, personal velocity, streak | `my_analytics` | Member+ |
| 4 | Leader Dashboard — pending review, approval rate, team points, phase pie, leaderboard, overdue table | `leader_dashboard` | Leader+ |
| 5 | Leader Review — review queue, team workload, blocked tasks, approve/reject with reason | `leader_review` | Leader+ |
| 6 | Leader Analytics — burndown, velocity trend, forecast, risk list (slip/blocked/overcap) | `leader_analytics` | Leader+ |
| 7 | Executive Analytics — OKR roll-up, KPI trends, Health Score | `exec_analytics` | Manager |
| 8 | Workspace shortcuts + global in-page nav bar | `page_nav.js` | All |

### 5.2 Shipped — PWA Phases

| Phase | Scope | Status |
|---|---|---|
| **P0.5 Foundation** | Login, My Work list + detail (read-only), onboarding, offline cache, telemetry | ✅ Pilot complete |
| **P1a Mutations + Install** | Complete / Log progress / Snooze with 5s undo; A2HS install prompt (Android prompt + iOS modal) | ✅ Shipped |
| **P1b Search + Notifications** | Debounced search, filter sheet (priority/project/due-range), Notification Log screen, unread badge | ✅ Shipped |
| **P2 Dashboard + IC Analytics** | Summary cards, sprint kanban, leaderboard / velocity / streak tabs | ✅ Shipped |
| **P3a Leader Review** | `/m/leader` review queue, approve / reject with reason | ✅ Shipped |
| **P3b Leader Sprint + Exec** | Tabbed leader page: Review / Sprint (burndown, velocity, forecast, risks) / Exec (Health Score, OKR table, KPI trends) | ✅ Shipped |
| **P4a Push Notifications** | VAPID keys, Web Push subscribe, Notification Log → push pipeline, dead-endpoint pruning | ✅ Shipped |
| **P4b Push Refinements** | Per-event preferences (assignment / mention / due / review), notification action buttons (Complete / View) | ✅ Shipped |
| **CSO Security Audit** | `security.py` guards (require_login, rate_limit, clamp_int, max_str); CSP / X-Frame headers on `/m/*` | ✅ Shipped |
| **Login + Task UI Redesign** | Glassmorphism login, purple gradient header, accent-bordered task cards | ✅ Shipped |

### 5.3 Active Branch — Mobile/Desktop Responsive Nav

Branch: `feat/desktop-responsive-nav` · Spec: `docs/superpowers/specs/2026-05-14-mobile-desktop-responsive-nav-design.md`

- One codebase, two layouts. Breakpoint = **768 px** via `useMediaQuery`.
- **<768 px** — existing BottomNav (5 tabs: Dashboard / Leader* / Work / Analytics / Me).
- **≥768 px** — `TopNav` two-tier: **Nav1** (primary) + **Nav2** (submenu) for Analytics, Leader, Me.
- Tab state via `useSearchParams` for deep-linking + refresh persistence.
- Responsive page layouts:
  - Dashboard: 2-column grid.
  - Work: master-detail (list + inline detail panel ≥900 px).
- AC: BottomNav hidden ≥768 px, TopNav hidden <768 px, no layout shift on resize, persistence across refresh.

---

## 6. APIs (Public Surface)

All endpoints are Frappe whitelisted Python methods at:
`POST /api/method/vernon_tasks.<module>.<file>.<fn>`

Auth: session cookie (browser) or `Authorization: token <key>:<secret>` (programmatic). CSRF token required on mutations.

### 6.1 IC / Member
- `task.page.my_work.my_work` — `get_my_day`, `get_what_to_do_today`, `get_my_blocked_tasks`, `start_task`, `submit_for_review`
- `task.page.my_dashboard.my_dashboard` — `get_employee_stats`, `get_daily_completions`, `get_hours_summary`, `get_sprint_kanban`
- `task.api.ic_analytics` — `get_leaderboard(period, limit)`, `get_personal_velocity(project, n)`, `get_streak(project)`

### 6.2 Leader
- `task.page.leader_dashboard.leader_dashboard` — `get_leader_stats`, `get_phase_distribution`, `get_team_leaderboard`, `get_overdue_tasks`
- `task.page.leader_review.leader_review` — `get_review_queue`, `get_team_workload`, `get_team_blocked_tasks`, `approve_task`, `reject_task`
- `task.api.analytics` — `get_burndown(sprint)`, `get_velocity_trend(project, n=6)`, `get_forecast(project)`, `get_risks(project)`
- `task.api.leader_review` — `get_my_led_projects`, `get_latest_sprint(project)`

### 6.3 Executive (Manager only)
- `task.api.exec_analytics` — `get_okr_rollup(period)`, `list_kpis`, `get_kpi_trend(kpi, periods=12)`, `get_health_score`

### 6.4 PWA — Mobile
- `task.api.boot.boot` — SPA bootstrap `{user, roles, csrf_token}`
- `task.api.my_work` — `list`, `detail(task_id)`, `search(query, priority, project, due_range)`
- `task.api.my_work_mutations` — `complete(task_id)`, `log_progress(task_id, hours, note)`, `snooze(task_id, days∈{1,3,7})`
- `task.api.notifications` — `list(limit, offset, only_unread)`, `mark_read(name)`, `mark_all_read`, `count_unread` (30s cache)
- `task.api.push` — `get_public_key`, `subscribe`, `unsubscribe`, `is_subscribed`
- `task.api.push_prefs` — `get_prefs`, `update_prefs(...)`
- `task.api.push_action` — `complete_from_notification(task_id)`
- `task.api.telemetry` — `log_event(event, props)` (allowlisted, 60/min/user)

### 6.5 Service-layer (callable from APIs)
- `task.services.point_calculator` — `calculate_points`, `apply_revision_deduction`, `override_points`
- `task.services.scheduling_engine` — `distribute_task_schedule`, `override_schedule_entry`, `generate_recurring_tasks`, `check_deadline_notifications`

### 6.6 Standard Frappe REST
All Vernon doctypes expose `/api/resource/<DocType>` CRUD with native permission enforcement.

### 6.7 Health Score Formula
```
score = okr_pct × 0.40
      + ontime_pct × 0.30          (DONE in last 90d, completion ≤ deadline)
      + velocity_health × 0.30     (50 + clamp(avg trend_pct, -50, 50))
```

---

## 7. Hooks & Scheduled Jobs (`hooks.py`)

**Doc events**
| Doctype | Event | Handler |
|---|---|---|
| VT Task | `on_submit` | `point_calculator.calculate_points` |
| VT Task | `on_update` | `scheduling_engine.on_task_update`, `analytics.invalidate_project_cache` |
| VT Project | `validate` | `vt_project.validate_team` |
| VT Sprint | `on_update` | `analytics.invalidate_project_cache` |
| Notification Log | `after_insert` | `push_sender.send_push_for_notification` |

**Scheduler**
- **Daily:** `generate_recurring_tasks`, `check_overdue_tasks`, `generate_daily_summaries`, `purge_old_telemetry` (90-day)
- **Hourly:** `check_deadline_notifications` (email reminders)

**App includes**
- `assets/vernon_tasks/js/page_nav.js` — global Desk nav-bar injector

---

## 8. Security Posture

### 8.1 PWA Response Headers (`www/m.py`)
```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: push=(self), notifications=(self)
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline';
                        style-src 'self' 'unsafe-inline'; connect-src 'self';
                        worker-src 'self';
```

### 8.2 API Guards (`task/api/security.py`)
- `require_login()` → 403 (PermissionError)
- `rate_limit(endpoint, max_calls, window_sec=60)` → 417 (Redis sliding counter)
- `clamp_int(val, lo, hi, name)` → 417 if out of bounds
- `max_str(val, limit)` → silent truncate (no throw)

Applied:
| Endpoint | Limit / Bound |
|---|---|
| `complete` | 30 / min |
| `log_progress` | 20 / min + `note` ≤ 1000 chars |
| `snooze` | 10 / min |
| `push.subscribe` | 5 / min + `endpoint` ≤ 2048 chars |
| `push_prefs.update_prefs` | 20 / min |
| `notifications.list(limit, offset)` | `limit ∈ [1,100]`, `offset ∈ [0,10000]` |
| `analytics.get_velocity_trend(n)` | `n ∈ [1,24]` |
| `exec_analytics.get_kpi_trend(periods)` | `periods ∈ [1,24]` |
| `my_work.search(query)` | `query` ≤ 200 chars |

### 8.3 Service-Worker Cache
- App shell precached (5 entries).
- Runtime: `StaleWhileRevalidate` on `/api/method/vernon_tasks.*`, 1-day expiry.
- Cache name keyed by git SHA → busted on deploy.

### 8.4 Out of Scope (this phase)
- WAF / nginx-level rules
- DocType permission matrix overhaul
- API-key management UI

---

## 9. Non-Functional Requirements

### 9.1 PWA Performance Budget
| Metric | Target |
|---|---|
| LCP (cold) | < 2.5 s |
| LCP (warm cache) | < 1.0 s |
| INP / FID | < 100 ms |
| CLS | < 0.1 |
| Main bundle (gzip) | ~95 KB (currently 304 KB raw) |
| Analytics chunk | lazy via React.lazy (~23 KB gz) |
| Recharts chunk | lazy + shared IC/Leader (~357 KB raw, lazy only) |
| Service worker install success | > 99 % |
| Offline read mode | 100 % cached lists |

### 9.2 Coding Standards
- Layer separation strict: **Controller** (validation, db_set) · **Service** (logic, math) · **Page Handler** (auth + IO).
- Functions ≤ 40 lines; no God classes > 300 lines / 5 responsibilities.
- Named constants only — no magic strings/numbers.
- `ignore_permissions=True` only inside internal services / scheduled jobs; never in whitelisted endpoints.
- All whitelisted endpoints call `frappe.has_role()` / `frappe.only_for()` at top.
- Email sends wrapped in `try/except` (silent skip if mail server unconfigured).
- DI for services — settings/config passed as params, never instantiated inline.

### 9.3 Testing
- Backend: `bench run-tests --app vernon_tasks`. Coverage targets: services ≥ 80 %, security guards ≥ 80 %.
- PWA unit/component: Vitest + happy-dom + @testing-library/react.
- PWA e2e: Playwright, env-gated (`PWA_BASE_URL`, `PWA_TEST_USER`, `PWA_TEST_PASS`).
- TypeScript: `tsc --noEmit` strict mode.

---

## 10. Telemetry & Observability

Storage: `Vernon Telemetry Event` doctype, 90-day retention via daily scheduler.

**Allowlisted events** (rate-limit 60 / min / user):
- Boot / auth: `pwa_boot`, `login_success`, `login_failure`, `page_view`, `error_boundary`
- Read: `task_view`, `dashboard_view`, `analytics_view`
- Mutate: `task_complete`, `task_log`, `task_snooze`
- Search / notif: `search_query`, `filter_applied`, `notif_view`, `notif_tap`, `notif_mark_all_read`
- Install: `install_prompt_shown`, `install_accepted`, `install_dismissed`, `install_snoozed`
- Leader: `leader_review_view`, `leader_approve`, `leader_reject`, `leader_sprint_view`, `leader_exec_view`, `leader_project_change`
- Push: `push_subscribe_attempt`, `push_subscribed`, `push_unsubscribed`, `push_received`, `push_pref_view`, `push_pref_changed`, `push_action_complete`
- Offline: `offline_seen`
- Analytics filters: `analytics_period_change`, `analytics_project_change`

Funnel analysis lives in Frappe Report Builder.

---

## 11. Rollout Strategy

### 11.1 PWA Pilot (P0.5)
1. **Pre-launch checklist:** build green, iOS A2HS works, Android install works, airplane-mode shows cached + offline banner, session relogin modal opens, `pwa_boot` events recorded.
2. **Pilot scope:** 1 team (5–10 users), invite-only.
3. **Daily monitoring:** `error_boundary` < 1 % of `page_view`; `login_failure` < 5 % of post-success.
4. **Go/No-Go gates:**
   - error boundary rate < 1 %
   - login failure rate < 5 %
   - install rate ≥ 30 %
   - no open P0 bugs
5. **Company-wide rollout:** Desk banner linking to `/m/`, email announcement, gradual migration.

### 11.2 Feature Phasing
Phases P0.5 → P4b are **sequential and additive**. Each phase ships behind one or more feature flags resolvable via `/m/_boot` payload. Responsive-nav (current branch) requires all of P0.5–P3b.

---

## 12. KPIs / Success Metrics

| Layer | Metric | Target |
|---|---|---|
| Adoption | PWA install rate in 14d | ≥ 30 % |
| Adoption | Tasks completed via PWA vs Desk | ≥ 50 % |
| Engagement | Daily Active Users in PWA | rising MoM |
| Quality | Error boundary / page view | < 1 % |
| Quality | Login failure post-success | < 5 % |
| Performance | LCP p75 cold load | < 2.5 s |
| Reliability | SW install success | > 99 % |
| Business | Leader review SLA (CHECK → DONE/ACT) | trending down |
| Business | Overdue task ratio | trending down |
| Business | Company Health Score | rising / stable ≥ 70 |
| Engagement | Streak ≥ 3 sprints | ≥ 40 % of active ICs |

---

## 13. Workspaces (Fixtures)

- **My Tasks** (Member) — Active Sprints, My Projects, Blocked Escalation, Team Workload, Sprint Velocity, Review Schedule
- **My Projects** (Leader) — project-focused shortcuts + Leader Dashboard
- **Overview** (Manager) — Team Workload, KPI Achievement, Project vs OKR, Point Audit + Leader Review

---

## 14. File-Tree Map (essentials)

```
vernon_tasks/
├── task/
│   ├── api/             my_work, my_work_mutations, notifications, push,
│   │                    push_prefs, push_action, telemetry, boot,
│   │                    analytics, ic_analytics, exec_analytics, leader_review,
│   │                    security
│   ├── doctype/         vt_task, task_dependency, task_schedule_entry,
│   │                    task_point_log, recurring_rule
│   ├── services/        point_calculator, scheduling_engine,
│   │                    velocity_service, burndown_service,
│   │                    forecast_service, risk_evaluator, push_sender
│   ├── page/            my_work, my_dashboard, my_analytics,
│   │                    leader_dashboard, leader_review,
│   │                    leader_analytics, exec_analytics
│   └── report/          blocked_tasks_escalation, leader_review_schedule,
│                        point_override_audit
├── project/             vt_project, vt_sprint, sprint_task,
│                        project_team_member, project_milestone,
│                        project_documentation; reports: sprint_velocity,
│                        project_progress_vs_okr
├── okr/                 objective, key_result, kpi_definition, kpi_entry;
│                        report: kpi_achievement
├── workforce/           work_profile, work_schedule_day, user_point_summary,
│                        daily_summary; reports: my_points_progress,
│                        team_workload_overview
├── vt_settings/         vt_settings, vernon_telemetry_event,
│                        vernon_push_subscription, vernon_push_preference
├── workspace/           my_tasks, my_projects, overview
├── public/js/           page_nav.js
├── www/                 m.py (SPA shell), m/ (Vite output, git-ignored)
├── hooks.py             registration, doc/scheduler events, fixtures
├── modules.txt          Task, Project, Okr, Workforce, Vt Settings
└── pwa/                 React + Vite + TS source (src/api, src/auth,
                         src/components, src/hooks, src/pages, src/theme,
                         src/router.tsx)
```

---

## 15. Open Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| iOS Web Push gating (≥ 16.4 + A2HS install) | High | Med | In-app hint modal; fall back to in-app notifications |
| Service-worker cache stale post-deploy | Med | Med | Git-SHA cache-key + 1-day SWR expiry |
| Rate-limit false positives on bursty users | Low | Med | Tuned per-endpoint; clear toast w/ retry-after |
| Forecast accuracy on new projects (< 3 sprints) | High | Low | "Insufficient data" UX state instead of guessing |
| Recharts bundle size | Med | Med | Lazy-loaded chunks; only Analytics tabs pay cost |
| Mobile/Desktop layout regressions | Med | Med | Playwright e2e on both viewports; `useMediaQuery` |
| Telemetry PII leakage | Low | High | Allowlist enforcement server-side; no free-form props |

---

## 16. Future Considerations (not committed)

- Department / multi-team OKR rollup hierarchy.
- What-if forecast scenarios (slider on velocity assumption).
- Native iOS / Android shell (Capacitor) if Web Push restrictions block adoption.
- Slack / Email digest integrations.
- Per-objective KPI auto-linking (KPI Entry → Key Result current_value).
- Bulk leader operations (approve N, reassign N).
- AI-assisted task triage / priority suggestions.

---

## 17. References

- `docs/DEVELOPER_GUIDE.md` — engineering setup, conventions
- `docs/API_REFERENCE.md` — full endpoint catalog with payloads
- `docs/rollout/pwa-pilot.md` — pilot checklist
- `docs/superpowers/specs/` — design specs per feature (15 files)
- `docs/superpowers/plans/` — implementation plans per feature (11 files)
- `CLAUDE.md` — project conventions for AI-assisted work

---

*End of PRD v1.0.*

# Vernon Tasks PWA — Foundation + My Work Read-only (P0.5)

**Date:** 2026-05-11
**Scope:** Phase P0.5 of Vernon Tasks PWA initiative
**Status:** Design approved (COO + UI/UX review APPROVE-WITH-CHANGES, integrated)

## Context

Vernon Tasks is an internal Frappe v15 app for company-wide task / OKR / sprint
management. Existing surfaces are Frappe Desk pages (vanilla JS):
`my_dashboard`, `my_work`, `my_analytics`, `leader_dashboard`, `leader_review`,
`leader_analytics`, `exec_analytics`. Analytics APIs already shipped
(Sub-A Leader, Sub-B IC, Sub-C Executive).

Desk UI is not optimised for mobile. This spec covers the first slice of a
standalone Progressive Web App that complements Desk and gives ICs and Leaders
a true mobile experience.

## Goals

- Installable PWA served from `vernon_tasks/www/m/` at route `/m/` (Frappe
  Desk owns `/app`, so PWA uses `/m/` for "mobile")
- Authenticated via Frappe session cookie (same as Desk)
- Read-only offline cache (stale data viewable, mutations require online)
- First user-facing screen: **My Work** list + detail (read-only)
- Foundation primitives ready for P1 mutations and later phases

Non-goals (deferred to later phases):

- Task mutations (complete / log progress) — P1
- Sprint kanban, analytics charts — P2
- Leader views — P3
- Full offline write queue with conflict resolution
- Push notifications (delivery channel) — separate initiative
- Native mobile app

## Phasing (full initiative)

| Phase | Scope | Ship unit |
|-------|-------|-----------|
| **P0.5** | Foundation + My Work read-only (this spec) | 1 |
| P1 | Mutations (complete / log / snooze), install prompt, search, notifications screen | 2 |
| P2 | Dashboard + Analytics screens (kanban read, charts) | 3 |
| P3 | Leader views (review queue, burndown, forecast, risk, exec analytics) | 4 |

Each phase has its own spec + plan + ship.

## Architecture

### Repository layout

```
vernon_tasks/
  pwa/                              # Vite source (new)
    src/
      api/
        client.ts                   # fetch wrapper, 401/403 → ReloginModal
        tasks.ts                    # my_work_list, task_detail
      auth/
        login.tsx
        session.ts                  # cookie probe, expiry detect
        guard.tsx                   # route guard component
      cache/
        sw.ts                       # workbox config (precache + SWR runtime)
        idb.ts                      # IndexedDB read cache wrapper
        sync-time.ts                # per-resource last-sync timestamp
      components/
        BottomNav.tsx               # 4 tabs: Work / Dashboard / Analytics / Me
        Skeleton.tsx
        EmptyState.tsx
        ErrorBoundary.tsx
        Toast.tsx                   # snackbar w/ optional action
        OfflineBanner.tsx           # persistent when offline
        StaleBadge.tsx              # per-screen "Updated 2m ago", amber >1h
        SafeArea.tsx                # iOS notch / Android gesture inset wrapper
        PullToRefresh.tsx
        ReloginModal.tsx            # preserves current route
      pages/
        Onboarding.tsx              # 3-slide first-run, localStorage flag
        MyWork/
          List.tsx                  # grouped by Today / Upcoming / Overdue
          Detail.tsx                # read-only
        Placeholder.tsx             # Dashboard / Analytics / Me stubs
      router.tsx                    # react-router v6
      telemetry.ts                  # POST /api/method/...telemetry.log_event
      i18n.ts                       # id-ID, formal "Anda", DD MMM YYYY
      theme/tokens.css              # light + dark, safe-area vars
      main.tsx
    public/
      manifest.json
      icons/                        # 192, 512, maskable
    index.html
    package.json
    vite.config.ts                  # outDir=../vernon_tasks/www/m, base=/m/
    tsconfig.json
  vernon_tasks/
    www/
      m/                            # Vite build output (git-ignored)
        index.html
        assets/                     # hashed chunks
        sw.js                       # workbox-generated, versioned
    hooks.py                        # add website_route_rules for /m/*
    task/
      api/
        my_work.py                  # NEW: my_work_list, task_detail (if not present)
        telemetry.py                # NEW: log_event whitelisted
```

### Frappe integration

- `hooks.py` adds `website_route_rules` so any unknown `/m/<rest>` request
  returns `www/m/index.html` (SPA fallback)
- `package.json` build script runs Vite before `bench build` collects static
  assets
- Vite emits content-hashed chunks → safe under nginx + service worker caching
- Service worker version string injected from git short SHA at build time

### Auth flow

```
Open /m
  → guard.tsx probes session via GET /api/method/frappe.auth.get_logged_user
      ├─ 200 → continue to requested route (default /m/work)
      └─ 401/403 → redirect /m/login (preserve `next` param)
On /m/login submit
  → POST /api/method/login (usr, pwd)
  → on success: Set-Cookie sid → redirect to `next` (or /m/work)
Mid-session 401/403 from any API call
  → ReloginModal opens above current route, preserves component state
  → user re-logs → modal closes → original request is retried once
```

CSRF: Frappe issues `X-Frappe-CSRF-Token` after login. `api/client.ts` reads
the token from `window.csrf_token` (injected at SPA boot via a small
`/m/_boot` endpoint that returns `{user, csrf_token, sid_age_seconds}`) and
attaches it to mutating requests in later phases.

### Data flow (read-only)

```
Component
  → useQuery(['my-work']) — react-query
      → api/client.get('/api/method/vernon_tasks.task.api.my_work.list')
      → on success: idb.put('my-work', payload); sync-time.stamp('my-work')
      → on network error: idb.get('my-work') and mark stale
Render
  → if data && !stale → list
  → if data &&  stale → list + amber StaleBadge
  → if !data && offline → EmptyState "Belum ada data offline"
  → if loading → Skeleton
```

Service worker strategy:

- App shell (`index.html`, JS/CSS chunks, icons): `precache` (workbox)
- `GET /api/method/vernon_tasks.task.api.*`: `StaleWhileRevalidate`,
  cache name `vt-api-v<SW_VERSION>`, max 50 entries, 1-day expiry
- Everything else: `NetworkOnly`

### Telemetry (minimal)

Single endpoint `POST /api/method/vernon_tasks.task.api.telemetry.log_event`
accepting `{event, props}`. Events emitted in P0.5:

- `pwa_boot` (props: `version`, `display_mode`)
- `login_success`
- `login_failure` (props: `reason`)
- `page_view` (props: `route`)
- `task_view` (props: `task_id`)
- `offline_seen` (props: `route`)

Server side persists to a lightweight `Vernon Telemetry Event` DocType
(timestamp, user, event, props JSON). Retention 90 days via daily cron.

### i18n + locale

- Default `id-ID`
- Formal "Anda", "Tugas Anda", "Masuk", "Keluar"
- Dates: `DD MMM YYYY` (e.g. `11 Mei 2026`)
- Time: `HH:mm` 24h
- Numbers: `Intl.NumberFormat('id-ID')`
- Single `i18n.ts` map; English strings not bundled (can add later)

## UI behaviour

### Bottom navigation

Four tabs, fixed bottom, safe-area aware:

| Tab | Route | P0.5 state |
|-----|-------|------------|
| Tugas | `/m/work` | Active screen |
| Dashboard | `/m/dashboard` | Placeholder "Segera hadir" |
| Analitik | `/m/analytics` | Placeholder |
| Saya | `/m/me` | Profile + logout |

### My Work list

- Header: greeting "Selamat pagi/siang/sore/malam, <Nama>" + date
- Sections in order:
  1. Terlambat (overdue, red accent)
  2. Hari Ini
  3. Mendatang (next 7 days, grouped by day)
- Card shows: title, project, priority dot, due time, points reward
- Tap card → Detail
- Pull-to-refresh on top
- Skeleton: 5 placeholder cards on first load
- Empty state: illustration + "Tidak ada tugas hari ini. Nikmati waktumu."
- StaleBadge top-right when cache age > 1h

### My Work detail

Read-only in P0.5:

- Title, status badge, priority, due date, project, sprint, points
- Description (markdown rendered)
- Activity log (last 10 entries)
- Action bar with disabled buttons (Complete / Log) labelled "Tersedia di
  pembaruan berikutnya" — sets expectation, no dead UI

### Onboarding

3 slides, swipeable, shown on first launch (localStorage
`vt_pwa_onboarded=1`):

1. "Selamat datang di Vernon" — what app is for
2. "Tugasmu, di mana saja" — installable, offline-friendly
3. "Mulai" — CTA → `/m/work`

A2HS prompt deferred to P1 (after first task complete moment).

### Re-login modal

- Triggered on first 401/403 from any API call after boot
- Backdrop dimmed, current route DOM preserved beneath
- Form fields prefilled with last username (not password)
- On success: dismiss, retry original request once
- On dismiss without login: redirect to `/m/login?next=<current>`

### Offline UX

- `OfflineBanner` (sticky top, gray) whenever `navigator.onLine === false`,
  text "Mode offline · terakhir sinkron 14:32"
- `StaleBadge` per screen when this screen's last-sync > 1 hour, amber tint
- All write-bearing UI in P0.5 already disabled, so no queue needed yet

## Error handling

| Failure | Behaviour |
|---------|-----------|
| Network error on GET | Show cached + StaleBadge; if no cache, EmptyState w/ Retry |
| 401 / 403 mid-session | ReloginModal |
| 5xx | Toast "Gagal memuat. Coba lagi." + Retry button |
| Component render error | ErrorBoundary screen: title, "Muat ulang" button, telemetry `error_boundary` |
| SW registration failure | Continue without offline; log telemetry `sw_register_failed` |
| Cookie cleared by browser | Treated as 401 → ReloginModal on next call |

## Backend additions

Two new files in `vernon_tasks/task/api/`:

- `my_work.py`
  - `@frappe.whitelist() def list()` → `{overdue, today, upcoming}` for
    `frappe.session.user`. Reuses existing task query helpers in
    `vernon_tasks/task/services/` where possible.
  - `@frappe.whitelist() def detail(task_id)` → full task incl. activity log
- `telemetry.py`
  - `@frappe.whitelist() def log_event(event, props=None)`

One new DocType:

- `Vernon Telemetry Event` (single table, indexed on `event`, `timestamp`,
  `user`). Hidden from menu, admin-only via role permissions.

One new scheduled job:

- Daily `purge_old_telemetry`: deletes rows older than 90 days.

`hooks.py` additions:

- `website_route_rules`: `[{"from_route": "/m/<path:rest>", "to_route":
  "app"}]` with a www file `www/m.py` serving `www/m/index.html`
- `scheduler_events.daily`: append telemetry purge

## Testing

### Unit (Vitest, in `pwa/`)

- `api/client.test.ts` — 401 triggers re-login event, retry once
- `auth/session.test.ts` — cookie probe parses logged-in vs guest
- `cache/idb.test.ts` — put/get/clear, namespace per resource
- `cache/sync-time.test.ts` — stale threshold 1h
- `i18n.test.ts` — date and number formatting for id-ID

### Component (Vitest + Testing Library)

- `MyWork/List` renders skeleton → data → empty → stale
- `OfflineBanner` reacts to `navigator.onLine` events
- `ReloginModal` preserves underlying DOM
- `BottomNav` highlights current route

### Backend (pytest via bench)

- `my_work.list` returns correct grouping for fixture user
- `my_work.detail` rejects access to other-user tasks
- `telemetry.log_event` rate-limited (max 60/min/user)

### Smoke (Playwright, 1 spec)

- Launch dev server → login → `/m/work` list renders ≥ 1 card

### Manual checklist

- Install on iOS Safari (Add to Home Screen) — icon, splash, standalone mode
- Install on Android Chrome — A2HS banner suppressed (P0.5), manual install works
- Airplane mode → cached list still renders + OfflineBanner shows
- Session expiry (manually delete sid cookie) → ReloginModal appears

## Rollout

1. Merge to `master`, run `bench build`, deploy to staging
2. Pilot: 1 team (5–10 users) for 1 week
3. Measure via telemetry: DAU, install rate, login_failure rate, offline_seen,
   ErrorBoundary frequency
4. Fix issues, then company-wide announcement + Desk banner linking to `/m/`

## Open questions

None — all decisions captured above. P1 spec will revisit swipe ergonomics,
A2HS timing, and notification surface after pilot telemetry is in.

## References

- Frappe v15 docs: `frappe.auth`, website route rules, hooks
- Workbox 7 docs: precaching + runtime strategies
- Apple HIG: mobile navigation, safe areas
- Material Design 3: swipe actions, snackbars, empty states

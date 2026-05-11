# Vernon Tasks

Company-wide task and project delegation system for Frappe.

Implements: OKR/KPI → Project → Sprint → Task hierarchy, PDCA cycle,
Agile/Sprint execution, smart scheduling, and gamified point system.

## Surfaces

- **Desk pages** (`vernon_tasks/task/page/`): my_dashboard, my_work,
  my_analytics, leader_dashboard, leader_review, leader_analytics,
  exec_analytics
- **Mobile PWA** at `/m/` (this README, section below)
- **REST API**: see `docs/API_REFERENCE.md`

## Mobile PWA

Vernon mobile PWA lives in `pwa/` (React 18 + Vite 5 + TypeScript +
workbox). Served at `/m/` via Frappe `website_route_rules` →
`vernon_tasks/www/m.py` SPA shell.

### Routes

| Path | Purpose | Role |
|------|---------|------|
| `/m/login` | Frappe session cookie login | guest |
| `/m/onboarding` | 3-slide first-run, persisted via localStorage | guest |
| `/m/work` | My Work list (read + mutate + search/filter) | user |
| `/m/work/:id` | Task detail + action bar | user |
| `/m/dashboard` | Summary cards + active sprint kanban | user |
| `/m/analytics` | Leaderboard / Velocity / Streak tabs | user |
| `/m/me` | Profile + logout + notif link | user |
| `/m/me/notifications` | Notification Log list + mark-read | user |
| `/m/leader` | Tabs: Review / Sprint / Exec | VT Leader / Manager |

### Build

    ./pwa/build-pwa.sh        # npm install + tsc --noEmit + vite build
    bench restart

Source: `pwa/src/`. Build output: `vernon_tasks/www/m/` (git-ignored,
content-hashed chunks for cache-bust).

### Dev workflow

    cd pwa
    npm run dev               # Vite dev server (port 5173)
    npm run test              # vitest run (~60 cases)
    npm run lint              # tsc --noEmit
    npm run e2e               # Playwright (gated by env vars)

### Bundle

- Main: ~304 KB (gzip ~95)
- Analytics chunk: lazy via React.lazy
- Recharts chunk: lazy, shared between IC and Leader analytics
- Service worker: workbox-generated, StaleWhileRevalidate on
  `/api/method/vernon_tasks.*`, 1-day cache

### Telemetry

PWA emits events to `Vernon Telemetry Event` DocType via
`/api/method/vernon_tasks.task.api.telemetry.log_event`. Allowlist
enforced server-side. Daily purge at 90-day retention via
`scheduler_events.daily`.

### Pilot rollout

See `docs/rollout/pwa-pilot.md`.

## Development standards

See `docs/DEVELOPER_GUIDE.md`.

## API reference

See `docs/API_REFERENCE.md`.

# Vernon Tasks

Company-wide task and project delegation system for Frappe.

Implements: OKR/KPI → Project → Sprint → Task hierarchy, PDCA cycle,
Agile/Sprint execution, smart scheduling, and gamified point system.

## Surfaces

Three frontends now coexist:

- **Desk pages** (`vernon_tasks/task/page/`): my_dashboard, my_work,
  my_analytics, leader_dashboard, leader_review, leader_analytics,
  exec_analytics
- **Mobile PWA** at `/m/*` on the Frappe origin (see section below)
- **Vernon Dashboard (www-react)** — standalone desktop SPA on its own
  domain (see section below)
- **REST API**: see `docs/API_REFERENCE.md`

## Vernon Dashboard (www-react)

Standalone Vite + React 18 + TypeScript SPA for the desktop dashboard
(IC + Leader + Exec, role-aware). Runs on its own domain via Caddy
reverse-proxy and authenticates with the Frappe site cross-origin using
the existing session cookie (CORS + `SameSite=None; Secure`).

- **Path:** `apps/vernon_tasks/www-react/`
- **Routes:** `/login`, `/portal/dashboard`, `/portal/projects`,
  `/portal/projects/:id/{tasks,overview,burndown,okr,members}`,
  `/portal/worksheet`, `/portal/reports`, `/portal/reports/:slug`
- **Stack:** React Router 7, TanStack Query 5, Tailwind, dnd-kit,
  recharts, sonner, react-i18next; Vitest + Playwright

### Build

    cd www-react
    npm install
    npm run build        # output: www-react/dist/

### Deploy

1. Upload `www-react/dist/` to the gateway host (e.g.
   `/var/www/vernon-dashboard`).
2. Apply `caddy/dashboard.Caddyfile` and reload Caddy.
3. Add `"allow_cors": "https://dashboard.vernon.local"` to the Frappe
   site's `common_site_config.json`.
4. See `www-react/README.md` for the full checklist.

### Spec

- Design: `docs/superpowers/specs/2026-05-23-www-react-dashboard-design.html`
- Schema: `docs/superpowers/specs/2026-05-23-schema-mapping.html`
- ADR: `docs/adr/standalone-www-react-spa.html` (ADR-021)

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

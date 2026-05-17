# PRD — Desktop Portal Foundation (Phase 1)

**Status:** Draft
**Date:** 2026-05-17
**Owner:** Vernon Tasks
**Scope:** Umbrella PRD — portal shell, routing, auth, permissions, design system wiring. Domain features (OKR, Projects, Workforce, Reports) are out of scope and will follow as sub-PRDs.

---

## 1. Background & Goal

Vernon Tasks today ships a mobile-first PWA mounted at `/m/*` (React + Vite, in `pwa/`), targeting worker-level task execution. Managers, admins, and PMOs need a desktop-class interface for strategic, multi-domain work (OKR overview, project planning, workforce analytics, reporting) that mobile UI cannot serve well.

**Goal:** Establish a desktop portal at `/app/*` inside the existing `pwa/` codebase — sharing auth, API, cache, i18n, telemetry, and component primitives with the mobile PWA — while providing a separate layout shell, navigation, and permission model tailored to manager/admin workflows. This PRD covers the foundation; each domain (OKR, Projects, Workforce, Reports) will be specced and implemented as a separate sub-PRD.

**Non-goals (Phase 1):**
- Domain content (OKR/Projects/Workforce/Reports pages — stubs only)
- Real command palette (placeholder dialog only)
- Mobile↔portal state handoff
- Multi-tenant theming
- Sidebar layout (topbar-only Phase 1; sidebar may come later if nav grows)

---

## 2. Users & Personas

| Persona | Primary jobs |
|---------|--------------|
| Manager | Review OKR progress, monitor team workload, approve project plans |
| Admin / PMO | Configure projects, manage roles, run cross-domain reports |
| Worker (transient) | May land on `/app/*` from a link — gracefully redirected to `/m/*` |

Access is permission-gated, not role-gated: any user with a matching permission key sees the corresponding nav item and route.

---

## 3. Architecture

### 3.1 Approach (Approach A — Single SPA, multi-shell routing)

Single Vite entry (`pwa/src/main.tsx`) and single bundle. The top-level router branches by URL prefix to a mobile shell or a portal shell, each shell lazily code-split.

**Top-level routes:**
```
/m/*    → <MobileShell>   (existing)
/app/*  → <PortalShell>   (new, React.lazy)
/       → redirect by viewport + role hint
```

**Code-split:** `React.lazy(() => import('./portal/PortalShell'))` keeps the portal chunk out of the mobile bundle path.

### 3.2 Folder Layout

```
pwa/src/
├── components/      shared atoms (Button, Input, Badge, Table, Form, EmptyState, ...)
├── api/ auth/ cache/ hooks/ theme/ i18n.ts telemetry.ts   (shared)
├── mobile/          (current pages/ moved under mobile/)
│   └── pages/
└── portal/
    ├── PortalShell.tsx       desktop guard + layout grid
    ├── TopBar.tsx            horizontal nav + search + bell + profile
    ├── routes.tsx            portal sub-router
    ├── nav.ts                nav registry (key, label, path, icon, permission)
    ├── guards/
    │   ├── PortalGuard.tsx   auth + viewport guard for /app/*
    │   └── RequirePermission.tsx
    ├── layouts/              PageLayout, SplitLayout, FullBleed
    └── pages/
        ├── Dashboard.tsx
        ├── PermissionDenied.tsx
        ├── NotFound.tsx
        └── ErrorPage.tsx
```

Existing `pwa/src/pages/` are moved under `pwa/src/mobile/pages/` as part of P1.

### 3.3 Backend Wiring

- `vernon_tasks/hooks.py`: extend `website_route_rules` with `/app/<path:app_path>` → `vernon_tasks.www.app.app` (mirror of `m.py`).
- New files:
  - `vernon_tasks/www/app/__init__.py`
  - `vernon_tasks/www/app/app.py` (serves the same `pwa/dist/index.html`)
  - `vernon_tasks/www/app/app.html`
- Nginx static asset symlink: `sites/{site}/public/app` → `pwa/dist/` (same pattern as `/m/`, per memory `project_frappe_pwa_nginx`).
- Feature flag: `portal_enabled` in VT Settings; when off, `/app/*` returns 404 (or redirects to `/m/`).

---

## 4. Shell Components & Navigation

### 4.1 `<PortalShell>`
- Desktop-only: `useMediaQuery('(min-width: 1024px)')`. On viewport <1024 → redirect `/m/`.
- Layout grid: topbar 56px high, main fills remaining viewport.
- Renders `<TopBar />` + `<Outlet />` for sub-routes.

### 4.2 `<TopBar>` (left → right)
- `Logo` — click navigates to `/app/`.
- `PrimaryNav` — horizontal items from `portal/nav.ts`, filtered by permission.
- Spacer.
- `<GlobalSearch>` — `cmd+k` opens dialog. Phase 1: stub dialog with "coming soon".
- `<NotificationBell>` — reuses existing PWA notification API.
- `<ProfileMenu>` — avatar dropdown: profile, settings, switch to mobile, logout.

### 4.3 Nav Registry (Phase 1)

```ts
export const portalNav: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', path: '/app',          permission: null },
  { key: 'okr',       label: 'OKR',       path: '/app/okr',      permission: 'okr.read' },
  { key: 'projects',  label: 'Projects',  path: '/app/projects', permission: 'project.read' },
  { key: 'workforce', label: 'Workforce', path: '/app/workforce',permission: 'workforce.read' },
  { key: 'reports',   label: 'Reports',   path: '/app/reports',  permission: 'report.read' },
];
```

Domain routes render "coming soon" stubs in Phase 1.

### 4.4 `<PageLayout>` Wrapper

Standard page wrapper used by every domain page: title, breadcrumb, actions slot, body slot.

### 4.5 Guards

- `<PortalGuard>` at root of `/app/*`: unauthenticated → `/login?next=...`; viewport <1024 → `/m/`.
- `<RequirePermission perm="...">` per route: missing permission → `<PermissionDenied>` page.

---

## 5. Data Flow & Permissions

### 5.1 API

Reuses existing `pwa/src/api/` (frappe-fetch wrapper). New endpoint:

```
GET /api/method/vernon_tasks.api.auth.get_user_permissions
  → { permissions: string[], roles: string[] }
```

Cached via existing react-query setup (`pwa/src/cache/`). Invalidated on login/logout.

### 5.2 Permission Helper

`pwa/src/auth/usePermissions.ts`:
- `hasPermission(perm: string): boolean`
- `hasAnyPermission(perms: string[]): boolean`
- `hasRole(role: string): boolean`

Consumed by `<PortalGuard>`, `<TopBar>` nav filter, and `<RequirePermission>`.

### 5.3 Permission Keys

Convention: `<domain>.<action>`. Phase 1 registry:

| Key | Description |
|-----|-------------|
| `okr.read`       | View OKR data |
| `okr.write`      | Edit OKR data |
| `project.read`   | View projects |
| `project.write`  | Edit projects |
| `workforce.read` | View workforce data |
| `report.read`    | View reports |

Backend mapping (Phase 1): Frappe Role → permission keys, hard-coded in `vernon_tasks/api/auth.py`. Granular per-record permission DocType is a follow-up, out of scope.

### 5.4 State Boundaries

- Server state → react-query (per-domain key namespace: `['okr', ...]`, `['project', ...]`).
- Client UI state → component-local; Zustand store only for cross-route UI (theme already lives in `pwa/src/theme/`).
- No global Redux. Prop drilling capped at 2 levels.

### 5.5 Telemetry

Extend `pwa/src/telemetry.ts` with:
- `portal.page_view` — payload: `{ path }`
- `portal.nav_click` — payload: `{ key, path }`
- `portal.permission_denied` — payload: `{ path, required_perm }`
- `portal.error` — payload: `{ path, message }`

---

## 6. Error Handling, Loading, Empty States

### 6.1 Error Boundaries

Two layers:
- **Shell-level** `<PortalErrorBoundary>` wraps `<PortalShell>` children — catches catastrophic render errors → `<ErrorPage>` (retry, report-bug link, `telemetry('portal.error', ...)`).
- **Page-level** boundary inside each route for recoverable errors.

Domain components must not swallow errors silently.

### 6.2 API Error Contract (global react-query `onError`)

| Status | Behavior |
|--------|----------|
| 401    | Redirect `/login` |
| 403    | Render `<PermissionDenied>` (shows required permission + "request access" button stub) |
| 404    | Render `<NotFound>` (links back to portal home) |
| 5xx    | Toast + retry button; log to telemetry |
| network/offline | Banner "Connection lost"; retry queue |

### 6.3 Loading

- Page-level: `<PageSkeleton>` (topbar persists, body skeleton). No blank flash.
- Inline: `<Spinner>` on action buttons; optimistic updates where safe.
- Suspense boundary per route (paired with `React.lazy`).

### 6.4 Empty States

Shared `<EmptyState icon title description action />` in `components/`. All domain pages must use it — no blank tables.

---

## 7. Testing

### 7.1 Unit (vitest, existing harness)
- `portal/**/*.test.tsx` covers: TopBar nav filter by permission, PortalGuard redirect rules, RequirePermission gating, PageLayout slot rendering.

### 7.2 Integration
- react-query + MSW mock of `get_user_permissions`.
- Scenarios:
  - No permissions → nav menu empty, all domain routes blocked.
  - Partial permissions → only matching menu items + routes accessible.
  - All permissions → full menu.

### 7.3 E2E (playwright, existing `pwa/e2e/`)
- `portal-shell.spec.ts`: login → land `/app` → nav click → URL update → permission-denied flow → switch-to-mobile flow.

### 7.4 Backend
- `vernon_tasks/api/test_auth.py` — `get_user_permissions` returns correct keys per Frappe role.

### 7.5 Coverage Gate
- `portal/` ≥80% lines.

---

## 8. Build & Bundle

- Vite config: add `manualChunks` to isolate `portal` chunk from `mobile`.
- `pwa/build-pwa.sh` unchanged (single build outputs both shells).
- Bundle budget: portal chunk ≤200KB gzip Phase 1 (shell only). CI check.

---

## 9. Rollout

### Phases
1. **P1 — Foundation (this PRD):** route mount, shell, topbar, auth/permission, error boundaries, dashboard stub with "coming soon" cards per domain. Ship behind `portal_enabled` feature flag in VT Settings.
2. **P2 — OKR sub-PRD** (separate doc + plan).
3. **P3 — Projects sub-PRD.**
4. **P4 — Workforce sub-PRD.**
5. **P5 — Reports sub-PRD.**

### GA Gate
- All domain MVPs done.
- 2-week UAT with managers.
- Telemetry shows zero unhandled errors over a 7-day window.

---

## 10. Success Metrics

| Metric | Target |
|--------|--------|
| Shell LCP (p75) | <1.5s |
| Portal bundle (gz, Phase 1) | ≤200KB |
| Permission check correctness | 100% (verified by tests) |
| Unhandled errors in telemetry (7d post-deploy) | 0 |

---

## 11. Open Questions

- Are permission keys versioned alongside the backend, or shipped as a separate config? (Default: collocated with `vernon_tasks/api/auth.py`.)
- Should `/` root redirect prefer viewport (desktop → `/app`, mobile → `/m`) or role (manager → `/app`, worker → `/m`)? (Default: viewport-first, role as tiebreaker.)
- Notification bell content for portal — same feed as mobile or filtered to manager-relevant events? (Default: same feed Phase 1; filter in P2+.)

---

## 12. Out of Scope (Tracked for Future PRDs)

- Domain pages (OKR, Projects, Workforce, Reports) — each gets its own sub-PRD.
- Real `cmd+k` command palette (Phase 1 ships stub dialog).
- Sidebar/collapsible nav (only if nav count grows past topbar comfort).
- Mobile↔portal in-session state handoff.
- Multi-tenant theme overrides.
- Granular per-record permission DocType.

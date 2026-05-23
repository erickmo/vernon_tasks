# Vernon www-react

Standalone Vite + React 18 SPA for the Vernon Tasks desktop dashboard.

## Dev

    npm install
    cp .env.example .env  # set VITE_API_BASE to your Frappe origin
    npm run dev           # http://localhost:5174

## Test

    npm test               # vitest unit + integration
    npm run e2e            # playwright (auto-starts dev server)
    npm run typecheck

## Build

    npm run build          # output to dist/

## Deploy

1. Build → upload `dist/` to `/var/www/vernon-dashboard` on the gateway host.
2. Apply `caddy/dashboard.Caddyfile` and reload Caddy.
3. Frappe site config (`common_site_config.json`) must include:

       "allow_cors": "https://dashboard.vernon.local"

4. Verify cross-origin cookie: `curl -i https://dashboard.vernon.local/api/method/login -d 'usr=...&pwd=...'`
   Response must include `Set-Cookie: sid=...; Secure; SameSite=None`.

## Spec / Plans

- Spec: `../docs/superpowers/specs/2026-05-23-www-react-dashboard-design.html`
- Plans: `../docs/superpowers/plans/2026-05-23-www-react-*.md`

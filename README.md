# Vernon Tasks

Company-wide task and project delegation system for Frappe.

Implements: OKR/KPI → Project → Sprint → Task hierarchy, PDCA cycle,
Agile/Sprint execution, smart scheduling, and gamified point system.

## Mobile PWA

Vernon mobile PWA lives in `pwa/` (React + Vite). Served at `/m/`.

Build:

    ./pwa/build-pwa.sh
    bench restart

Source: `pwa/src/`. Build output: `vernon_tasks/www/m/` (git-ignored).

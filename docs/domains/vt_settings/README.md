# Domain: VT Settings

App-level singletons + telemetry + push storage.

## Modules

- `vernon_tasks/vt_settings/doctype/` — `vt_settings` (singleton), `vernon_telemetry_event`, `vernon_push_subscription`, `vernon_push_preference`

## Fields (VT Settings)

Source: PWA boot consumes branding fields. See `vernon_tasks/task/api/boot.py` + commit 1fc12ca (login left-panel link).

## Retention

- `Vernon Telemetry Event` — 90 days, purged via scheduler `purge_old_telemetry`.

## Cross-Domain Events

### Triggers
| Event | Payload | Listeners |
|-------|---------|-----------|
| settings.updated | {fields_changed} | pwa boot (refresh on next session) |

### Listens
| Event | Source | Action |
|-------|--------|--------|
| push.subscribed | task (push.py) | persist `vernon_push_subscription` |
| telemetry.event | task (telemetry.py) | insert `Vernon Telemetry Event` (rate-limited) |

## ADRs

ADR-011 (security guards apply to telemetry + push endpoints).

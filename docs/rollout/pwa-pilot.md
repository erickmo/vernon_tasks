# Vernon PWA P0.5 Pilot

## Pre-launch

- [ ] `./pwa/build-pwa.sh` succeeds locally
- [ ] `bench build && bench restart` on staging
- [ ] `/m/` returns SPA on staging
- [ ] iOS Safari: A2HS works, icon + standalone display
- [ ] Android Chrome: manual install works
- [ ] Airplane mode: cached list still renders, banner shows
- [ ] Manually expire `sid` cookie: ReloginModal opens
- [ ] Vernon Telemetry Event records `pwa_boot` rows

## Pilot week

- [ ] 1 team (5–10 users) invited
- [ ] Daily check on `Vernon Telemetry Event` for `error_boundary` and
      `login_failure` rates
- [ ] Collect qualitative feedback (Slack thread / form)

## Go/no-go gate

- [ ] `error_boundary` < 1% of `page_view`
- [ ] `login_failure` post-success < 5%
- [ ] Install rate ≥ 30% of pilot users
- [ ] No P0 bugs open

## Company-wide

- [ ] Desk banner linking to `/m/`
- [ ] Email announcement

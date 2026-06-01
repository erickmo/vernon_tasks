# Vernon Tasks — Project Context

## Stack

- **Backend**: Frappe Framework (Python)
- **Frontend**: Frappe Web (Jinja templates) + Frappe Desk (`/app`)

The mobile PWA (`pwa/`, served under `/m/*`) and the `/portal` route were removed.
The app is now desk-only: `/` redirects to `/app` (or `/login` for guests).

## Onboarding & First-Run (PRD-025)

- New users are auto-granted `VT Member` on login via the `on_session_creation`
  hook (`setup/roles.py`); the role grant is wrapped so it can never break login.
- The navbar is seeded on `after_install`/`after_migrate` only when empty
  (`setup_website.ensure_navbar_seeded`) — admin edits are preserved.
- The post-login landing (`task/page/vt_home`) shows an onboarding checklist card.
  Step **completion is derived per-user from data** (`task/api/onboarding.py`),
  NOT from the native `Onboarding Step.is_complete` flag (that flag is global).
  The native `Module Onboarding` records (`task/module_onboarding/`,
  `task/onboarding_step/`) are the declarative catalog + Workspace surface,
  seeded idempotently by `setup/onboarding_seed.py`.
- Optional demo data lives in `setup/demo_data.py` (per-user refs stored in
  `VT Settings.demo_data_refs`); load/clear exposed via `task/api/onboarding.py`.
- Shared first-run empty states use `public/js/vt_empty.js`
  (`window.vt_render_empty_state`).

## Frappe Stack Skills

Load when working on this project:
```
~/.claude/skills/frappe-coding-standard/SKILL.md
~/.claude/skills/erpnext-api/SKILL.md
```

## Documentation Format

All spec files in `docs/superpowers/specs/` MUST be `.html`, not `.md`.
Use the existing HTML template: `<!doctype html>` shell with `../../assets/style.css` + `../../assets/layout.js`, body converted from markdown via Python `markdown` module (extensions: tables, fenced_code, toc).
Never commit `.md` specs — convert first, then delete the `.md`.

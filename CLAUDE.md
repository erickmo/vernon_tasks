# Vernon Tasks — Project Context

## Stack

- **Backend**: Frappe Framework (Python)
- **Frontend**: Frappe Web (Jinja templates + Frappe's asset pipeline)
- **PWA**: React + Vite at `pwa/` — served under `/m/*` routes via Frappe's SPA hook

## PWA Notes

The PWA frontend (`pwa/`) is still a **Frappe web app**, not a standalone React app.
Assets are built by Vite and served through Frappe's static file pipeline.
Routes are registered via Frappe hooks — do NOT treat it as a standalone CRA/Vite project.

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

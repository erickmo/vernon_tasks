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

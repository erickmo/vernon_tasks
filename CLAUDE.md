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

## Unified Hierarchy (VT Item) — MIGRATION COMPLETE (P1–P4)

`VT Item` (`task/doctype/vt_item/`) is the canonical OKR→Task tree: one
Frappe nested-set doctype (`is_tree:1`, controller extends `NestedSet`)
discriminated by `node_type` (OKR/KPI/Project/Sprint/Task), fat single
doctype with per-type fields gated by `depends_on`. Controller owns
per-type autoname (`OKR-`/`KPI-`/`PROJ-`/`SP-`/`TASK-`), parent-type
validation (strict order + flexible skips: Task may skip Sprint, Project
may skip OKR, KPI at root or under OKR), brand inheritance from nearest
ancestor, `percent_done` rollup, `is_group` auto-promote, and the full Task
lifecycle (ported P3): `kanban_status` sync from `pdca_phase`
(`PDCA_KANBAN_MAP`), `VALID_PDCA_TRANSITIONS` Deming-cycle guard (gated on
existing-node phase change; new nodes seed any phase), Task defaults
(pdca→BACKLOG, weight→1), `_validate_task_fields` (weight>0, override_reason,
recurring_rule), and `_stamp_completion` (CLOSED→completion_date). Measurement
rows hang off nodes via child doctypes `VT Item Key Result` (under OKR) and
`VT Item KPI Entry` (under KPI) — the legacy standalone `Key Result` /
`KPI Entry` are left untouched (dropped with the rest of the legacy
hierarchy in P4).

**Completion model:** all node types share the pdca terminal `CLOSED`
(Task done = `pdca_phase == "CLOSED"`, board column "Done" via sync). Task
recurrence lineage uses `recurring_parent` (a plain Link), NOT the tree
parent (a Task may not be a tree-child of a Task).

**P2 (services):** all `task/services/*` read the tree via the foundation
`task/services/vt_item_tree.py` (`nodes`/`children`/`descendants`/
`ancestor_of_type`/`project_of`/`child_table_rows`) instead of legacy
doctypes. Per-service query map:
`docs/superpowers/plans/2026-06-07-vt-item-p2-service-map.json`.

**P3 (APIs):** all 12 hierarchy APIs (`brand/api/*`, `task/api/*`) read AND
write `VT Item` EXCLUSIVELY (no dual-write, no legacy back-compat). Mutation
APIs keep legacy JSON response keys (`assigned_to`, `sprint`) backed by
`owner_user` / tree parent via aliases. `complete()` bypasses the transition
guard (`flags.ignore_validate`); board drag-drop enforces it. Child-table
Links repointed VT Task→VT Item: `Task Point Log.task` (P2),
`Task Dependency.blocked_by` (P3). Per-API map:
`docs/superpowers/plans/2026-06-07-vt-item-p3-api-map.json`.

**P4 (pages/reports/hooks/drop):** all 17 consumers (7 reports + 10 pages incl
desk JS) read VT Item; new `vt-tree` navigator page (`task/page/vt_tree/`);
`hooks.py` `doc_events` collapsed to one node-aware `VT Item` block
(`calculate_points` fires once on the live CLOSED transition, `invalidate_project_cache`
resolves project via `tree.project_of`); controller `_validate_children` invokes
child-row validate; carry-over Links repointed to VT Item (`Task Dependency`,
`risk_event`, aux controllers); `demo_data`/`onboarding_seed`/onboarding_step +
workspace nav all create/point at VT Item. The legacy doctypes
(Objective / Key Result / KPI Definition / KPI Entry / VT Project / VT Sprint /
VT Task / Sprint Task) are **DROPPED** (patch `drop_legacy_hierarchy_doctypes`;
code dirs deleted). `aggregate_kr_progress` relocated to `brand_okr.py`.

**Status: MIGRATION COMPLETE — the app runs on `VT Item` only.** No legacy
hierarchy doctype remains in code or DB. Full suite green (584 tests).
Spec: `docs/superpowers/specs/2026-06-07-vt-item-unified-hierarchy-design.html`;
plans: `…-p1-doctype.md`, `…-p2-services.md`, `…-p3-apis.md`, `…-p4-finalize.md`.

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

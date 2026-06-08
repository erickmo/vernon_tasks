# VT Item — P4: Pages, Reports, Hooks, Drop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Finish the migration — move every remaining consumer (reports, desk pages) onto `VT Item`, add the `vt-tree` navigator, rewire `hooks.py` + carry-over Links + demo data onto the tree, then DROP the legacy hierarchy doctypes and reseed. After P4 the app runs end-to-end on `VT Item` only.

**Ordering is mandatory (the drop is destructive):** consumers → hooks/links/demo → DROP → e2e smoke. Nothing may reference a legacy doctype in executable code before the drop.

**Tech Stack:** Frappe Python + desk-page JS, `vt_item_tree`, `FrappeTestCase`. Bench in docker: `docker exec frappe-backend-1 bench --site task.localhost <cmd>`. Desk-page JS changes need `bench clear-cache` + (for hooks) `docker restart frappe-backend-1`; no `bench build` (assets symlinked).

**Inputs:** consumer map `docs/superpowers/plans/2026-06-07-vt-item-p4-consumer-map.json` (per-unit direct_queries → tree_equivalent, cosmetic strings, tests); spec `…2026-06-07-vt-item-unified-hierarchy-design.html`.

---

## Shared recipe (reports + pages)
- Reads: `from vernon_tasks.task.services import vt_item_tree as tree` — `nodes(node_type,filters,fields,order_by,limit)`, `children(parent,node_type,…)`, `descendants(node,node_type,…)`, `ancestor_of_type`/`project_of`, `child_table_rows(node,fieldname)`. Or call a migrated `task/api`/`brand/api` endpoint.
- Field renames: `objective_owner`/`assigned_to`→`owner_user`; Objective/Project `status`→`health_status`; Sprint `status`→`sprint_state`; Task done = `pdca_phase=="CLOSED"`; a task's project = `tree.project_of(node)`; Sprint title `sprint_title`→`title`; KPI `kpi_name`→`title`.
- KR/KPI-Entry data = child rows on OKR/KPI nodes (`VT Item Key Result` / `VT Item KPI Entry`), via `child_table_rows` or `frappe.db.sql` on `tabVT Item Key Result`/`tabVT Item KPI Entry` (WHERE parent=node AND parenttype='VT Item').
- **Reports:** keep `execute(filters)` returning the SAME (columns, data) shape — change only the data source. Column `options: "VT Task"|"VT Project"|...` → `"VT Item"`. `.json` `ref_doctype` → `VT Item`.
- **Page JS:** replace `frappe.db.get_list("VT Task"…)` / `frappe.call` to legacy with a migrated API call or `frappe.db.get_list("VT Item", {filters: {node_type:"Task", …}})`. `frappe.new_doc("VT Task")` / `frappe.set_route("List","VT Task")` → `"VT Item"` (preset `node_type` on create). Keep response-key usage stable (APIs already alias `assigned_to`/`sprint`).
- **Cosmetic-only** units (`leader_analytics`, `my_analytics`, `vt_project_detail`): only repoint route/label strings to `VT Item`.
- Verify each unit: run its `test_*` module if present; for JS-only units, confirm the called API works + grep shows no legacy doctype query remains; reports — run `execute` via `bench execute <module>.execute` (or its test).

---

## Phase P4.1 — Reports (7) + P4.2 Pages query-rewrite (7) + P4.3 Pages cosmetic (3)
One task per unit (subagent), per the consumer map. Order: reports first (pure backend, testable), then page PY+JS, then cosmetic. Commit each `refactor(item): migrasi <unit> ke VT Item tree`.

Units (cx from map): reports — kpi_achievement M, sprint_velocity M, project_progress_vs_okr M, blocked_tasks_escalation M, leader_review_schedule M, point_override_audit S, team_workload_overview M. Pages(rewrite) — vt_okr M, vt_scorecard M, vt_team M, leader_review M, vt_home M, vt_brand_detail S, vt_projects S. Pages(cosmetic) — leader_analytics, my_analytics, vt_project_detail.

---

## Phase P4.4 — `vt-tree` navigator page
Create desk page `task/page/vt_tree/` (slug `vt-tree`, NOT `vt-item` — avoid Page/DocType slug collision): renders the native VT Item tree drill OKR→Task. Minimal: a page that embeds `frappe.views.trees` for `VT Item` or links to `/app/vt-item/view/tree`, plus a typed filter. Add to nav (VT Settings navbar / workspace) as the "one tree screen". Fixture the Page.

---

## Phase P4.5 — Hooks + carry-over Links + demo data
- **`hooks.py` `doc_events`:** replace the `VT Task`/`VT Project`/`VT Sprint` keys with a single `"VT Item"` block:
  ```python
  "VT Item": {
      "on_update": [
          "vernon_tasks.task.services.point_calculator.calculate_points",
          "vernon_tasks.task.services.scheduling_engine.on_task_update",
          "vernon_tasks.task.api.analytics.invalidate_project_cache",
      ],
  },
  ```
  Drop the no-op `validate_permissions`/`validate_team` stubs. Move `calculate_points` OFF `on_submit` (VT Item is not submittable).
- **Make the 3 handlers node-aware:**
  - `point_calculator.calculate_points(doc, method)`: early-return unless `doc.node_type=="Task"`; fire only on the CLOSED transition — `before = doc.get_doc_before_save(); if before and before.pdca_phase=="CLOSED": return` (avoid double point logs); existing `pdca_phase==CLOSED & completion_date` guard stays.
  - `analytics.invalidate_project_cache(doc, method)`: resolve project = `doc.name if doc.node_type=="Project" else tree.project_of(doc.name)`; return if none.
  - `scheduling_engine.on_task_update`: no-op — leave (optionally `if doc.node_type!="Task": return`).
- **scheduler_events:** unchanged (targets already-migrated services) — smoke each.
- **Carry-over Links → VT Item:** `risk_event.json` `project` + `task`; `task/report/leader_review_schedule/*.json` `ref_doctype`; `onboarding.py` step `route_target` "VT Task"→ VT Item create flow. Drop the redundant `project/doctype/sprint_task` (tasks are tree children).
- **`setup/demo_data.py` + `setup/onboarding_seed.py`:** rewrite to create `VT Item` nodes (reuse `setup/seed_vt_item_demo.py` patterns) instead of legacy records.

---

## Phase P4.6 — DROP + reseed + e2e smoke (LAST)
- **Patch `drop_legacy_hierarchy_doctypes`** (`patches/v1_x/`): for each of `Objective`, `Key Result`, `KPI Definition`, `KPI Entry`, `VT Project`, `VT Sprint`, `VT Task`, `Sprint Task` — `frappe.delete_doc("DocType", name, force=True, ignore_missing=True)` + `frappe.db.sql_ddl("DROP TABLE IF EXISTS `tab<name>`")`. Idempotent (guard on `frappe.db.exists`). Register in `patches.txt`.
- **Delete legacy code dirs:** `okr/doctype/{objective,kpi_definition,key_result,kpi_entry}`, `project/doctype/{vt_project,vt_sprint,sprint_task}`, `task/doctype/vt_task` + their `test_*`. Remove any now-dangling imports.
- **Reseed:** run migrate + the rewritten demo seed.
- **e2e smoke:** `bench migrate` clean; run the WHOLE suite (`bench run-tests --app vernon_tasks` — expect no legacy-doctype errors beyond the pre-existing brand-mandatory test debt noted in memory); load `/app/vt-home`, `/app/vt-tree`, `/app/vt-project-detail`, `/app/vt-brand-detail`, each report — confirm render (manual/`bench execute`). `docker restart frappe-backend-1` for hooks.

---

## Self-Review
- Spec §6 tree UI → P4.4 ✓; §7 pages+reports → P4.1–P4.3 ✓; §8 fresh-start drop → P4.6 ✓.
- Ordering enforced: no executable legacy ref survives into P4.6 (grep gate before drop).
- Destructive step isolated + idempotent + after all consumers; e2e smoke is the completion gate.
- Known residue: pre-existing brand-mandatory task-module test debt (memory `project_vt_project_brand_mandatory_test_debt`) is NOT a P4 regression.

# VT Item — P3: API Layer Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox syntax.

**Goal:** Migrate all 12 hierarchy API modules (`brand/api/*`, `task/api/*`) to read AND write the unified `VT Item` tree, delegating reads to the P2 foundation `task/services/vt_item_tree.py` and the already-migrated `task/services/*`.

**Architecture:** APIs are thin `@frappe.whitelist()` HTTP entrypoints. P2 migrated the service layer; P3 migrates the API layer's OWN direct legacy queries + create/update/delete flows.

## Cardinal rule (resolves the P1/P2 ambiguity)
**APIs read AND write `VT Item` EXCLUSIVELY.** No dual-write, no legacy back-compat reads. The legacy doctypes (Objective, Key Result, KPI Definition, KPI Entry, VT Project, VT Sprint, VT Task) are DEAD to the API layer. Each API's tests are rewritten to SEED `VT Item` nodes and assert against them. (Real data coherence arrives at P4: legacy drop + reseed. During P3 the live legacy data is invisible to migrated APIs — accepted, dev/fresh-start.)

**Tech Stack:** Frappe Python, `vt_item_tree` helpers, `FrappeTestCase`. Bench in docker: `docker exec frappe-backend-1 bench --site task.localhost <cmd>`. NOTE: rewriting an existing whitelisted method's BODY needs no re-register; `bench run-tests` imports fresh so tests see new code without a restart (runtime/browser needs `docker restart frappe-backend-1`).

**Inputs:** spec `docs/superpowers/specs/2026-06-07-vt-item-unified-hierarchy-design.html`; per-API map `docs/superpowers/plans/2026-06-07-vt-item-p3-api-map.json` (authoritative reads/writes_creates per file).

---

## Read translation (same as P2)
Use `from vernon_tasks.task.services import vt_item_tree as tree`:
`tree.nodes(node_type,filters,fields,order_by,limit)`, `tree.children(parent,node_type,...)`, `tree.descendants(node,node_type,...)`, `tree.ancestor_of_type(node,type)`, `tree.project_of(node)`, `tree.child_table_rows(node,fieldname)`.

| Legacy | Tree |
|---|---|
| Objective WHERE brand==B | `tree.nodes("OKR", {"brand": B})` |
| Key Result WHERE objective==O | `tree.child_table_rows(O, "key_results")` |
| KPI Definition WHERE brand==B | `tree.nodes("KPI", {"brand": B})` |
| KPI Entry WHERE kpi_definition==K | `tree.child_table_rows(K, "kpi_entries")` |
| VT Project WHERE objective==O | `tree.children(O, "Project")` |
| VT Project WHERE brand==B | `tree.nodes("Project", {"brand": B})` |
| VT Sprint WHERE project==P | `tree.children(P, "Sprint")` |
| VT Task WHERE project==P | `tree.descendants(P, "Task")` |
| VT Task WHERE sprint==S | `tree.children(S, "Task")` |
| a task's project | `tree.project_of(task)` |

Field renames: `objective_owner`/`assigned_to` → `owner_user`; Objective/Project `status` → `health_status`; Sprint `status` → `sprint_state`. Data field names preserved.

## Create-node recipe (writes)
Create any hierarchy record as a `VT Item` node:
```python
node = frappe.get_doc({
    "doctype": "VT Item",
    "node_type": "Project",          # OKR | KPI | Project | Sprint | Task
    "parent_vt_item": parent_name,   # OKR→brand-less root or under OKR; Project→OKR/None; Sprint→Project; Task→Sprint/Project
    "title": title,
    # field renames applied: owner_user=..., health_status=..., sprint_state=...
}).insert(ignore_permissions=...)   # match the legacy call's permission posture
```
Rules:
- Task completion sets `pdca_phase = "CLOSED"` (NOT "DONE"). Do NOT set `kanban_status` directly except to `"Blocked"` — the controller derives it from `pdca_phase`.
- Task recurrence lineage → `recurring_parent` (Link), never the tree parent.
- `Task Point Log.task` is now `Link→VT Item`; create point logs with the task NODE name.
- Deleting a node with descendants: NestedSet blocks it — delete children first (deepest `lft` first) or delete the subtree.

## Child-row CRUD recipe (Key Result on OKR / KPI Entry on KPI)
- **Create:** load the OKR/KPI node, `node.append("key_results", {..})`, `node.save()`. (Allow-list editable fields exactly as the legacy guard did — e.g. exclude controller-computed `progress_percent`.)
- **Read one:** `frappe.get_doc("VT Item Key Result", row_name)` (child rows are addressable by `name`), or `tree.child_table_rows(node, "key_results")`.
- **Update:** `frappe.db.set_value("VT Item Key Result", row_name, {field: val, ...})` for plain fields; or load parent node, find row, set fields, `node.save()`.
- **Delete:** load parent node, `node.key_results = [r for r in node.key_results if r.name != row_name]`, `node.save()`.
(Child doctypes: `VT Item Key Result`, `VT Item KPI Entry`.)

---

## Per-API migration recipe (Tasks 1–12)
For EACH API the implementer:
1. Reads the API + its test + its entry in `2026-06-07-vt-item-p3-api-map.json` (`reads[]`, `writes_creates[]`, `calls_services[]`).
2. Replaces direct legacy reads with `tree.*`; replaces creates/updates/deletes per the create-node / child-row recipes; applies field renames. Leaves calls to already-migrated services untouched.
3. Rewrites the API's test to SEED `VT Item` nodes/child rows and assert the SAME endpoint behavior/response shape. Pure-function tests (grouping/helpers) usually need no change.
4. RED → GREEN: `docker exec frappe-backend-1 bench --site task.localhost run-tests --module <test_module from map>` — MUST pass.
5. Keep behavior + response shape identical; HTTP entry stays ≤ thin (logic already in services/controller). Commit `refactor(item): migrasi <api> ke VT Item tree`.

### Task table (full per-API detail in the map JSON)
| # | API | Cx | W | test module |
|---|---|---|---|---|
| 1 | task/api/sprints.py | S | | test_sprints |
| 2 | task/api/okr.py | S | | test_okr |
| 3 | brand/api/brand_okr_mutations.py | S | W | test_brand_okr_mutations |
| 4 | task/api/my_work_mutations.py | S | W | test_my_work_mutations |
| 5 | task/api/board_mutations.py | M | W | test_board_mutations |
| 6 | brand/api/brand_okr.py | M | | test_brand_okr |
| 7 | task/api/my_work.py | M | W | test_my_work |
| 8 | task/api/onboarding.py | M | W | test_onboarding |
| 9 | task/api/portal_worksheet.py | M | W | test_portal_worksheet |
| 10 | brand/api/portal_brands.py | M | W | test_portal_brands |
| 11 | task/api/portal_projects.py | M | W | test_portal_projects |
| 12 | task/api/dashboard.py | M | | test_dashboard |

Order: simplest first; the two God-files (`portal_projects` 578 LOC, `dashboard` 1161 LOC) last. Each task = implementer + spec review + quality review.

---

## Self-Review
- **Spec coverage:** spec §7 "APIs (13)" → Tasks 1–12 (the 12 hierarchy APIs; non-hierarchy api modules out of scope) ✓.
- **Ambiguity killed:** cardinal rule states APIs use VT Item exclusively (no dual-write) — resolves the map's brand_okr_mutations uncertainty ✓.
- **Writes covered:** create-node + child-row recipes with exact code ✓.
- **Known intermediate breakage:** hooks.py still wires legacy events; live legacy data invisible to migrated APIs until P4 — documented ✓.

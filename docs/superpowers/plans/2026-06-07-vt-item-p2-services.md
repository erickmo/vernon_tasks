# VT Item — P2: Services Layer Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Migrate all 22 `task/services/*` modules to read the unified `VT Item` tree instead of the legacy doctypes (Objective, Key Result, KPI Definition, KPI Entry, VT Project, VT Sprint, VT Task), via a shared tree-query foundation.

**Architecture:** A new read-only foundation module `task/services/vt_item_tree.py` exposes tree primitives (typed node queries, direct children, nested-set descendants, ancestor-of-type walk, child-table rows). Each service swaps its legacy `frappe.get_all("VT Task", {project,sprint,...})` flat-field queries for these primitives. Field names are PRESERVED on VT Item nodes (estimated_minutes, base_points, percent_done, kanban_status, health_score, …), so only the *relationship* access changes (flat field → tree relation).

**Intermediate state (accepted):** P2 is additive at the data-model level but the app is NOT functional end-to-end until P3 (APIs) + P4 (pages + legacy drop + reseed) land — legacy records still hold the live data. Each migrated service + its test file is GREEN in isolation (tests seed VT Item nodes). This is acceptable: fresh-start, dev-only, full-rewrite already approved.

**Tech Stack:** Frappe Python, nested-set (`lft`/`rgt`), `FrappeTestCase`. Bench in docker: `docker exec frappe-backend-1 bench --site task.localhost <cmd>`.

**Inputs:**
- Spec: `docs/superpowers/specs/2026-06-07-vt-item-unified-hierarchy-design.html`
- Per-service query map (current → tree equivalent, per file): `docs/superpowers/plans/2026-06-07-vt-item-p2-service-map.json` — the authoritative per-service migration spec; each service task reads its entry.

---

## Relationship mapping (legacy → VT Item tree)

| Legacy access | VT Item equivalent | Helper |
|---|---|---|
| `VT Task.project == P` | Task-nodes that are nested-set descendants of project-node P | `descendants(P, "Task")` |
| `VT Task.sprint == S` | Task-nodes whose parent is sprint-node S | `children(S, "Task")` |
| `VT Sprint.project == P` | Sprint-nodes whose parent is project-node P | `children(P, "Sprint")` |
| `VT Project.objective == O` | Project-nodes whose parent is OKR-node O | `children(O, "Project")` |
| a Task's project | nearest Project ancestor | `project_of(task)` |
| `Key Result WHERE objective == O` | child rows on OKR node O | `child_table_rows(O, "key_results")` |
| `KPI Entry WHERE kpi_definition == K` | child rows on KPI node K | `child_table_rows(K, "kpi_entries")` |
| all projects / all OKRs | typed node query | `nodes("Project")` / `nodes("OKR")` |

Field renames to apply inside services: `objective_owner` → `owner_user`; Objective/Project `status` → `health_status`; Sprint `status` → `sprint_state`; `VT Task.sprint` filter → parent relation; everything else keeps its name.

---

## Task 1: Foundation — `vt_item_tree.py`

**Files:**
- Create: `vernon_tasks/task/services/vt_item_tree.py`
- Test: `vernon_tasks/task/services/test_vt_item_tree.py`

- [ ] **Step 1: Write the failing tests**

`vernon_tasks/task/services/test_vt_item_tree.py`:

```python
"""Tests for the VT Item tree query foundation (P2).

Spec: docs/superpowers/specs/2026-06-07-vt-item-unified-hierarchy-design.html
"""
import frappe
from frappe.tests.utils import FrappeTestCase

from vernon_tasks.task.services import vt_item_tree as tree


def _mk(node_type, title, parent=None, **kw):
	doc = frappe.get_doc({"doctype": "VT Item", "node_type": node_type,
		"title": title, "parent_vt_item": parent, **kw})
	doc.insert(ignore_permissions=True)
	return doc


class TestVTItemTree(FrappeTestCase):
	def setUp(self):
		self.okr = _mk("OKR", "P2 OKR")
		self.proj = _mk("Project", "P2 Proj", parent=self.okr.name)
		self.sprint = _mk("Sprint", "P2 Sprint", parent=self.proj.name)
		self.t1 = _mk("Task", "P2 T1", parent=self.sprint.name, actual_minutes=30)
		self.t2 = _mk("Task", "P2 T2", parent=self.proj.name, actual_minutes=10)  # backlog skip

	def test_nodes_typed(self):
		names = [n.name for n in tree.nodes("OKR")]
		self.assertIn(self.okr.name, names)

	def test_children_typed(self):
		kids = [c.name for c in tree.children(self.proj.name, "Sprint")]
		self.assertEqual(kids, [self.sprint.name])

	def test_descendants_spans_skips(self):
		# both the sprint's task AND the backlog task (direct under project)
		tasks = {d.name for d in tree.descendants(self.proj.name, "Task")}
		self.assertEqual(tasks, {self.t1.name, self.t2.name})

	def test_project_of_walks_ancestors(self):
		self.assertEqual(tree.project_of(self.t1.name), self.proj.name)
		self.assertEqual(tree.project_of(self.sprint.name), self.proj.name)

	def test_ancestor_of_type_none_when_absent(self):
		self.assertIsNone(tree.ancestor_of_type(self.okr.name, "Project"))

	def test_child_table_rows(self):
		self.okr.append("key_results", {"metric": "M", "target_value": 5})
		self.okr.save(ignore_permissions=True)
		rows = tree.child_table_rows(self.okr.name, "key_results")
		self.assertEqual(len(rows), 1)
		self.assertEqual(rows[0]["metric"], "M")
```

- [ ] **Step 2: Run, verify it fails** (module missing):
`docker exec frappe-backend-1 bench --site task.localhost run-tests --module vernon_tasks.task.services.test_vt_item_tree`
Expected: FAIL (ImportError / module not found).

- [ ] **Step 3: Write the foundation module**

`vernon_tasks/task/services/vt_item_tree.py`:

```python
"""VT Item tree query helpers — read primitives for the unified hierarchy.

P2 foundation. Services consume these instead of querying legacy doctypes
directly: they translate flat legacy relations (VT Task.project,
VT Sprint.project, Key Result.objective, …) into VT Item tree relations
(nested-set descendants, parent-chain walks, child tables).

Layer: pure read-only query utility (no business logic, no writes); reused by
many services, hence a shared module rather than a controller method.

Source of truth:
docs/superpowers/specs/2026-06-07-vt-item-unified-hierarchy-design.html
"""
import frappe

DOCTYPE = "VT Item"


def nodes(node_type, filters=None, fields=None, order_by=None, limit=None):
	"""All VT Item rows of a given node_type (e.g. every Project node)."""
	merged = dict(filters or {})
	merged["node_type"] = node_type
	return frappe.get_all(DOCTYPE, filters=merged, fields=fields or ["name"],
		order_by=order_by, limit=limit)


def children(parent, node_type=None, filters=None, fields=None,
		order_by=None, limit=None):
	"""Direct children of `parent` (parent_vt_item=parent), optionally typed."""
	merged = dict(filters or {})
	merged["parent_vt_item"] = parent
	if node_type:
		merged["node_type"] = node_type
	return frappe.get_all(DOCTYPE, filters=merged, fields=fields or ["name"],
		order_by=order_by, limit=limit)


def descendants(node, node_type=None, filters=None, fields=None, order_by=None):
	"""All descendants of `node` via nested set (lft/rgt within node's range,
	excluding node itself), optionally typed. Spans skipped levels — e.g. a
	Project's Tasks whether or not they sit under a Sprint."""
	bounds = frappe.db.get_value(DOCTYPE, node, ["lft", "rgt"], as_dict=True)
	if not bounds:
		return []
	merged = dict(filters or {})
	merged["lft"] = [">", bounds.lft]
	merged["rgt"] = ["<", bounds.rgt]
	if node_type:
		merged["node_type"] = node_type
	return frappe.get_all(DOCTYPE, filters=merged, fields=fields or ["name"],
		order_by=order_by)


def ancestor_of_type(node, node_type):
	"""Walk the parent chain from `node` to the nearest ancestor whose
	node_type matches. Returns its name, or None."""
	current = frappe.db.get_value(DOCTYPE, node, "parent_vt_item")
	while current:
		row = frappe.db.get_value(
			DOCTYPE, current, ["node_type", "parent_vt_item"], as_dict=True
		)
		if not row:
			return None
		if row.node_type == node_type:
			return current
		current = row.parent_vt_item
	return None


def project_of(node):
	"""Nearest Project ancestor of a Sprint/Task node (or None)."""
	return ancestor_of_type(node, "Project")


def child_table_rows(node, table_fieldname):
	"""Child-table rows of a node as dicts (e.g. 'key_results' on an OKR,
	'kpi_entries' on a KPI)."""
	doc = frappe.get_doc(DOCTYPE, node)
	return [row.as_dict() for row in (doc.get(table_fieldname) or [])]
```

- [ ] **Step 4: Run, verify pass** (6 tests):
`docker exec frappe-backend-1 bench --site task.localhost run-tests --module vernon_tasks.task.services.test_vt_item_tree`
Expected: PASS (6).

- [ ] **Step 5: Commit**
```bash
git add vernon_tasks/task/services/vt_item_tree.py vernon_tasks/task/services/test_vt_item_tree.py
git commit -m "feat(item): fondasi vt_item_tree — primitive query tree untuk P2"
```

---

## Per-service migration recipe (Tasks 2–23)

For EACH service, the implementer:
1. Reads the service file + its `test_*` sibling + the service's entry in `2026-06-07-vt-item-p2-service-map.json` (the `queries[].current → tree_equivalent`, `fields_referenced`, `helper_primitives_needed`).
2. Replaces every legacy query with `vt_item_tree` helpers (per the Relationship mapping table). Apply field renames (`objective_owner`→`owner_user`, Objective/Project `status`→`health_status`, Sprint `status`→`sprint_state`).
3. Rewrites the service's `test_*` file to seed VT Item nodes (using a local `_mk` helper like Task 1's) instead of legacy docs, asserting the SAME behavior/outputs as before.
4. RED (test fails against new data shape) → GREEN (service rewritten) → commit `refactor(item): migrasi <service> ke VT Item tree`.
5. Keep behavior identical; do not add features (YAGNI). Functions stay <40 lines; reuse `vt_item_tree`, do not re-implement tree walks inline.

**Order (simplest first):** okr_rollup_service, velocity_service, reports/team_throughput, reports/project_health, threshold, kpi_trend_service, reports/okr_pacing, streak_service, reports/risk_log, push_sender → then M: velocity/personal_velocity, leaderboard_service, risk_evaluator, forecast_service, burndown_service, reports/project_burndown_archive, scheduling_engine, project_task_grouper, point_calculator (writer), worksheet_aggregator, health_score_service, dashboard_aggregator (largest, last).

**Writers (extra care):** `point_calculator.py` + `push_sender.py` mutate docs — they must write to VT Item Task nodes (`frappe.db.set_value("VT Item", task_node, ...)`), and Task Point Log references stay as-is (Task Point Log is not part of the hierarchy merge).

### Task table (one task each; full per-service detail in the map JSON)

| # | Service | Cx | W | Legacy doctypes |
|---|---|---|---|---|
| 2 | okr_rollup_service | S | | Objective, Key Result |
| 3 | velocity_service | S | | VT Task, VT Sprint |
| 4 | reports/team_throughput | S | | VT Task |
| 5 | reports/project_health | S | | VT Project |
| 6 | threshold | S | | VT Project, VT Settings |
| 7 | kpi_trend_service | S | | KPI Definition, KPI Entry |
| 8 | reports/okr_pacing | S | | Objective, Key Result |
| 9 | streak_service | S | | VT Sprint, VT Task |
| 10 | reports/risk_log | S | | Risk Event, VT Project |
| 11 | push_sender | S | W | (resolves task nodes) |
| 12 | personal_velocity_service | M | | VT Task, VT Sprint, VT Project |
| 13 | leaderboard_service | M | | VT Task, VT Project, VT Sprint |
| 14 | risk_evaluator | M | | VT Task, VT Project, VT Sprint |
| 15 | forecast_service | M | | VT Task, VT Sprint, VT Project |
| 16 | burndown_service | M | | VT Sprint, VT Task, VT Project |
| 17 | reports/project_burndown_archive | M | | VT Sprint, VT Project, VT Task |
| 18 | scheduling_engine | M | | VT Task, Task Schedule Entry |
| 19 | project_task_grouper | M | | VT Task, VT Project, Key Result |
| 20 | point_calculator | M | W | VT Task, VT Project, VT Settings, Task Point Log |
| 21 | worksheet_aggregator | M | | VT Task, VT Project, Key Result, Task Schedule Entry, Work Profile |
| 22 | health_score_service | M | | Objective, Key Result, VT Project, VT Sprint, VT Task |
| 23 | dashboard_aggregator | M | | VT Project, VT Sprint, VT Task, Objective, Key Result, Project Team Member, Task Point Log |

Each task = its own implementer + spec review + quality review (subagent-driven).

---

## Self-Review
- **Spec coverage:** spec §7 "Services (~22)" → Tasks 2–23 ✓; foundation enables tree access → Task 1 ✓.
- **Placeholders:** Task 1 has full code. Tasks 2–23 use a recipe + per-service map JSON (full current code lives in each file; pasting 22 rewrites is impractical and the map provides the exact per-query translation). This is the correct altitude for a repetitive migration; not a placeholder.
- **Type consistency:** helper names (`nodes`/`children`/`descendants`/`ancestor_of_type`/`project_of`/`child_table_rows`) consistent between Task 1 code, the mapping table, and the recipe.
- **Known intermediate breakage:** documented — app not functional end-to-end until P3/P4; per-service unit tests stay green.

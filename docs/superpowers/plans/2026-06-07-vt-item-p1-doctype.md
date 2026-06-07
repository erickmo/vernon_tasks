# VT Item — P1: Unified Doctype + Tree Controller — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the `VT Item` Frappe nested-set doctype (discriminated by `node_type` = OKR/KPI/Project/Sprint/Task) with autoname, parent-type validation, brand inheritance, and percent_done rollup — the data-model foundation for the unified OKR→Task tree.

**Architecture:** One fat doctype holding the union of all five legacy field groups, shown by type via `depends_on`. Tree via Frappe `is_tree:1` + `NestedSet` controller. Key Result and KPI Entry become child tables of `VT Item`. **P1 is additive** — legacy doctypes (Objective, VT Project, VT Sprint, VT Task, KPI Definition) are left in place so the app keeps loading; the legacy-drop patch + consumer rewrites land in later phases (P2–P4). Smoke scope for P1 excludes OKR/KPI standalone APIs, which break when Key Result/KPI Entry become child tables — those are rewritten in P3.

**Tech Stack:** Frappe Framework (Python), `frappe.utils.nestedset.NestedSet`, `frappe.model.naming.make_autoname`, `FrappeTestCase`. Bench runs inside docker: `docker exec frappe-backend-1 bench --site task.localhost <cmd>`.

**Source spec:** `docs/superpowers/specs/2026-06-07-vt-item-unified-hierarchy-design.html`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `okr/doctype/key_result/key_result.json` | Convert to child table (`istable:1`), drop `objective` link + `autoname` |
| `okr/doctype/kpi_entry/kpi_entry.json` | Convert to child table (`istable:1`), drop `kpi_definition`/`project` links + `autoname` |
| `task/doctype/vt_item/vt_item.json` | The unified tree doctype — all field groups, `is_tree:1`, nested-set fields |
| `task/doctype/vt_item/vt_item.py` | Controller — `NestedSet` subclass: autoname, validate (parent type), brand inherit, rollup |
| `task/doctype/vt_item/__init__.py` | Empty package marker |
| `task/doctype/vt_item/test_vt_item.py` | Unit tests — naming, validation, skips, brand, rollup, children |
| `setup/seed_vt_item_demo.py` | Minimal idempotent OKR→Task chain seeder (console helper, eyeball tree) |

---

## Task 1: Convert Key Result + KPI Entry to child tables

**Files:**
- Modify: `vernon_tasks/okr/doctype/key_result/key_result.json`
- Modify: `vernon_tasks/okr/doctype/kpi_entry/kpi_entry.json`

A Frappe `Table` field requires its target doctype to be `istable:1`. Both must shed their standalone identity (autoname + parent links) to hang under a `VT Item` node.

- [ ] **Step 1: Rewrite `key_result.json` as a child table**

Replace the whole file with:

```json
{
  "actions": [],
  "creation": "2026-05-07 00:00:00.000000",
  "doctype": "DocType",
  "engine": "InnoDB",
  "istable": 1,
  "field_order": ["metric","column_break_1","target_value","current_value","unit","progress_percent","confidence","confidence_last_week"],
  "fields": [
    {"fieldname": "metric", "fieldtype": "Data", "label": "Metric", "reqd": 1, "in_list_view": 1},
    {"fieldname": "column_break_1", "fieldtype": "Column Break"},
    {"default": "0", "fieldname": "target_value", "fieldtype": "Float", "label": "Target Value", "reqd": 1, "in_list_view": 1},
    {"default": "0", "fieldname": "current_value", "fieldtype": "Float", "label": "Current Value", "in_list_view": 1},
    {"fieldname": "unit", "fieldtype": "Data", "label": "Unit", "description": "e.g. %, users, revenue"},
    {"fieldname": "progress_percent", "fieldtype": "Percent", "label": "Progress", "read_only": 1, "in_list_view": 1},
    {"fieldname": "confidence", "label": "Confidence", "fieldtype": "Percent", "default": 0, "description": "Current confidence 0-100"},
    {"fieldname": "confidence_last_week", "label": "Confidence (Last Week)", "fieldtype": "Percent", "default": 0}
  ],
  "modified": "2026-06-07 00:00:00.000000",
  "modified_by": "Administrator",
  "module": "Okr",
  "name": "Key Result",
  "owner": "Administrator",
  "permissions": [],
  "sort_field": "modified",
  "sort_order": "DESC",
  "track_changes": 1
}
```

- [ ] **Step 2: Rewrite `kpi_entry.json` as a child table**

Replace the whole file with:

```json
{
  "actions": [],
  "creation": "2026-05-07 00:00:00.000000",
  "doctype": "DocType",
  "engine": "InnoDB",
  "istable": 1,
  "field_order": ["date","column_break_1","value","notes"],
  "fields": [
    {"fieldname": "date", "fieldtype": "Date", "label": "Date", "reqd": 1, "in_list_view": 1},
    {"fieldname": "column_break_1", "fieldtype": "Column Break"},
    {"fieldname": "value", "fieldtype": "Float", "label": "Value", "reqd": 1, "in_list_view": 1},
    {"fieldname": "notes", "fieldtype": "Small Text", "label": "Notes"}
  ],
  "modified": "2026-06-07 00:00:00.000000",
  "modified_by": "Administrator",
  "module": "Okr",
  "name": "KPI Entry",
  "owner": "Administrator",
  "permissions": [],
  "sort_field": "idx",
  "sort_order": "ASC",
  "track_changes": 0
}
```

- [ ] **Step 3: Commit**

```bash
git add vernon_tasks/okr/doctype/key_result/key_result.json vernon_tasks/okr/doctype/kpi_entry/kpi_entry.json
git commit -m "refactor(okr): jadikan Key Result & KPI Entry child table untuk VT Item"
```

---

## Task 2: Create the `VT Item` doctype JSON

**Files:**
- Create: `vernon_tasks/task/doctype/vt_item/__init__.py`
- Create: `vernon_tasks/task/doctype/vt_item/vt_item.json`

- [ ] **Step 1: Create the package marker**

`vernon_tasks/task/doctype/vt_item/__init__.py` — empty file.

- [ ] **Step 2: Write `vt_item.json`**

`is_tree:1` plus the nested-set fields (`parent_vt_item`, `lft`, `rgt`, `old_parent`, `is_group`). All type-specific fields carry `depends_on: "eval:..."`. Autoname is handled by the controller, so JSON uses `"autoname": "Prompt"` placeholder (overridden by `autoname()`).

```json
{
  "actions": [],
  "creation": "2026-06-07 00:00:00.000000",
  "doctype": "DocType",
  "engine": "InnoDB",
  "is_tree": 1,
  "autoname": "Prompt",
  "naming_rule": "Expression (old style)",
  "field_order": [
    "node_type","title","is_group","parent_vt_item","brand","owner_user","description",
    "percent_done","start_date","end_date",
    "okr_section","period","period_start","period_end","pdca_phase","health_status","key_results",
    "kpi_section","frequency","unit","target_value","allow_negative","formula","kpi_entries",
    "project_section","leader_user","health_score","health_history_json","blocked_days_threshold","slip_pct_threshold","capacity_pct_threshold","team_members","milestones","documentation",
    "sprint_section","goal","actual_velocity","burndown_actual_json","outcome","sprint_state",
    "task_section","kanban_status","kanban_rank","priority","risk_flag","deadline","completion_date","estimated_minutes","actual_minutes","review_estimated_minutes","review_scheduled_date","weight","base_points","earned_points","leader_override_points","override_reason","rejection_note","revision_count","is_recurring","recurring_rule","next_occurrence","dependencies","schedule_entries",
    "nsm_section","lft","rgt","old_parent"
  ],
  "fields": [
    {"fieldname": "node_type", "fieldtype": "Select", "label": "Type", "options": "OKR\nKPI\nProject\nSprint\nTask", "reqd": 1, "in_list_view": 1, "in_standard_filter": 1},
    {"fieldname": "title", "fieldtype": "Data", "label": "Title", "reqd": 1, "in_list_view": 1},
    {"fieldname": "is_group", "fieldtype": "Check", "label": "Is Group", "default": "0"},
    {"fieldname": "parent_vt_item", "fieldtype": "Link", "label": "Parent", "options": "VT Item", "in_list_view": 1},
    {"fieldname": "brand", "fieldtype": "Link", "label": "Brand", "options": "VT Brand"},
    {"fieldname": "owner_user", "fieldtype": "Link", "label": "Owner", "options": "User"},
    {"fieldname": "description", "fieldtype": "Long Text", "label": "Description"},
    {"fieldname": "percent_done", "fieldtype": "Percent", "label": "Percent Done", "read_only": 1},
    {"fieldname": "start_date", "fieldtype": "Date", "label": "Start Date"},
    {"fieldname": "end_date", "fieldtype": "Date", "label": "End Date"},

    {"fieldname": "okr_section", "fieldtype": "Section Break", "label": "OKR", "depends_on": "eval:doc.node_type=='OKR'"},
    {"fieldname": "period", "fieldtype": "Data", "label": "Period", "depends_on": "eval:doc.node_type=='OKR'"},
    {"fieldname": "period_start", "fieldtype": "Date", "label": "Period Start", "depends_on": "eval:doc.node_type=='OKR'"},
    {"fieldname": "period_end", "fieldtype": "Date", "label": "Period End", "depends_on": "eval:doc.node_type=='OKR'"},
    {"fieldname": "pdca_phase", "fieldtype": "Select", "label": "PDCA Phase", "options": "PLAN\nDO\nCHECK\nACT\nCLOSED", "depends_on": "eval:['OKR','Project'].includes(doc.node_type)"},
    {"fieldname": "health_status", "fieldtype": "Select", "label": "Health", "options": "Open\nOn Track\nAt Risk\nClosed", "depends_on": "eval:['OKR','Project'].includes(doc.node_type)"},
    {"fieldname": "key_results", "fieldtype": "Table", "label": "Key Results", "options": "Key Result", "depends_on": "eval:doc.node_type=='OKR'"},

    {"fieldname": "kpi_section", "fieldtype": "Section Break", "label": "KPI", "depends_on": "eval:doc.node_type=='KPI'"},
    {"fieldname": "frequency", "fieldtype": "Select", "label": "Frequency", "options": "Daily\nWeekly\nMonthly", "depends_on": "eval:doc.node_type=='KPI'"},
    {"fieldname": "unit", "fieldtype": "Data", "label": "Unit", "depends_on": "eval:doc.node_type=='KPI'"},
    {"fieldname": "target_value", "fieldtype": "Float", "label": "Target Value", "depends_on": "eval:doc.node_type=='KPI'"},
    {"fieldname": "allow_negative", "fieldtype": "Check", "label": "Allow Negative", "default": "0", "depends_on": "eval:doc.node_type=='KPI'"},
    {"fieldname": "formula", "fieldtype": "Long Text", "label": "Formula", "depends_on": "eval:doc.node_type=='KPI'"},
    {"fieldname": "kpi_entries", "fieldtype": "Table", "label": "KPI Entries", "options": "KPI Entry", "depends_on": "eval:doc.node_type=='KPI'"},

    {"fieldname": "project_section", "fieldtype": "Section Break", "label": "Project", "depends_on": "eval:doc.node_type=='Project'"},
    {"fieldname": "leader_user", "fieldtype": "Link", "label": "Leader", "options": "User", "depends_on": "eval:doc.node_type=='Project'"},
    {"fieldname": "health_score", "fieldtype": "Float", "label": "Health Score", "depends_on": "eval:doc.node_type=='Project'"},
    {"fieldname": "health_history_json", "fieldtype": "Code", "label": "Health History JSON", "depends_on": "eval:doc.node_type=='Project'"},
    {"fieldname": "blocked_days_threshold", "fieldtype": "Int", "label": "Blocked Days Threshold", "depends_on": "eval:doc.node_type=='Project'"},
    {"fieldname": "slip_pct_threshold", "fieldtype": "Percent", "label": "Slip % Threshold", "depends_on": "eval:doc.node_type=='Project'"},
    {"fieldname": "capacity_pct_threshold", "fieldtype": "Percent", "label": "Capacity % Threshold", "depends_on": "eval:doc.node_type=='Project'"},
    {"fieldname": "team_members", "fieldtype": "Table", "label": "Team Members", "options": "Project Team Member", "depends_on": "eval:doc.node_type=='Project'"},
    {"fieldname": "milestones", "fieldtype": "Table", "label": "Milestones", "options": "Project Milestone", "depends_on": "eval:doc.node_type=='Project'"},
    {"fieldname": "documentation", "fieldtype": "Table", "label": "Documentation", "options": "Project Documentation", "depends_on": "eval:doc.node_type=='Project'"},

    {"fieldname": "sprint_section", "fieldtype": "Section Break", "label": "Sprint", "depends_on": "eval:doc.node_type=='Sprint'"},
    {"fieldname": "goal", "fieldtype": "Small Text", "label": "Goal", "depends_on": "eval:doc.node_type=='Sprint'"},
    {"fieldname": "actual_velocity", "fieldtype": "Int", "label": "Actual Velocity", "depends_on": "eval:doc.node_type=='Sprint'"},
    {"fieldname": "burndown_actual_json", "fieldtype": "Code", "label": "Burndown JSON", "depends_on": "eval:doc.node_type=='Sprint'"},
    {"fieldname": "outcome", "fieldtype": "Small Text", "label": "Outcome", "depends_on": "eval:doc.node_type=='Sprint'"},
    {"fieldname": "sprint_state", "fieldtype": "Select", "label": "Sprint State", "options": "Planning\nActive\nReview\nClosed", "depends_on": "eval:doc.node_type=='Sprint'"},

    {"fieldname": "task_section", "fieldtype": "Section Break", "label": "Task", "depends_on": "eval:doc.node_type=='Task'"},
    {"fieldname": "kanban_status", "fieldtype": "Select", "label": "Kanban Status", "options": "Backlog\nScheduled\nIn Progress\nIn Review\nRevision\nDone\nBlocked", "depends_on": "eval:doc.node_type=='Task'"},
    {"fieldname": "kanban_rank", "fieldtype": "Float", "label": "Kanban Rank", "depends_on": "eval:doc.node_type=='Task'"},
    {"fieldname": "priority", "fieldtype": "Select", "label": "Priority", "options": "Low\nMedium\nHigh\nCritical", "depends_on": "eval:doc.node_type=='Task'"},
    {"fieldname": "risk_flag", "fieldtype": "Select", "label": "Risk Flag", "options": "\nlate\nblocked\nscope-drift", "depends_on": "eval:doc.node_type=='Task'"},
    {"fieldname": "deadline", "fieldtype": "Date", "label": "Deadline", "depends_on": "eval:doc.node_type=='Task'"},
    {"fieldname": "completion_date", "fieldtype": "Date", "label": "Completion Date", "depends_on": "eval:doc.node_type=='Task'"},
    {"fieldname": "estimated_minutes", "fieldtype": "Int", "label": "Estimated Minutes", "depends_on": "eval:doc.node_type=='Task'"},
    {"fieldname": "actual_minutes", "fieldtype": "Int", "label": "Actual Minutes", "depends_on": "eval:doc.node_type=='Task'"},
    {"fieldname": "review_estimated_minutes", "fieldtype": "Int", "label": "Review Estimated Minutes", "depends_on": "eval:doc.node_type=='Task'"},
    {"fieldname": "review_scheduled_date", "fieldtype": "Date", "label": "Review Scheduled Date", "depends_on": "eval:doc.node_type=='Task'"},
    {"fieldname": "weight", "fieldtype": "Float", "label": "Weight", "depends_on": "eval:doc.node_type=='Task'"},
    {"fieldname": "base_points", "fieldtype": "Int", "label": "Base Points", "depends_on": "eval:doc.node_type=='Task'"},
    {"fieldname": "earned_points", "fieldtype": "Int", "label": "Earned Points", "depends_on": "eval:doc.node_type=='Task'"},
    {"fieldname": "leader_override_points", "fieldtype": "Int", "label": "Leader Override Points", "depends_on": "eval:doc.node_type=='Task'"},
    {"fieldname": "override_reason", "fieldtype": "Small Text", "label": "Override Reason", "depends_on": "eval:doc.node_type=='Task'"},
    {"fieldname": "rejection_note", "fieldtype": "Small Text", "label": "Rejection Note", "depends_on": "eval:doc.node_type=='Task'"},
    {"fieldname": "revision_count", "fieldtype": "Int", "label": "Revision Count", "depends_on": "eval:doc.node_type=='Task'"},
    {"fieldname": "is_recurring", "fieldtype": "Check", "label": "Is Recurring", "default": "0", "depends_on": "eval:doc.node_type=='Task'"},
    {"fieldname": "recurring_rule", "fieldtype": "Link", "label": "Recurring Rule", "options": "Recurring Rule", "depends_on": "eval:doc.node_type=='Task'"},
    {"fieldname": "next_occurrence", "fieldtype": "Date", "label": "Next Occurrence", "depends_on": "eval:doc.node_type=='Task'"},
    {"fieldname": "dependencies", "fieldtype": "Table", "label": "Dependencies", "options": "Task Dependency", "depends_on": "eval:doc.node_type=='Task'"},
    {"fieldname": "schedule_entries", "fieldtype": "Table", "label": "Schedule Entries", "options": "Task Schedule Entry", "depends_on": "eval:doc.node_type=='Task'"},

    {"fieldname": "nsm_section", "fieldtype": "Section Break", "label": "Tree (system)", "collapsible": 1},
    {"fieldname": "lft", "fieldtype": "Int", "label": "lft", "read_only": 1, "hidden": 1},
    {"fieldname": "rgt", "fieldtype": "Int", "label": "rgt", "read_only": 1, "hidden": 1},
    {"fieldname": "old_parent", "fieldtype": "Data", "label": "old_parent", "read_only": 1, "hidden": 1}
  ],
  "modified": "2026-06-07 00:00:00.000000",
  "modified_by": "Administrator",
  "module": "Task",
  "name": "VT Item",
  "owner": "Administrator",
  "permissions": [
    {"create": 1, "delete": 1, "read": 1, "report": 1, "role": "VT Manager", "write": 1},
    {"create": 1, "read": 1, "report": 1, "role": "VT Leader", "write": 1},
    {"read": 1, "role": "VT Member"}
  ],
  "sort_field": "lft",
  "sort_order": "ASC",
  "track_changes": 1
}
```

- [ ] **Step 3: Migrate so the table is created**

Run: `docker exec frappe-backend-1 bench --site task.localhost migrate`
Expected: completes without error; `tabVT Item` created. (Frappe dev-mode may re-export the JSON — that is fine.)

- [ ] **Step 4: Commit**

```bash
git add vernon_tasks/task/doctype/vt_item/__init__.py vernon_tasks/task/doctype/vt_item/vt_item.json
git commit -m "feat(item): tambah doctype tree VT Item (fat node, depends_on per type)"
```

---

## Task 3: Controller — NestedSet + per-type autoname

**Files:**
- Create: `vernon_tasks/task/doctype/vt_item/vt_item.py`
- Test: `vernon_tasks/task/doctype/vt_item/test_vt_item.py`

- [ ] **Step 1: Write the failing test for autoname prefixes**

`vernon_tasks/task/doctype/vt_item/test_vt_item.py`:

```python
"""VT Item controller tests — unified hierarchy (P1).

Covers: per-type autoname, parent-type validation (strict + skips),
brand inheritance, percent_done rollup. Spec:
docs/superpowers/specs/2026-06-07-vt-item-unified-hierarchy-design.html
"""
import frappe
from frappe.tests.utils import FrappeTestCase


def _make(node_type, title, parent=None, **kw):
	doc = frappe.get_doc(
		{"doctype": "VT Item", "node_type": node_type, "title": title,
		 "parent_vt_item": parent, **kw}
	)
	doc.insert(ignore_permissions=True)
	return doc


class TestVTItem(FrappeTestCase):
	def test_autoname_prefix_per_type(self):
		# PRD: VT Item P1 | spec §3.3
		okr = _make("OKR", "Grow revenue")
		self.assertTrue(okr.name.startswith("OKR-"))
		proj = _make("Project", "Website", parent=okr.name)
		self.assertTrue(proj.name.startswith("PROJ-"))
		sp = _make("Sprint", "Sprint 1", parent=proj.name)
		self.assertTrue(sp.name.startswith("SP-"))
		task = _make("Task", "Build hero", parent=sp.name)
		self.assertTrue(task.name.startswith("TASK-"))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker exec frappe-backend-1 bench --site task.localhost run-tests --module vernon_tasks.task.doctype.vt_item.test_vt_item`
Expected: FAIL — autoname falls back to Prompt / missing-name error (controller `autoname` not defined).

- [ ] **Step 3: Write the controller with NestedSet + autoname**

`vernon_tasks/task/doctype/vt_item/vt_item.py`:

```python
"""VT Item controller — unified OKR→Task hierarchy.

Layer: Frappe DocType controller (Layer 2, Priority 1 per vernon-dev
Frappe Hooks-First rule). One nested-set tree discriminated by
`node_type`; owns naming, parent-type invariants, brand inheritance,
and percent_done rollup.

Source of truth:
docs/superpowers/specs/2026-06-07-vt-item-unified-hierarchy-design.html
"""
import frappe
from frappe import _
from frappe.model.naming import make_autoname
from frappe.utils.nestedset import NestedSet

# Per-type naming series. Single source for the `autoname()` switch.
NODE_NAMING = {
	"OKR": "OKR-.YYYY.-.#####",
	"KPI": "KPI-.YYYY.-.#####",
	"Project": "PROJ-.YYYY.-.#####",
	"Sprint": "SP-.YYYY.-.#####",
	"Task": "TASK-.YYYY.-.#####",
}

# Legal parent node_type per child node_type. `None` = may sit at root.
# Encodes "strict + flexible skips" (spec §4): OKR/Project may be roots,
# KPI may be root or under OKR, Task may skip Sprint (backlog).
ALLOWED_PARENTS = {
	"OKR": {None},
	"KPI": {None, "OKR"},
	"Project": {None, "OKR"},
	"Sprint": {"Project"},
	"Task": {"Project", "Sprint"},
}


class VTItem(NestedSet):
	"""Single node in the OKR→Task tree, typed by `node_type`."""

	# NestedSet maintains lft/rgt against this parent Link field.
	nsm_parent_field = "parent_vt_item"

	def autoname(self) -> None:
		"""Name by type-specific series (spec §3.3)."""
		series = NODE_NAMING.get(self.node_type)
		if not series:
			frappe.throw(_("Unknown node_type: {0}").format(self.node_type))
		self.name = make_autoname(series, doc=self)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker exec frappe-backend-1 bench --site task.localhost run-tests --module vernon_tasks.task.doctype.vt_item.test_vt_item`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add vernon_tasks/task/doctype/vt_item/vt_item.py vernon_tasks/task/doctype/vt_item/test_vt_item.py
git commit -m "feat(item): controller VT Item — NestedSet + autoname per type"
```

---

## Task 4: Parent-type validation (strict + skips)

**Files:**
- Modify: `vernon_tasks/task/doctype/vt_item/vt_item.py`
- Test: `vernon_tasks/task/doctype/vt_item/test_vt_item.py`

- [ ] **Step 1: Add failing tests for legal + illegal nesting**

Append to `class TestVTItem`:

```python
	def test_illegal_parent_type_rejected(self):
		# spec §4 — Project under Task is illegal
		okr = _make("OKR", "O1")
		proj = _make("Project", "P1", parent=okr.name)
		sp = _make("Sprint", "S1", parent=proj.name)
		task = _make("Task", "T1", parent=sp.name)
		with self.assertRaises(frappe.ValidationError):
			_make("Project", "bad", parent=task.name)

	def test_skip_levels_allowed(self):
		# spec §4 — Task directly under Project (backlog), Project at root
		proj = _make("Project", "Standalone")  # no OKR parent
		task = _make("Task", "Backlog item", parent=proj.name)
		self.assertEqual(task.parent_vt_item, proj.name)

	def test_kpi_root_and_under_okr(self):
		# spec §4 — KPI may be top-tier or under an OKR
		kpi_root = _make("KPI", "NPS")
		self.assertIsNone(kpi_root.parent_vt_item)
		okr = _make("OKR", "O2")
		kpi_child = _make("KPI", "Churn", parent=okr.name)
		self.assertEqual(kpi_child.parent_vt_item, okr.name)
```

- [ ] **Step 2: Run tests to verify the illegal-parent test fails**

Run: `docker exec frappe-backend-1 bench --site task.localhost run-tests --module vernon_tasks.task.doctype.vt_item.test_vt_item`
Expected: `test_illegal_parent_type_rejected` FAILS (no validation yet); the others may pass incidentally.

- [ ] **Step 3: Add `validate` + parent-type check to the controller**

Add to `class VTItem` (after `autoname`):

```python
	def validate(self) -> None:
		"""Field + tree invariants on every save."""
		self._validate_parent_type()
		self._inherit_brand()

	def _validate_parent_type(self) -> None:
		"""Reject illegal parent node_type per ALLOWED_PARENTS (spec §4)."""
		parent_type = None
		if self.parent_vt_item:
			parent_type = frappe.db.get_value(
				"VT Item", self.parent_vt_item, "node_type"
			)
		allowed = ALLOWED_PARENTS.get(self.node_type, set())
		if parent_type not in allowed:
			frappe.throw(
				_("A {0} cannot be placed under a {1}.").format(
					self.node_type, parent_type or _("root")
				)
			)
```

(`_inherit_brand` is added in Task 5; define a temporary no-op now so `validate` runs.)

Add this stub method for now:

```python
	def _inherit_brand(self) -> None:
		"""Brand inheritance — implemented in Task 5."""
		return
```

- [ ] **Step 4: Run tests to verify pass**

Run: `docker exec frappe-backend-1 bench --site task.localhost run-tests --module vernon_tasks.task.doctype.vt_item.test_vt_item`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add vernon_tasks/task/doctype/vt_item/vt_item.py vernon_tasks/task/doctype/vt_item/test_vt_item.py
git commit -m "feat(item): validasi tipe parent (strict + skip level)"
```

---

## Task 5: Brand inheritance

**Files:**
- Modify: `vernon_tasks/task/doctype/vt_item/vt_item.py`
- Test: `vernon_tasks/task/doctype/vt_item/test_vt_item.py`

Requires a `VT Brand` to exist. The test creates one if absent.

- [ ] **Step 1: Add failing test**

Append to `class TestVTItem`:

```python
	def _ensure_brand(self):
		name = "Test Brand VT Item"
		if not frappe.db.exists("VT Brand", name):
			frappe.get_doc(
				{"doctype": "VT Brand", "brand_name": name}
			).insert(ignore_permissions=True)
		return name

	def test_brand_inherits_from_ancestor(self):
		# spec §4 — blank brand resolves from nearest ancestor
		brand = self._ensure_brand()
		okr = _make("OKR", "Branded OKR", brand=brand)
		proj = _make("Project", "Child proj", parent=okr.name)  # no brand set
		self.assertEqual(proj.brand, brand)
```

Note: confirm the brand title field — check `vernon_tasks/brand/doctype/vt_brand/vt_brand.json` for the actual fieldname (`brand_name` vs `title`) before running; adjust the dict key if needed.

- [ ] **Step 2: Run test to verify it fails**

Run: `docker exec frappe-backend-1 bench --site task.localhost run-tests --module vernon_tasks.task.doctype.vt_item.test_vt_item`
Expected: `test_brand_inherits_from_ancestor` FAILS (`proj.brand` is empty — stub no-op).

- [ ] **Step 3: Implement `_inherit_brand`**

Replace the stub `_inherit_brand` with:

```python
	def _inherit_brand(self) -> None:
		"""Fill blank `brand` from the nearest ancestor that has one (spec §4)."""
		if self.brand or not self.parent_vt_item:
			return
		ancestor = self.parent_vt_item
		# Walk up the parent chain; first non-empty brand wins.
		while ancestor:
			brand, parent = frappe.db.get_value(
				"VT Item", ancestor, ["brand", "parent_vt_item"]
			) or (None, None)
			if brand:
				self.brand = brand
				return
			ancestor = parent
```

- [ ] **Step 4: Run test to verify pass**

Run: `docker exec frappe-backend-1 bench --site task.localhost run-tests --module vernon_tasks.task.doctype.vt_item.test_vt_item`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add vernon_tasks/task/doctype/vt_item/vt_item.py vernon_tasks/task/doctype/vt_item/test_vt_item.py
git commit -m "feat(item): warisi brand dari ancestor terdekat"
```

---

## Task 6: percent_done rollup

**Files:**
- Modify: `vernon_tasks/task/doctype/vt_item/vt_item.py`
- Test: `vernon_tasks/task/doctype/vt_item/test_vt_item.py`

- [ ] **Step 1: Add failing test**

Append to `class TestVTItem`:

```python
	def test_percent_done_rolls_up(self):
		# spec §5 — child percent_done propagates to ancestors (mean)
		okr = _make("OKR", "Rollup OKR")
		proj = _make("Project", "Rollup proj", parent=okr.name)
		_make("Task", "t1", parent=proj.name, percent_done=100)
		_make("Task", "t2", parent=proj.name, percent_done=0)
		proj.reload()
		self.assertEqual(proj.percent_done, 50)
		okr.reload()
		self.assertEqual(okr.percent_done, 50)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker exec frappe-backend-1 bench --site task.localhost run-tests --module vernon_tasks.task.doctype.vt_item.test_vt_item`
Expected: `test_percent_done_rolls_up` FAILS (`proj.percent_done` still 0).

- [ ] **Step 3: Add rollup on `on_update`**

Add to `class VTItem`:

```python
	def on_update(self) -> None:
		"""Maintain nested set, then roll percent_done up the chain."""
		super().on_update()  # NestedSet keeps lft/rgt consistent
		self._rollup_ancestors()

	def _rollup_ancestors(self) -> None:
		"""Set each ancestor's percent_done to the mean of its direct
		children (spec §5). Uses set_value (no save) to avoid recursion."""
		ancestor = self.parent_vt_item
		while ancestor:
			children = frappe.get_all(
				"VT Item",
				filters={"parent_vt_item": ancestor},
				pluck="percent_done",
			)
			avg = round(sum(children) / len(children), 2) if children else 0
			frappe.db.set_value(
				"VT Item", ancestor, "percent_done", avg, update_modified=False
			)
			ancestor = frappe.db.get_value(
				"VT Item", ancestor, "parent_vt_item"
			)
```

- [ ] **Step 4: Run test to verify pass**

Run: `docker exec frappe-backend-1 bench --site task.localhost run-tests --module vernon_tasks.task.doctype.vt_item.test_vt_item`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add vernon_tasks/task/doctype/vt_item/vt_item.py vernon_tasks/task/doctype/vt_item/test_vt_item.py
git commit -m "feat(item): rollup percent_done Task→Sprint→Project→OKR"
```

---

## Task 7: Child-table round-trip test (Key Result + KPI Entry)

**Files:**
- Test: `vernon_tasks/task/doctype/vt_item/test_vt_item.py`

Confirms the Task 1 child-table conversion works against a real node.

- [ ] **Step 1: Add test**

Append to `class TestVTItem`:

```python
	def test_okr_holds_key_results(self):
		# spec §3.2 — Key Result lives as a child row under an OKR node
		okr = _make("OKR", "OKR with KR")
		okr.append("key_results", {"metric": "Signups", "target_value": 1000})
		okr.save(ignore_permissions=True)
		okr.reload()
		self.assertEqual(len(okr.key_results), 1)
		self.assertEqual(okr.key_results[0].metric, "Signups")

	def test_kpi_holds_entries(self):
		# spec §3.2 — KPI Entry lives as a child row under a KPI node
		kpi = _make("KPI", "Daily active users")
		kpi.append("kpi_entries", {"date": frappe.utils.today(), "value": 42})
		kpi.save(ignore_permissions=True)
		kpi.reload()
		self.assertEqual(len(kpi.kpi_entries), 1)
		self.assertEqual(kpi.kpi_entries[0].value, 42)
```

- [ ] **Step 2: Run tests**

Run: `docker exec frappe-backend-1 bench --site task.localhost run-tests --module vernon_tasks.task.doctype.vt_item.test_vt_item`
Expected: PASS (8 tests). If a child-table field error appears, re-run `bench migrate` (child tables need their schema synced).

- [ ] **Step 3: Commit**

```bash
git add vernon_tasks/task/doctype/vt_item/test_vt_item.py
git commit -m "test(item): round-trip Key Result & KPI Entry sebagai child table"
```

---

## Task 8: Minimal demo seeder + manual tree smoke

**Files:**
- Create: `vernon_tasks/setup/seed_vt_item_demo.py`

A console helper to eyeball the native tree view. The full `demo_data.py`
rewrite is deferred to P4; this is intentionally minimal and idempotent.

- [ ] **Step 1: Write the seeder**

`vernon_tasks/setup/seed_vt_item_demo.py`:

```python
"""Minimal VT Item demo seed — one OKR→Project→Sprint→Task chain.

Console helper for P1 only (eyeball the native tree view at
/app/vt-item/view/tree). The full demo_data rewrite is P4.
Run: bench --site task.localhost execute \
  vernon_tasks.setup.seed_vt_item_demo.seed
"""
import frappe

# Stable titles so re-running is idempotent (skip if already present).
DEMO_CHAIN = [
	("OKR", "DEMO OKR — Grow", None),
	("Project", "DEMO Project — Launch", "DEMO OKR — Grow"),
	("Sprint", "DEMO Sprint 1", "DEMO Project — Launch"),
	("Task", "DEMO Task — Ship landing", "DEMO Sprint 1"),
]


def _find(title):
	"""Return the node name for a demo title, or None."""
	return frappe.db.get_value("VT Item", {"title": title})


def seed():
	"""Idempotently create the demo chain. Safe to re-run."""
	for node_type, title, parent_title in DEMO_CHAIN:
		if _find(title):
			continue
		parent = _find(parent_title) if parent_title else None
		frappe.get_doc(
			{"doctype": "VT Item", "node_type": node_type,
			 "title": title, "parent_vt_item": parent, "is_group": 1}
		).insert(ignore_permissions=True)
	frappe.db.commit()
	print("seeded VT Item demo chain")
```

- [ ] **Step 2: Run the seeder**

Run: `docker exec frappe-backend-1 bench --site task.localhost execute vernon_tasks.setup.seed_vt_item_demo.seed`
Expected: prints `seeded VT Item demo chain`, no error.

- [ ] **Step 3: Eyeball the tree view**

Open `/app/vt-item/view/tree` in the desk. Expected: DEMO OKR → DEMO Project → DEMO Sprint 1 → DEMO Task nested correctly.

- [ ] **Step 4: Commit**

```bash
git add vernon_tasks/setup/seed_vt_item_demo.py
git commit -m "chore(item): seeder demo minimal + smoke tree view"
```

---

## Task 9: Update docs (anatomy, tracker, OpenWolf)

**Files:**
- Modify: `.wolf/anatomy.md` (project root)
- Modify: `.wolf/memory.md` (append)
- Modify: `vernon_tasks/CLAUDE.md` (note VT Item supersedes the legacy hierarchy doctypes — P1 additive)

- [ ] **Step 1: Add anatomy entries** for `task/doctype/vt_item/{vt_item.json,vt_item.py,test_vt_item.py}` and `setup/seed_vt_item_demo.py` (2–3 line descriptions + token estimates).

- [ ] **Step 2: Append a memory.md line** recording the P1 session (one row in the table format).

- [ ] **Step 3: Add a note to `vernon_tasks/CLAUDE.md`** under a new "Unified Hierarchy (VT Item)" heading: VT Item is the canonical OKR→Task tree; legacy Objective/VT Project/VT Sprint/VT Task remain until the P4 drop patch; consumers migrate in P2–P4.

- [ ] **Step 4: Commit**

```bash
git add .wolf/anatomy.md .wolf/memory.md vernon_tasks/CLAUDE.md
git commit -m "docs(item): catat VT Item P1 di anatomy + CLAUDE.md"
```

---

## Self-Review

**Spec coverage:**
- §3 doctype + field groups → Task 2 ✓
- §3.2 child tables (KR, KPI Entry) → Task 1 + Task 7 ✓
- §3.3 naming → Task 3 ✓
- §4 hierarchy validation (strict + skips, KPI dual placement) → Task 4 ✓
- §4 brand inheritance → Task 5 ✓
- §5 rollup → Task 6 ✓
- §6 tree UI: native view smoke → Task 8 ✓ (`vt-tree` custom page is P4, out of P1 scope)
- §8 fresh-start drop patch → **deferred to P4** (documented in plan header; keeps app buildable) ✓
- §9 testing → Tasks 3–7 ✓

**Placeholder scan:** No TBD/TODO. The only "implemented later" is the `_inherit_brand` stub in Task 4, immediately replaced in Task 5 — full code shown for both. ✓

**Type consistency:** `node_type`, `parent_vt_item`, `percent_done`, `key_results`/`kpi_entries`, `NODE_NAMING`, `ALLOWED_PARENTS`, `_inherit_brand`, `_rollup_ancestors`, `_validate_parent_type` consistent across tasks. ✓

**Open verification item (not a placeholder):** Task 5 Step 1 note — confirm the `VT Brand` title fieldname before running the brand test.

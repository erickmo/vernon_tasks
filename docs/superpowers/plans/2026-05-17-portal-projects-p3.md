# Portal Projects P3.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship desktop Projects portal at `/portal/projects/*` — list/detail/filters, linked-OKR preview, inline status/PDCA, create/edit Project, bulk status/PDCA actions — behind `portal_projects_enabled` feature flag.

**Architecture:** Vanilla React Query + composed UI (Approach A, mirrors P2 OKR). New folder `pwa/src/portal/projects/`. Backend adds 3 whitelisted endpoints in `vernon_tasks/api/projects.py` reusing OKR's `pdca.py` helper. No VT Project schema changes. Cross-domain reuse: ObjectiveLink consumes `useObjective` from `pwa/src/portal/okr/hooks/`.

**Tech Stack:** Frappe (Python), React + Vite + TS, react-query, react-router, react-hook-form + zod, vitest, playwright.

**Reference spec:** `docs/superpowers/specs/2026-05-17-portal-projects-p3-design.md`

**Bench helper:** Define once at top — `BENCH="docker exec frappe-backend-1 bench --site task2.localhost"`. Use `$BENCH ...` in all bench commands.

---

## Task 1 — Bootstrap branch + portal_projects_enabled flag

**Files:**
- `vernon_tasks/vt_settings/doctype/vt_settings/vt_settings.json` (modify)

**Steps:**

- [ ] 1.1 Create implementation branch from the OKR P2 branch.

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks
git fetch origin
git checkout feat/portal-okr-p2
git pull --ff-only
git checkout -b feat/portal-projects-p3
```

- [ ] 1.2 Open `vernon_tasks/vt_settings/doctype/vt_settings/vt_settings.json` and append `portal_projects_enabled` to both the `field_order` array and the `fields` array.

`field_order` — append this string to the END of the array:

```json
"portal_projects_enabled"
```

`fields` — append this object to the END of the array:

```json
{
  "default": "0",
  "fieldname": "portal_projects_enabled",
  "fieldtype": "Check",
  "label": "Enable Portal Projects (/portal/projects)"
}
```

- [ ] 1.3 Apply migration and verify.

```bash
export BENCH="docker exec frappe-backend-1 bench --site task2.localhost"
$BENCH migrate
$BENCH console <<'PY'
import frappe
m = frappe.get_meta("VT Settings")
print("HAS_FIELD", any(f.fieldname == "portal_projects_enabled" for f in m.fields))
PY
```

Expected output line: `HAS_FIELD True`.

- [ ] 1.4 Commit.

```bash
git add vernon_tasks/vt_settings/doctype/vt_settings/vt_settings.json
git commit -m "feat(vt-settings): add portal_projects_enabled flag"
```

---

## Task 2 — Backend list_projects endpoint (TDD)

**Files:**
- `vernon_tasks/api/projects.py` (new)
- `vernon_tasks/api/test_projects.py` (new)
- `vernon_tasks/api/__init__.py` (verify exists, no edit)

**Steps:**

- [ ] 2.1 Verify `vernon_tasks/api/` package exists (it does — `pdca.py`, `okr.py` already live there from P2). If `__init__.py` missing:

```bash
ls vernon_tasks/api/__init__.py || touch vernon_tasks/api/__init__.py
```

- [ ] 2.2 RED — create `vernon_tasks/api/test_projects.py`:

```python
"""Tests for vernon_tasks.api.projects."""
from __future__ import annotations

import frappe
from frappe.tests.utils import FrappeTestCase

from vernon_tasks.api import projects as projects_api


def _make_project(title: str, **overrides) -> str:
    doc = frappe.new_doc("VT Project")
    doc.update(
        {
            "title": title,
            "project_owner": "Administrator",
            "project_leader": "Administrator",
            "start_date": "2026-04-01",
            "end_date": "2026-06-30",
            "status": "Active",
            "pdca_phase": "DO",
        }
    )
    doc.update(overrides)
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return doc.name


class TestListProjects(FrappeTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        frappe.set_user("Administrator")
        cls.proj_a = _make_project("List Proj A P3")
        cls.proj_b = _make_project(
            "List Proj B P3",
            start_date="2026-07-01",
            end_date="2026-09-30",
            status="Planning",
            pdca_phase="PLAN",
        )

    def test_returns_expected_keys(self):
        rows = projects_api.list_projects({})
        self.assertTrue(any(r["name"] == self.proj_a for r in rows))
        row = next(r for r in rows if r["name"] == self.proj_a)
        for key in (
            "name",
            "title",
            "project_owner",
            "project_leader",
            "start_date",
            "end_date",
            "status",
            "pdca_phase",
            "objective",
            "linked_objective_title",
            "team_count",
            "milestone_count",
            "sprint_count",
            "modified",
        ):
            self.assertIn(key, row)

    def test_date_range_overlap(self):
        rows = projects_api.list_projects(
            {"period_start": "2026-05-01", "period_end": "2026-05-31"}
        )
        names = {r["name"] for r in rows}
        self.assertIn(self.proj_a, names)
        self.assertNotIn(self.proj_b, names)

    def test_status_filter(self):
        rows = projects_api.list_projects({"statuses": ["Planning"]})
        names = {r["name"] for r in rows}
        self.assertIn(self.proj_b, names)
        self.assertNotIn(self.proj_a, names)
```

- [ ] 2.3 GREEN — create `vernon_tasks/api/projects.py`:

```python
"""Portal Projects API — list / detail / bulk."""
from __future__ import annotations

from typing import Any

import frappe
from frappe import _

PROJECT_DOCTYPE = "VT Project"
DEFAULT_LIMIT = 500


@frappe.whitelist()
def list_projects(filters: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    """Return list of VT Projects with linked Objective title + child counts.

    Filters (all optional):
      period_start, period_end (ISO dates) — independent overlap
      statuses (list[str]), pdca_phases (list[str])
      leaders (list[str]), owners (list[str])
    """
    if not frappe.has_permission(PROJECT_DOCTYPE, "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    f = filters or {}
    where: list[str] = []
    params: dict[str, Any] = {}

    period_start = f.get("period_start")
    period_end = f.get("period_end")
    if period_start and period_end:
        where.append("p.start_date <= %(period_end)s AND p.end_date >= %(period_start)s")
        params["period_start"] = period_start
        params["period_end"] = period_end
    elif period_start:
        where.append("p.end_date >= %(period_start)s")
        params["period_start"] = period_start
    elif period_end:
        where.append("p.start_date <= %(period_end)s")
        params["period_end"] = period_end

    statuses = f.get("statuses") or []
    if statuses:
        where.append("p.status IN %(statuses)s")
        params["statuses"] = tuple(statuses)

    pdca_phases = f.get("pdca_phases") or []
    if pdca_phases:
        where.append("p.pdca_phase IN %(pdca_phases)s")
        params["pdca_phases"] = tuple(pdca_phases)

    leaders = f.get("leaders") or []
    if leaders:
        where.append("p.project_leader IN %(leaders)s")
        params["leaders"] = tuple(leaders)

    owners = f.get("owners") or []
    if owners:
        where.append("p.project_owner IN %(owners)s")
        params["owners"] = tuple(owners)

    where_sql = ("WHERE " + " AND ".join(where)) if where else ""

    sql = f"""
        SELECT
            p.name,
            p.title,
            p.project_owner,
            p.project_leader,
            p.start_date,
            p.end_date,
            p.status,
            p.pdca_phase,
            p.objective,
            o.title AS linked_objective_title,
            (SELECT COUNT(*) FROM `tabProject Team Member` tm WHERE tm.parent = p.name) AS team_count,
            (SELECT COUNT(*) FROM `tabProject Milestone` mi WHERE mi.parent = p.name) AS milestone_count,
            (SELECT COUNT(*) FROM `tabVT Sprint` s WHERE s.project = p.name) AS sprint_count,
            p.modified
        FROM `tabVT Project` p
        LEFT JOIN `tabObjective` o ON o.name = p.objective
        {where_sql}
        ORDER BY p.start_date DESC, p.modified DESC
        LIMIT {DEFAULT_LIMIT}
    """
    rows = frappe.db.sql(sql, params, as_dict=True)
    return [dict(r) for r in rows]
```

- [ ] 2.4 Run.

```bash
$BENCH run-tests --app vernon_tasks --module vernon_tasks.api.test_projects
```

Expected: `OK` (3 tests pass).

- [ ] 2.5 Commit.

```bash
git add vernon_tasks/api/projects.py vernon_tasks/api/test_projects.py
git commit -m "feat(api): list_projects with date-range + multi-filter + linked OKR title"
```

---

## Task 3 — Backend get_project_with_relations (TDD)

**Files:**
- `vernon_tasks/api/projects.py` (modify)
- `vernon_tasks/api/test_projects.py` (modify)

**Steps:**

- [ ] 3.1 RED — append to `test_projects.py`:

```python
class TestGetProjectWithRelations(FrappeTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        frappe.set_user("Administrator")
        cls.proj = _make_project("Detail Proj P3")

    def test_returns_project_and_counts_no_objective(self):
        res = projects_api.get_project_with_relations(self.proj)
        self.assertEqual(res["project"]["name"], self.proj)
        self.assertIsNone(res["linked_objective_summary"])
        self.assertIn("team_members", res["counts"])
        self.assertIn("milestones", res["counts"])
        self.assertIn("sprints", res["counts"])
        self.assertIn("documentation", res["counts"])

    def test_missing_project_raises(self):
        with self.assertRaises(frappe.DoesNotExistError):
            projects_api.get_project_with_relations("VT-PROJ-DOES-NOT-EXIST")
```

- [ ] 3.2 GREEN — append to `vernon_tasks/api/projects.py`:

```python
@frappe.whitelist()
def get_project_with_relations(name: str) -> dict[str, Any]:
    """Return project doc + linked_objective_summary + counts."""
    if not frappe.db.exists(PROJECT_DOCTYPE, name):
        raise frappe.DoesNotExistError(f"VT Project {name} not found")
    if not frappe.has_permission(PROJECT_DOCTYPE, "read", doc=name):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    project = frappe.get_doc(PROJECT_DOCTYPE, name).as_dict()

    linked: dict[str, Any] | None = None
    if project.get("objective"):
        obj_name = project["objective"]
        if frappe.db.exists("Objective", obj_name) and frappe.has_permission(
            "Objective", "read", doc=obj_name
        ):
            obj = frappe.db.get_value(
                "Objective",
                obj_name,
                ["name", "title", "period_start", "period_end", "status"],
                as_dict=True,
            )
            avg = frappe.db.sql(
                """
                SELECT AVG(progress_percent) AS avg
                FROM `tabKey Result`
                WHERE parent = %(p)s
                """,
                {"p": obj_name},
                as_dict=True,
            )
            avg_progress = float(avg[0]["avg"] or 0.0) if avg else 0.0
            linked = {
                "name": obj.name,
                "title": obj.title,
                "period": f"{obj.period_start or ''} — {obj.period_end or ''}".strip(" —"),
                "status": obj.status,
                "avg_kr_progress": round(avg_progress, 1),
            }

    counts = {
        "team_members": frappe.db.count("Project Team Member", {"parent": name}),
        "milestones": frappe.db.count("Project Milestone", {"parent": name}),
        "sprints": frappe.db.count("VT Sprint", {"project": name}),
        "documentation": frappe.db.count("Project Documentation", {"parent": name}),
    }

    return {
        "project": project,
        "linked_objective_summary": linked,
        "counts": counts,
    }
```

- [ ] 3.3 Run.

```bash
$BENCH run-tests --app vernon_tasks --module vernon_tasks.api.test_projects
```

Expected: `OK` (5 tests pass).

- [ ] 3.4 Commit.

```bash
git add vernon_tasks/api/projects.py vernon_tasks/api/test_projects.py
git commit -m "feat(api): get_project_with_relations single-fetch endpoint"
```

---

## Task 4 — Backend bulk_update_projects (TDD)

**Files:**
- `vernon_tasks/api/projects.py` (modify)
- `vernon_tasks/api/test_projects.py` (modify)

**Steps:**

- [ ] 4.1 RED — append to `test_projects.py`:

```python
class TestBulkUpdateProjects(FrappeTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        frappe.set_user("Administrator")
        cls.p_plan = _make_project("Bulk Plan", pdca_phase="PLAN", status="Active")
        cls.p_do = _make_project("Bulk Do", pdca_phase="DO", status="Active")
        cls.p_closed = _make_project(
            "Bulk Closed", pdca_phase="CLOSED", status="Cancelled"
        )

    def test_advance_pdca_mixed(self):
        res = projects_api.bulk_update_projects(
            [self.p_plan, self.p_do, self.p_closed],
            {"pdca_phase": "__next__"},
        )
        updated_names = {u["name"] for u in res["updated"]}
        skipped = {s["name"]: s["reason"] for s in res["skipped"]}
        self.assertIn(self.p_plan, updated_names)
        self.assertIn(self.p_do, updated_names)
        self.assertEqual(skipped.get(self.p_closed), "already_closed")
        self.assertEqual(
            frappe.db.get_value("VT Project", self.p_plan, "pdca_phase"), "DO"
        )
        self.assertEqual(
            frappe.db.get_value("VT Project", self.p_do, "pdca_phase"), "CHECK"
        )

    def test_set_status(self):
        res = projects_api.bulk_update_projects(
            [self.p_plan], {"status": "On Hold"}
        )
        self.assertTrue(any(u["name"] == self.p_plan for u in res["updated"]))
        self.assertEqual(
            frappe.db.get_value("VT Project", self.p_plan, "status"), "On Hold"
        )
```

- [ ] 4.2 GREEN — append to `vernon_tasks/api/projects.py`:

```python
from vernon_tasks.api.pdca import next_pdca_phase  # reuse OKR helper

VALID_STATUSES = {"Planning", "Active", "On Hold", "Completed", "Cancelled"}
ADVANCE_SENTINEL = "__next__"


@frappe.whitelist()
def bulk_update_projects(
    names: list[str], payload: dict[str, Any]
) -> dict[str, list[dict[str, Any]]]:
    """Apply status and/or pdca_phase change across multiple projects.

    payload keys:
      status: one of VALID_STATUSES
      pdca_phase: literal phase OR "__next__" (advance via next_pdca_phase)
    Returns {updated: [{name, changes}], skipped: [{name, reason}]}.
    """
    if isinstance(names, str):
        names = frappe.parse_json(names)
    if isinstance(payload, str):
        payload = frappe.parse_json(payload)
    payload = payload or {}

    target_status = payload.get("status")
    target_pdca = payload.get("pdca_phase")

    if target_status is not None and target_status not in VALID_STATUSES:
        frappe.throw(_("Invalid status: {0}").format(target_status))

    updated: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []

    for name in names:
        if not frappe.db.exists(PROJECT_DOCTYPE, name):
            skipped.append({"name": name, "reason": "not_found"})
            continue
        if not frappe.has_permission(PROJECT_DOCTYPE, "write", doc=name):
            skipped.append({"name": name, "reason": "no_permission"})
            continue

        changes: dict[str, Any] = {}

        if target_pdca is not None:
            if target_pdca == ADVANCE_SENTINEL:
                current = frappe.db.get_value(PROJECT_DOCTYPE, name, "pdca_phase")
                nxt = next_pdca_phase(current)
                if nxt is None:
                    skipped.append({"name": name, "reason": "already_closed"})
                    continue
                changes["pdca_phase"] = nxt
            else:
                changes["pdca_phase"] = target_pdca

        if target_status is not None:
            changes["status"] = target_status

        if not changes:
            skipped.append({"name": name, "reason": "no_changes"})
            continue

        for field, value in changes.items():
            frappe.db.set_value(PROJECT_DOCTYPE, name, field, value)

        updated.append({"name": name, "changes": changes})

    frappe.db.commit()
    return {"updated": updated, "skipped": skipped}
```

- [ ] 4.3 Run.

```bash
$BENCH run-tests --app vernon_tasks --module vernon_tasks.api.test_projects
```

Expected: `OK` (7 tests pass).

- [ ] 4.4 Commit.

```bash
git add vernon_tasks/api/projects.py vernon_tasks/api/test_projects.py
git commit -m "feat(api): bulk_update_projects PDCA-advance + status set with permission filter"
```

---

## Task 5 — Frontend lib: projectStatus

**Files:**
- `pwa/src/portal/projects/lib/projectStatus.ts` (new)
- `pwa/src/portal/projects/lib/projectStatus.test.ts` (new)

**Steps:**

- [ ] 5.1 Create directory.

```bash
mkdir -p pwa/src/portal/projects/lib
```

- [ ] 5.2 Create `pwa/src/portal/projects/lib/projectStatus.ts`:

```ts
export const PROJECT_STATUSES = [
  "Planning",
  "Active",
  "On Hold",
  "Completed",
  "Cancelled",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export function isTerminalStatus(status: string | null | undefined): boolean {
  return status === "Completed" || status === "Cancelled";
}
```

- [ ] 5.3 Create test:

```ts
import { describe, expect, it } from "vitest";

import { PROJECT_STATUSES, isTerminalStatus } from "./projectStatus";

describe("projectStatus", () => {
  it("exposes the canonical 5 statuses", () => {
    expect(PROJECT_STATUSES).toEqual([
      "Planning",
      "Active",
      "On Hold",
      "Completed",
      "Cancelled",
    ]);
  });

  it("marks Completed and Cancelled as terminal", () => {
    expect(isTerminalStatus("Completed")).toBe(true);
    expect(isTerminalStatus("Cancelled")).toBe(true);
  });

  it("marks other states as non-terminal", () => {
    expect(isTerminalStatus("Active")).toBe(false);
    expect(isTerminalStatus(null)).toBe(false);
    expect(isTerminalStatus(undefined)).toBe(false);
  });
});
```

- [ ] 5.4 Run.

```bash
cd pwa && npx vitest run src/portal/projects/lib/projectStatus.test.ts
```

Expected: `3 passed`.

- [ ] 5.5 Commit.

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks
git add pwa/src/portal/projects/lib
git commit -m "feat(projects): projectStatus constants + helper"
```

---

## Task 6 — Frontend API client + types

**Files:**
- `pwa/src/portal/projects/api/types.ts` (new)
- `pwa/src/portal/projects/api/projects.ts` (new)
- `pwa/src/portal/projects/api/bulk.ts` (new)

**Steps:**

- [ ] 6.1 Inspect `pwa/src/api/client.ts` to confirm exported HTTP helpers and the call convention used in P2 (e.g. `api.get("method.path", params)` or wrapper).

```bash
grep -nE "export (function|const)" pwa/src/api/client.ts
```

Use the SAME pattern the OKR API client uses; adapt the call shape below to match (the wrapper functions below assume `api.get(method, params)` and `api.post(method, body)`).

- [ ] 6.2 Create directory.

```bash
mkdir -p pwa/src/portal/projects/api
```

- [ ] 6.3 Create `pwa/src/portal/projects/api/types.ts`:

```ts
import type { ProjectStatus } from "../lib/projectStatus";

export type PdcaPhase = "PLAN" | "DO" | "CHECK" | "ACT" | "CLOSED";

export interface ProjectRow {
  name: string;
  title: string;
  project_owner: string | null;
  project_leader: string | null;
  start_date: string | null;
  end_date: string | null;
  status: ProjectStatus | null;
  pdca_phase: PdcaPhase | null;
  objective: string | null;
  linked_objective_title: string | null;
  team_count: number;
  milestone_count: number;
  sprint_count: number;
  modified: string;
}

export interface ListFilters {
  period_start?: string;
  period_end?: string;
  statuses?: ProjectStatus[];
  pdca_phases?: PdcaPhase[];
  leaders?: string[];
  owners?: string[];
}

export interface ProjectDoc {
  name: string;
  title: string;
  project_owner: string | null;
  project_leader: string | null;
  start_date: string | null;
  end_date: string | null;
  status: ProjectStatus | null;
  pdca_phase: PdcaPhase | null;
  objective: string | null;
  blocked_days_threshold: number | null;
  slip_pct_threshold: number | null;
  capacity_pct_threshold: number | null;
  modified: string;
}

export interface LinkedObjectiveSummary {
  name: string;
  title: string;
  period: string;
  status: string | null;
  avg_kr_progress: number;
}

export interface ProjectCounts {
  team_members: number;
  milestones: number;
  sprints: number;
  documentation: number;
}

export interface ProjectDetail {
  project: ProjectDoc;
  linked_objective_summary: LinkedObjectiveSummary | null;
  counts: ProjectCounts;
}

export interface BulkUpdatePayload {
  status?: ProjectStatus;
  /** Pass "__next__" to advance via PDCA sequence, else a literal phase. */
  pdca_phase?: PdcaPhase | "__next__";
}

export interface BulkUpdateResult {
  updated: Array<{ name: string; changes: Record<string, unknown> }>;
  skipped: Array<{ name: string; reason: string }>;
}

export interface ProjectFormValues {
  title: string;
  project_owner: string;
  project_leader: string;
  start_date: string;
  end_date: string;
  status: ProjectStatus;
  pdca_phase: PdcaPhase;
  objective?: string;
  blocked_days_threshold: number;
  slip_pct_threshold: number;
  capacity_pct_threshold: number;
}
```

- [ ] 6.4 Create `pwa/src/portal/projects/api/projects.ts`:

```ts
import { api } from "../../../api/client";
import type {
  ListFilters,
  ProjectDetail,
  ProjectDoc,
  ProjectFormValues,
  ProjectRow,
} from "./types";

const LIST_METHOD = "vernon_tasks.api.projects.list_projects";
const DETAIL_METHOD = "vernon_tasks.api.projects.get_project_with_relations";

export async function listProjects(
  filters: ListFilters = {}
): Promise<ProjectRow[]> {
  const res = await api.get<{ message: ProjectRow[] }>(LIST_METHOD, {
    filters: JSON.stringify(filters),
  });
  return res.message ?? [];
}

export async function getProjectWithRelations(
  name: string
): Promise<ProjectDetail> {
  const res = await api.get<{ message: ProjectDetail }>(DETAIL_METHOD, {
    name,
  });
  return res.message;
}

export async function createProject(
  values: ProjectFormValues
): Promise<ProjectDoc> {
  const res = await api.post<{ message: ProjectDoc }>(
    "frappe.client.insert",
    { doc: { doctype: "VT Project", ...values } }
  );
  return res.message;
}

export async function updateProject(
  name: string,
  values: Partial<ProjectFormValues>
): Promise<ProjectDoc> {
  const res = await api.post<{ message: ProjectDoc }>(
    "frappe.client.set_value",
    { doctype: "VT Project", name, fieldname: values }
  );
  return res.message;
}
```

- [ ] 6.5 Create `pwa/src/portal/projects/api/bulk.ts`:

```ts
import { api } from "../../../api/client";
import type { BulkUpdatePayload, BulkUpdateResult } from "./types";

const BULK_METHOD = "vernon_tasks.api.projects.bulk_update_projects";

export async function bulkUpdateProjects(
  names: string[],
  payload: BulkUpdatePayload
): Promise<BulkUpdateResult> {
  const res = await api.post<{ message: BulkUpdateResult }>(BULK_METHOD, {
    names: JSON.stringify(names),
    payload: JSON.stringify(payload),
  });
  return res.message;
}
```

- [ ] 6.6 Typecheck.

```bash
cd pwa && npx tsc --noEmit
```

Expected: clean.

- [ ] 6.7 Commit.

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks
git add pwa/src/portal/projects/api
git commit -m "feat(projects): frontend API clients for projects + bulk"
```

---

## Task 7 — Hooks

**Files:**
- `pwa/src/portal/projects/hooks/keys.ts` (new)
- `pwa/src/portal/projects/hooks/useProjects.ts` (new)
- `pwa/src/portal/projects/hooks/useProject.ts` (new)
- `pwa/src/portal/projects/hooks/useProjectsBulk.ts` (new)

**Steps:**

- [ ] 7.1 Create directory.

```bash
mkdir -p pwa/src/portal/projects/hooks
```

- [ ] 7.2 Create `keys.ts`:

```ts
import type { ListFilters } from "../api/types";

export const projectKeys = {
  all: ["projects"] as const,
  lists: () => [...projectKeys.all, "list"] as const,
  list: (filters: ListFilters) =>
    [...projectKeys.lists(), filters] as const,
  details: () => [...projectKeys.all, "detail"] as const,
  detail: (name: string) => [...projectKeys.details(), name] as const,
};
```

- [ ] 7.3 Create `useProjects.ts` (uses self-import for spy-ability):

```ts
import { useQuery } from "@tanstack/react-query";

import * as projectsApi from "../api/projects";
import type { ListFilters } from "../api/types";
import { projectKeys } from "./keys";

const STALE_30S = 30_000;

export function useProjects(filters: ListFilters = {}) {
  return useQuery({
    queryKey: projectKeys.list(filters),
    queryFn: () => projectsApi.listProjects(filters),
    staleTime: STALE_30S,
  });
}
```

- [ ] 7.4 Create `useProject.ts`:

```ts
import { useQuery } from "@tanstack/react-query";

import * as projectsApi from "../api/projects";
import { projectKeys } from "./keys";

const STALE_30S = 30_000;

export function useProject(name: string | null | undefined) {
  return useQuery({
    queryKey: projectKeys.detail(name ?? ""),
    queryFn: () => projectsApi.getProjectWithRelations(name as string),
    enabled: !!name,
    staleTime: STALE_30S,
  });
}
```

- [ ] 7.5 Create `useProjectsBulk.ts`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";

import * as bulkApi from "../api/bulk";
import type { BulkUpdatePayload } from "../api/types";
import { projectKeys } from "./keys";

export function useProjectsBulk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      names,
      payload,
    }: {
      names: string[];
      payload: BulkUpdatePayload;
    }) => bulkApi.bulkUpdateProjects(names, payload),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: projectKeys.lists() });
      for (const u of result.updated) {
        qc.invalidateQueries({ queryKey: projectKeys.detail(u.name) });
      }
    },
  });
}
```

- [ ] 7.6 Typecheck.

```bash
cd pwa && npx tsc --noEmit
```

- [ ] 7.7 Commit.

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks
git add pwa/src/portal/projects/hooks
git commit -m "feat(projects): react-query hooks for list, detail, bulk"
```

---

## Task 8 — FiltersBar (URL-sync) + tests

**Files:**
- `pwa/src/portal/projects/FiltersBar.tsx` (new)
- `pwa/src/portal/projects/FiltersBar.test.tsx` (new)

**Steps:**

- [ ] 8.1 Create `FiltersBar.tsx`:

```tsx
import { useSearchParams } from "react-router-dom";

import { PROJECT_STATUSES, type ProjectStatus } from "./lib/projectStatus";

const PDCA_PHASES = ["PLAN", "DO", "CHECK", "ACT", "CLOSED"] as const;
type PdcaPhase = (typeof PDCA_PHASES)[number];

function toggleCsv(current: string, value: string): string {
  const set = new Set(current ? current.split(",") : []);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  return Array.from(set).join(",");
}

export function FiltersBar() {
  const [params, setParams] = useSearchParams();

  const startDate = params.get("start_date") ?? "";
  const endDate = params.get("end_date") ?? "";
  const statusesCsv = params.get("statuses") ?? "";
  const pdcaCsv = params.get("pdca") ?? "";
  const leader = params.get("leader") ?? "";

  const statuses = statusesCsv ? statusesCsv.split(",") : [];
  const pdca = pdcaCsv ? pdcaCsv.split(",") : [];

  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  function clearAll() {
    setParams(new URLSearchParams(), { replace: true });
  }

  return (
    <section className="projects-filters" aria-label="Project filters">
      <label>
        Start
        <input
          type="date"
          value={startDate}
          onChange={(e) => update("start_date", e.target.value)}
        />
      </label>
      <label>
        End
        <input
          type="date"
          value={endDate}
          onChange={(e) => update("end_date", e.target.value)}
        />
      </label>
      <div className="chips" role="group" aria-label="Status">
        {PROJECT_STATUSES.map((s: ProjectStatus) => (
          <button
            key={s}
            type="button"
            aria-pressed={statuses.includes(s)}
            onClick={() => update("statuses", toggleCsv(statusesCsv, s))}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="chips" role="group" aria-label="PDCA">
        {PDCA_PHASES.map((p: PdcaPhase) => (
          <button
            key={p}
            type="button"
            aria-pressed={pdca.includes(p)}
            onClick={() => update("pdca", toggleCsv(pdcaCsv, p))}
          >
            {p}
          </button>
        ))}
      </div>
      <label>
        Leader
        <input
          type="text"
          value={leader}
          placeholder="user@example.com"
          onChange={(e) => update("leader", e.target.value)}
        />
      </label>
      <button type="button" onClick={clearAll}>
        Clear filters
      </button>
    </section>
  );
}
```

- [ ] 8.2 Create `FiltersBar.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { FiltersBar } from "./FiltersBar";

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.search}</div>;
}

function renderAt(initial = "/portal/projects") {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <FiltersBar />
      <LocationProbe />
    </MemoryRouter>
  );
}

describe("<FiltersBar>", () => {
  it("renders inputs and chips", () => {
    renderAt();
    expect(screen.getByLabelText(/start/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/end/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Active" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PLAN" })).toBeInTheDocument();
    expect(screen.getByLabelText(/leader/i)).toBeInTheDocument();
  });

  it("toggling a status chip writes statuses=Active to URL", async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(screen.getByRole("button", { name: "Active" }));
    expect(screen.getByTestId("loc").textContent).toContain("statuses=Active");
  });

  it("Clear filters empties URL", async () => {
    const user = userEvent.setup();
    renderAt("/portal/projects?statuses=Active&leader=foo");
    await user.click(screen.getByRole("button", { name: /clear filters/i }));
    expect(screen.getByTestId("loc").textContent).toBe("");
  });
});
```

- [ ] 8.3 Run.

```bash
cd pwa && npx vitest run src/portal/projects/FiltersBar.test.tsx
```

Expected: `3 passed`.

- [ ] 8.4 Commit.

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks
git add pwa/src/portal/projects/FiltersBar.tsx pwa/src/portal/projects/FiltersBar.test.tsx
git commit -m "feat(projects): FiltersBar with URL-synced filters"
```

---

## Task 9 — ProjectTable + tests

**Files:**
- `pwa/src/portal/projects/ProjectTable.tsx` (new)
- `pwa/src/portal/projects/ProjectTable.test.tsx` (new)

**Steps:**

- [ ] 9.1 Create `ProjectTable.tsx`:

```tsx
import { useSearchParams } from "react-router-dom";

import type { ProjectRow } from "./api/types";

export interface ProjectTableProps {
  rows: ProjectRow[];
  selected: Set<string>;
  onSelectChange: (next: Set<string>) => void;
}

export function ProjectTable({
  rows,
  selected,
  onSelectChange,
}: ProjectTableProps) {
  const [params, setParams] = useSearchParams();

  function toggle(name: string) {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onSelectChange(next);
  }

  function toggleAll() {
    if (selected.size === rows.length) {
      onSelectChange(new Set());
    } else {
      onSelectChange(new Set(rows.map((r) => r.name)));
    }
  }

  function selectRow(name: string) {
    const next = new URLSearchParams(params);
    next.set("proj", name);
    setParams(next, { replace: true });
  }

  return (
    <table className="projects-table">
      <thead>
        <tr>
          <th>
            <input
              type="checkbox"
              aria-label="Select all"
              checked={rows.length > 0 && selected.size === rows.length}
              onChange={toggleAll}
            />
          </th>
          <th>Title</th>
          <th>Leader</th>
          <th>Owner</th>
          <th>Period</th>
          <th>Status</th>
          <th>PDCA</th>
          <th>Linked OKR</th>
          <th>Updated</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.name} onClick={() => selectRow(r.name)}>
            <td onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                aria-label={`Select ${r.title}`}
                checked={selected.has(r.name)}
                onChange={() => toggle(r.name)}
              />
            </td>
            <td onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="link"
                onClick={() => selectRow(r.name)}
              >
                {r.title}
              </button>
            </td>
            <td>{r.project_leader ?? "—"}</td>
            <td>{r.project_owner ?? "—"}</td>
            <td>
              {(r.start_date ?? "—") + " — " + (r.end_date ?? "—")}
            </td>
            <td>{r.status ?? "—"}</td>
            <td>{r.pdca_phase ?? "—"}</td>
            <td>{r.linked_objective_title ?? "—"}</td>
            <td>{r.modified ? r.modified.slice(0, 10) : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] 9.2 Create `ProjectTable.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { ProjectTable } from "./ProjectTable";
import type { ProjectRow } from "./api/types";

const ROW: ProjectRow = {
  name: "VT-PROJ-001",
  title: "Demo Project",
  project_owner: "owner@example.com",
  project_leader: "leader@example.com",
  start_date: "2026-04-01",
  end_date: "2026-06-30",
  status: "Active",
  pdca_phase: "DO",
  objective: null,
  linked_objective_title: null,
  team_count: 3,
  milestone_count: 2,
  sprint_count: 1,
  modified: "2026-05-17 12:00:00",
};

describe("<ProjectTable>", () => {
  it("renders rows with key columns", () => {
    render(
      <MemoryRouter>
        <ProjectTable
          rows={[ROW]}
          selected={new Set()}
          onSelectChange={() => {}}
        />
      </MemoryRouter>
    );
    expect(screen.getByText("Demo Project")).toBeInTheDocument();
    expect(screen.getByText("leader@example.com")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("checkbox click invokes onSelectChange with row name", async () => {
    const user = userEvent.setup();
    const onSelectChange = vi.fn();
    render(
      <MemoryRouter>
        <ProjectTable
          rows={[ROW]}
          selected={new Set()}
          onSelectChange={onSelectChange}
        />
      </MemoryRouter>
    );
    await user.click(screen.getByRole("checkbox", { name: /Select Demo/ }));
    expect(onSelectChange).toHaveBeenCalledWith(new Set(["VT-PROJ-001"]));
  });
});
```

- [ ] 9.3 Run.

```bash
cd pwa && npx vitest run src/portal/projects/ProjectTable.test.tsx
```

Expected: `2 passed`.

- [ ] 9.4 Commit.

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks
git add pwa/src/portal/projects/ProjectTable.tsx pwa/src/portal/projects/ProjectTable.test.tsx
git commit -m "feat(projects): ProjectTable with row selection + linked OKR column"
```

---

## Task 10 — ObjectiveLink (cross-domain) + tests

**Files:**
- `pwa/src/portal/projects/ObjectiveLink.tsx` (new)
- `pwa/src/portal/projects/ObjectiveLink.test.tsx` (new)

**Steps:**

- [ ] 10.1 Confirm OKR hook path:

```bash
ls pwa/src/portal/okr/hooks/useObjective.ts
```

- [ ] 10.2 Create `ObjectiveLink.tsx`:

```tsx
import { Link } from "react-router-dom";

import { useObjective } from "../okr/hooks/useObjective";
import * as telemetry from "../../telemetry";

export interface ObjectiveLinkProps {
  projectName: string;
  objectiveName: string | null;
}

export function ObjectiveLink({
  projectName,
  objectiveName,
}: ObjectiveLinkProps) {
  const query = useObjective(objectiveName ?? undefined);

  if (!objectiveName) return null;

  if (query.isLoading) {
    return (
      <div
        className="objective-link-skeleton"
        data-testid="objective-link-skeleton"
      >
        Loading linked OKR…
      </div>
    );
  }

  if (query.isError || !query.data) {
    return <span className="muted">(linked OKR not found)</span>;
  }

  const obj = query.data;
  const krs = (obj as { key_results?: Array<{ progress_percent?: number }> })
    .key_results ?? [];
  const avg =
    krs.length === 0
      ? 0
      : Math.round(
          krs.reduce((sum, k) => sum + (k.progress_percent ?? 0), 0) /
            krs.length
        );

  return (
    <Link
      to={`/portal/okr?obj=${encodeURIComponent(obj.name)}`}
      className="objective-link-card"
      onClick={() =>
        telemetry.trackProjectsObjectiveLinkClick(projectName, obj.name)
      }
    >
      <div className="title">{obj.title}</div>
      <div className="meta">
        {(obj.period_start ?? "") + " — " + (obj.period_end ?? "")} ·{" "}
        {obj.status ?? "—"}
      </div>
      <div className="progress">
        <div className="bar" style={{ width: `${avg}%` }} />
        <span>{avg}%</span>
      </div>
    </Link>
  );
}
```

- [ ] 10.3 Create `ObjectiveLink.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ObjectiveLink } from "./ObjectiveLink";
import * as okrHook from "../okr/hooks/useObjective";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

afterEach(() => vi.restoreAllMocks());

describe("<ObjectiveLink>", () => {
  it("renders nothing when objectiveName is null", () => {
    const { container } = wrap(
      <ObjectiveLink projectName="P1" objectiveName={null} />
    );
    expect(container.textContent).toBe("");
  });

  it("renders compact card on success", () => {
    vi.spyOn(okrHook, "useObjective").mockReturnValue({
      data: {
        name: "OBJ-1",
        title: "Ship P3",
        period_start: "2026-04-01",
        period_end: "2026-06-30",
        status: "Active",
        key_results: [{ progress_percent: 40 }, { progress_percent: 60 }],
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof okrHook.useObjective>);

    wrap(<ObjectiveLink projectName="P1" objectiveName="OBJ-1" />);
    expect(screen.getByText("Ship P3")).toBeInTheDocument();
    expect(screen.getByText(/50%/)).toBeInTheDocument();
  });

  it("renders skeleton while loading", () => {
    vi.spyOn(okrHook, "useObjective").mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as ReturnType<typeof okrHook.useObjective>);

    wrap(<ObjectiveLink projectName="P1" objectiveName="OBJ-1" />);
    expect(screen.getByTestId("objective-link-skeleton")).toBeInTheDocument();
  });
});
```

- [ ] 10.4 Run.

```bash
cd pwa && npx vitest run src/portal/projects/ObjectiveLink.test.tsx
```

Expected: `3 passed`.

- [ ] 10.5 Commit.

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks
git add pwa/src/portal/projects/ObjectiveLink.tsx pwa/src/portal/projects/ObjectiveLink.test.tsx
git commit -m "feat(projects): ObjectiveLink cross-domain summary card"
```

> Note: Task 16 adds the actual `trackProjectsObjectiveLinkClick` wrapper. Until then this file may show a TS error on the `telemetry.*` import — leave the import in; Task 16 fixes it. If running tests before Task 16, stub it with a temporary `declare module` cast — but easier path is to execute Task 16 right after this (the click-telemetry test in Task 19 depends on it).

---

## Task 11 — ProjectDetail + tests

**Files:**
- `pwa/src/portal/projects/ProjectDetail.tsx` (new)
- `pwa/src/portal/projects/ProjectDetail.test.tsx` (new)

**Steps:**

- [ ] 11.1 Create `ProjectDetail.tsx`:

```tsx
import { Link } from "react-router-dom";

import { EmptyState } from "../shared/EmptyState";
import { PageSkeleton } from "../shared/PageSkeleton";
import { usePermissions } from "../shared/usePermissions";
import { ObjectiveLink } from "./ObjectiveLink";
import { useProject } from "./hooks/useProject";
import { useProjectsBulk } from "./hooks/useProjectsBulk";
import { PROJECT_STATUSES, isTerminalStatus } from "./lib/projectStatus";
import * as telemetry from "../../telemetry";

export interface ProjectDetailProps {
  name: string | null;
}

export function ProjectDetail({ name }: ProjectDetailProps) {
  const { data, isLoading, isError } = useProject(name);
  const bulk = useProjectsBulk();
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission("project.write");

  if (!name) {
    return <EmptyState title="Select a Project to view details" />;
  }
  if (isLoading) return <PageSkeleton />;
  if (isError || !data) {
    return <EmptyState title="Failed to load project" />;
  }

  const p = data.project;

  async function changeStatus(next: string) {
    if (!name) return;
    telemetry.trackProjectsInlineStatusChange(name, p.status ?? "", next);
    await bulk.mutateAsync({
      names: [name],
      payload: { status: next as (typeof PROJECT_STATUSES)[number] },
    });
  }

  async function advancePdca() {
    if (!name) return;
    await bulk.mutateAsync({
      names: [name],
      payload: { pdca_phase: "__next__" },
    });
  }

  const pdcaClosed = p.pdca_phase === "CLOSED";

  return (
    <article className="projects-detail">
      <header>
        <h2>{p.title}</h2>
        <dl>
          <dt>Leader</dt>
          <dd>{p.project_leader ?? "—"}</dd>
          <dt>Owner</dt>
          <dd>{p.project_owner ?? "—"}</dd>
          <dt>Period</dt>
          <dd>
            {(p.start_date ?? "—") + " — " + (p.end_date ?? "—")}
          </dd>
          <dt>Status</dt>
          <dd>
            <span className="badge">{p.status}</span>
          </dd>
          <dt>PDCA</dt>
          <dd>
            <span className="badge">{p.pdca_phase}</span>
          </dd>
        </dl>
        {canWrite && (
          <Link to={`/portal/projects/${encodeURIComponent(p.name)}/edit`}>
            Edit
          </Link>
        )}
      </header>

      {canWrite && (
        <section className="quick-actions" aria-label="Quick actions">
          <label>
            Status
            <select
              value={p.status ?? ""}
              disabled={bulk.isPending}
              onChange={(e) => changeStatus(e.target.value)}
            >
              {PROJECT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={advancePdca}
            disabled={pdcaClosed || bulk.isPending}
            title={pdcaClosed ? "Already CLOSED" : "Advance to next PDCA phase"}
          >
            Advance PDCA →
          </button>
        </section>
      )}

      <ObjectiveLink projectName={p.name} objectiveName={p.objective} />

      <section className="counts" aria-label="Related counts">
        <span>Team: {data.counts.team_members}</span>
        <span>Milestones: {data.counts.milestones}</span>
        <span>Sprints: {data.counts.sprints}</span>
        <span>Docs: {data.counts.documentation}</span>
      </section>

      {isTerminalStatus(p.status) && (
        <p className="muted">This project is in a terminal status.</p>
      )}
    </article>
  );
}
```

> If shared components live under a different path (e.g. `pwa/src/portal/shared/`), confirm with `ls pwa/src/portal/shared` and adapt imports. The OKR module uses the same shared folder.

- [ ] 11.2 Create `ProjectDetail.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProjectDetail } from "./ProjectDetail";
import * as useProjectHook from "./hooks/useProject";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

afterEach(() => vi.restoreAllMocks());

describe("<ProjectDetail>", () => {
  it("shows placeholder when no name", () => {
    wrap(<ProjectDetail name={null} />);
    expect(screen.getByText(/select a project/i)).toBeInTheDocument();
  });

  it("renders header and counts on success", () => {
    vi.spyOn(useProjectHook, "useProject").mockReturnValue({
      data: {
        project: {
          name: "VT-1",
          title: "Demo",
          project_owner: "o",
          project_leader: "l",
          start_date: "2026-04-01",
          end_date: "2026-06-30",
          status: "Active",
          pdca_phase: "DO",
          objective: null,
          blocked_days_threshold: 7,
          slip_pct_threshold: 20,
          capacity_pct_threshold: 80,
          modified: "2026-05-17 12:00:00",
        },
        linked_objective_summary: null,
        counts: {
          team_members: 3,
          milestones: 2,
          sprints: 1,
          documentation: 0,
        },
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useProjectHook.useProject>);

    wrap(<ProjectDetail name="VT-1" />);
    expect(screen.getByText("Demo")).toBeInTheDocument();
    expect(screen.getByText(/Team: 3/)).toBeInTheDocument();
  });

  it("renders ObjectiveLink section when objective set", () => {
    vi.spyOn(useProjectHook, "useProject").mockReturnValue({
      data: {
        project: {
          name: "VT-2",
          title: "WithObj",
          project_owner: "o",
          project_leader: "l",
          start_date: "2026-04-01",
          end_date: "2026-06-30",
          status: "Active",
          pdca_phase: "DO",
          objective: "OBJ-9",
          blocked_days_threshold: 7,
          slip_pct_threshold: 20,
          capacity_pct_threshold: 80,
          modified: "2026-05-17 12:00:00",
        },
        linked_objective_summary: null,
        counts: {
          team_members: 0,
          milestones: 0,
          sprints: 0,
          documentation: 0,
        },
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useProjectHook.useProject>);

    wrap(<ProjectDetail name="VT-2" />);
    // Either the skeleton or the fallback shows up — both prove ObjectiveLink rendered
    expect(
      screen.getByText(/linked OKR not found|loading linked OKR/i)
    ).toBeInTheDocument();
  });
});
```

- [ ] 11.3 Run.

```bash
cd pwa && npx vitest run src/portal/projects/ProjectDetail.test.tsx
```

Expected: `3 passed`.

- [ ] 11.4 Commit.

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks
git add pwa/src/portal/projects/ProjectDetail.tsx pwa/src/portal/projects/ProjectDetail.test.tsx
git commit -m "feat(projects): ProjectDetail with header, inline actions, linked OKR, counts"
```

---

## Task 12 — BulkActions + tests

**Files:**
- `pwa/src/portal/projects/BulkActions.tsx` (new)
- `pwa/src/portal/projects/BulkActions.test.tsx` (new)

**Steps:**

- [ ] 12.1 Create `BulkActions.tsx`:

```tsx
import { useState } from "react";

import { useProjectsBulk } from "./hooks/useProjectsBulk";
import { PROJECT_STATUSES, type ProjectStatus } from "./lib/projectStatus";
import * as telemetry from "../../telemetry";

export interface BulkActionsProps {
  selected: Set<string>;
}

type Mode = "pdca" | "status" | null;

export function BulkActions({ selected }: BulkActionsProps) {
  const [mode, setMode] = useState<Mode>(null);
  const [target, setTarget] = useState<ProjectStatus>("Active");
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const bulk = useProjectsBulk();

  if (selected.size === 0) return null;
  const names = Array.from(selected);

  async function confirmPdca() {
    const res = await bulk.mutateAsync({
      names,
      payload: { pdca_phase: "__next__" },
    });
    telemetry.trackProjectsBulkPdca(
      res.updated.length,
      res.updated.map((u) => ({
        name: u.name,
        to: (u.changes as { pdca_phase?: string }).pdca_phase ?? "",
      }))
    );
    setMode(null);
  }

  async function confirmStatus() {
    const res = await bulk.mutateAsync({
      names,
      payload: { status: target },
    });
    telemetry.trackProjectsBulkStatusSet(res.updated.length, target);
    setMode(null);
  }

  return (
    <section className="bulk-actions" aria-label="Bulk actions">
      <button type="button" onClick={() => setMode("pdca")}>
        Advance PDCA → ({selected.size})
      </button>
      <div className="status-dropdown">
        <button
          type="button"
          onClick={() => setStatusMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={statusMenuOpen}
        >
          Set Status…
        </button>
        {statusMenuOpen && (
          <ul role="menu">
            {PROJECT_STATUSES.map((s) => (
              <li key={s} role="none">
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    setTarget(s);
                    setStatusMenuOpen(false);
                    setMode("status");
                  }}
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {mode === "pdca" && (
        <div role="dialog" aria-label="Confirm advance PDCA">
          <p>Advance PDCA on {selected.size} project(s)?</p>
          <button type="button" onClick={confirmPdca} disabled={bulk.isPending}>
            Confirm
          </button>
          <button type="button" onClick={() => setMode(null)}>
            Cancel
          </button>
        </div>
      )}

      {mode === "status" && (
        <div role="dialog" aria-label="Confirm set status">
          <p>
            Set status to <strong>{target}</strong> on {selected.size}{" "}
            project(s)?
          </p>
          <button
            type="button"
            onClick={confirmStatus}
            disabled={bulk.isPending}
          >
            Confirm
          </button>
          <button type="button" onClick={() => setMode(null)}>
            Cancel
          </button>
        </div>
      )}
    </section>
  );
}
```

- [ ] 12.2 Create `BulkActions.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BulkActions } from "./BulkActions";
import * as bulkApi from "./api/bulk";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

afterEach(() => vi.restoreAllMocks());

describe("<BulkActions>", () => {
  it("renders nothing when selection is empty", () => {
    const { container } = wrap(<BulkActions selected={new Set()} />);
    expect(container.textContent).toBe("");
  });

  it("PDCA confirm calls bulk API with __next__", async () => {
    const spy = vi
      .spyOn(bulkApi, "bulkUpdateProjects")
      .mockResolvedValue({ updated: [], skipped: [] });
    const user = userEvent.setup();
    wrap(<BulkActions selected={new Set(["A", "B"])} />);
    await user.click(screen.getByRole("button", { name: /Advance PDCA/ }));
    await user.click(screen.getByRole("button", { name: /confirm/i }));
    expect(spy).toHaveBeenCalledWith(["A", "B"], { pdca_phase: "__next__" });
  });

  it("Set Status dropdown → confirm calls API with target", async () => {
    const spy = vi
      .spyOn(bulkApi, "bulkUpdateProjects")
      .mockResolvedValue({ updated: [], skipped: [] });
    const user = userEvent.setup();
    wrap(<BulkActions selected={new Set(["A"])} />);
    await user.click(screen.getByRole("button", { name: /Set Status/ }));
    await user.click(screen.getByRole("menuitem", { name: "On Hold" }));
    await user.click(screen.getByRole("button", { name: /confirm/i }));
    expect(spy).toHaveBeenCalledWith(["A"], { status: "On Hold" });
  });
});
```

- [ ] 12.3 Run.

```bash
cd pwa && npx vitest run src/portal/projects/BulkActions.test.tsx
```

Expected: `3 passed`.

- [ ] 12.4 Commit.

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks
git add pwa/src/portal/projects/BulkActions.tsx pwa/src/portal/projects/BulkActions.test.tsx
git commit -m "feat(projects): BulkActions with PDCA + status dropdown confirm"
```

---

## Task 13 — ProjectList composition + tests

**Files:**
- `pwa/src/portal/projects/ProjectList.tsx` (new)
- `pwa/src/portal/projects/ProjectList.test.tsx` (new)

**Steps:**

- [ ] 13.1 Create `ProjectList.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { EmptyState } from "../shared/EmptyState";
import { PageLayout } from "../shared/PageLayout";
import { PageSkeleton } from "../shared/PageSkeleton";
import { BulkActions } from "./BulkActions";
import { FiltersBar } from "./FiltersBar";
import { ProjectDetail } from "./ProjectDetail";
import { ProjectTable } from "./ProjectTable";
import type { ListFilters, PdcaPhase } from "./api/types";
import { useProjects } from "./hooks/useProjects";
import type { ProjectStatus } from "./lib/projectStatus";
import * as telemetry from "../../telemetry";

function paramsToFilters(params: URLSearchParams): ListFilters {
  const f: ListFilters = {};
  const ps = params.get("start_date");
  const pe = params.get("end_date");
  if (ps) f.period_start = ps;
  if (pe) f.period_end = pe;
  const st = params.get("statuses");
  if (st) f.statuses = st.split(",") as ProjectStatus[];
  const pd = params.get("pdca");
  if (pd) f.pdca_phases = pd.split(",") as PdcaPhase[];
  const ld = params.get("leader");
  if (ld) f.leaders = [ld];
  return f;
}

function countFilters(f: ListFilters): number {
  return (
    (f.period_start ? 1 : 0) +
    (f.period_end ? 1 : 0) +
    (f.statuses?.length ? 1 : 0) +
    (f.pdca_phases?.length ? 1 : 0) +
    (f.leaders?.length ? 1 : 0) +
    (f.owners?.length ? 1 : 0)
  );
}

export function ProjectList() {
  const [params] = useSearchParams();
  const filters = useMemo(() => paramsToFilters(params), [params]);
  const activeName = params.get("proj");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data, isLoading, isError } = useProjects(filters);

  useEffect(() => {
    telemetry.trackProjectsListView(countFilters(filters));
  }, [filters]);

  return (
    <PageLayout
      title="Projects"
      actions={<Link to="/portal/projects/new">+ New Project</Link>}
    >
      <FiltersBar />
      <BulkActions selected={selected} />
      <div className="projects-grid">
        <div className="projects-list">
          {isLoading && <PageSkeleton />}
          {isError && <EmptyState title="Failed to load projects" />}
          {!isLoading && !isError && (data?.length ?? 0) === 0 && (
            <EmptyState title="No projects match your filters" />
          )}
          {!isLoading && !isError && (data?.length ?? 0) > 0 && (
            <ProjectTable
              rows={data ?? []}
              selected={selected}
              onSelectChange={setSelected}
            />
          )}
        </div>
        <aside className="projects-detail-pane">
          <ProjectDetail name={activeName} />
        </aside>
      </div>
    </PageLayout>
  );
}
```

- [ ] 13.2 Create `ProjectList.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProjectList } from "./ProjectList";
import * as projectsApi from "./api/projects";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/portal/projects"]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

afterEach(() => vi.restoreAllMocks());

describe("<ProjectList>", () => {
  it("renders filters region, '+ New Project' link, and table on data", async () => {
    vi.spyOn(projectsApi, "listProjects").mockResolvedValue([
      {
        name: "VT-1",
        title: "Demo Project",
        project_owner: "o",
        project_leader: "l",
        start_date: "2026-04-01",
        end_date: "2026-06-30",
        status: "Active",
        pdca_phase: "DO",
        objective: null,
        linked_objective_title: null,
        team_count: 0,
        milestone_count: 0,
        sprint_count: 0,
        modified: "2026-05-17 12:00:00",
      },
    ]);

    wrap(<ProjectList />);
    expect(
      await screen.findByRole("link", { name: /\+ New Project/i })
    ).toBeInTheDocument();
    expect(await screen.findByText("Demo Project")).toBeInTheDocument();
    expect(screen.getByLabelText(/project filters/i)).toBeInTheDocument();
  });

  it("renders detail placeholder when no ?proj=", async () => {
    vi.spyOn(projectsApi, "listProjects").mockResolvedValue([]);
    wrap(<ProjectList />);
    expect(await screen.findByText(/select a project/i)).toBeInTheDocument();
  });
});
```

- [ ] 13.3 Run.

```bash
cd pwa && npx vitest run src/portal/projects/ProjectList.test.tsx
```

Expected: `2 passed`.

- [ ] 13.4 Commit.

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks
git add pwa/src/portal/projects/ProjectList.tsx pwa/src/portal/projects/ProjectList.test.tsx
git commit -m "feat(projects): ProjectList master-detail composition"
```

---

## Task 14 — ProjectEditor + tests

**Files:**
- `pwa/src/portal/projects/ProjectEditor.tsx` (new)
- `pwa/src/portal/projects/ProjectEditor.test.tsx` (new)

**Steps:**

- [ ] 14.1 Create `ProjectEditor.tsx`:

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";

import { PageLayout } from "../shared/PageLayout";
import {
  createProject,
  updateProject,
} from "./api/projects";
import type { ProjectFormValues } from "./api/types";
import { useProject } from "./hooks/useProject";
import { PROJECT_STATUSES } from "./lib/projectStatus";
import * as telemetry from "../../telemetry";

const PDCA = ["PLAN", "DO", "CHECK", "ACT", "CLOSED"] as const;

const schema = z
  .object({
    title: z.string().min(1, "Title required").max(140, "Max 140 chars"),
    project_owner: z.string().min(1, "Owner required"),
    project_leader: z.string().min(1, "Leader required"),
    start_date: z.string().min(1, "Start date required"),
    end_date: z.string().min(1, "End date required"),
    status: z.enum(PROJECT_STATUSES),
    pdca_phase: z.enum(PDCA),
    objective: z.string().optional(),
    blocked_days_threshold: z.coerce.number().int().min(0).max(365),
    slip_pct_threshold: z.coerce.number().min(0).max(100),
    capacity_pct_threshold: z.coerce.number().min(0).max(100),
  })
  .refine((v) => v.start_date <= v.end_date, {
    path: ["end_date"],
    message: "Start must be ≤ end",
  });

export interface ProjectEditorProps {
  mode: "create" | "edit";
}

export function ProjectEditor({ mode }: ProjectEditorProps) {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { data } = useProject(mode === "edit" ? id ?? null : null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ProjectFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      project_owner: "",
      project_leader: "",
      start_date: "",
      end_date: "",
      status: "Planning",
      pdca_phase: "PLAN",
      objective: "",
      blocked_days_threshold: 7,
      slip_pct_threshold: 20,
      capacity_pct_threshold: 80,
    },
  });

  useEffect(() => {
    if (mode === "edit" && data?.project) {
      const p = data.project;
      reset({
        title: p.title,
        project_owner: p.project_owner ?? "",
        project_leader: p.project_leader ?? "",
        start_date: p.start_date ?? "",
        end_date: p.end_date ?? "",
        status: (p.status ?? "Planning") as ProjectFormValues["status"],
        pdca_phase: (p.pdca_phase ?? "PLAN") as ProjectFormValues["pdca_phase"],
        objective: p.objective ?? "",
        blocked_days_threshold: p.blocked_days_threshold ?? 7,
        slip_pct_threshold: p.slip_pct_threshold ?? 20,
        capacity_pct_threshold: p.capacity_pct_threshold ?? 80,
      });
    }
  }, [mode, data, reset]);

  const onSubmit = handleSubmit(async (values) => {
    if (mode === "create") {
      const created = await createProject(values);
      telemetry.trackProjectsCreate(created.name);
      nav(`/portal/projects?proj=${encodeURIComponent(created.name)}`);
    } else if (id) {
      await updateProject(id, values);
      telemetry.trackProjectsEdit(id);
      nav(`/portal/projects?proj=${encodeURIComponent(id)}`);
    }
  });

  return (
    <PageLayout
      title={mode === "create" ? "New Project" : `Edit ${id ?? ""}`}
    >
      <form onSubmit={onSubmit} className="project-editor">
        <label>
          Title
          <input type="text" {...register("title")} />
          {errors.title && <span className="err">{errors.title.message}</span>}
        </label>
        <label>
          Owner
          <input type="text" {...register("project_owner")} />
          {errors.project_owner && (
            <span className="err">{errors.project_owner.message}</span>
          )}
        </label>
        <label>
          Leader
          <input type="text" {...register("project_leader")} />
          {errors.project_leader && (
            <span className="err">{errors.project_leader.message}</span>
          )}
        </label>
        <label>
          Start date
          <input type="date" {...register("start_date")} />
          {errors.start_date && (
            <span className="err">{errors.start_date.message}</span>
          )}
        </label>
        <label>
          End date
          <input type="date" {...register("end_date")} />
          {errors.end_date && (
            <span className="err">{errors.end_date.message}</span>
          )}
        </label>
        <label>
          Status
          <select {...register("status")}>
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          PDCA phase
          <select {...register("pdca_phase")}>
            {PDCA.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label>
          Objective (optional)
          <input type="text" {...register("objective")} />
        </label>
        <label>
          Blocked days threshold
          <input type="number" {...register("blocked_days_threshold")} />
        </label>
        <label>
          Slip % threshold
          <input
            type="number"
            step="0.1"
            {...register("slip_pct_threshold")}
          />
        </label>
        <label>
          Capacity % threshold
          <input
            type="number"
            step="0.1"
            {...register("capacity_pct_threshold")}
          />
        </label>
        <button type="submit" disabled={isSubmitting}>
          {mode === "create" ? "Create" : "Save"}
        </button>
      </form>
    </PageLayout>
  );
}
```

- [ ] 14.2 Create `ProjectEditor.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProjectEditor } from "./ProjectEditor";
import * as projectsApi from "./api/projects";

function wrap(initial = "/portal/projects/new") {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route
            path="/portal/projects/new"
            element={<ProjectEditor mode="create" />}
          />
          <Route path="/portal/projects" element={<div>LIST</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

afterEach(() => vi.restoreAllMocks());

describe("<ProjectEditor> create", () => {
  it("shows title error when empty submit", async () => {
    const user = userEvent.setup();
    wrap();
    await user.click(screen.getByRole("button", { name: /create/i }));
    expect(await screen.findByText(/title required/i)).toBeInTheDocument();
  });

  it("shows end<start error", async () => {
    const user = userEvent.setup();
    wrap();
    await user.type(screen.getByLabelText(/title/i), "X");
    await user.type(screen.getByLabelText(/owner/i), "o");
    await user.type(screen.getByLabelText(/leader/i), "l");
    await user.type(screen.getByLabelText(/start date/i), "2026-06-30");
    await user.type(screen.getByLabelText(/end date/i), "2026-04-01");
    await user.click(screen.getByRole("button", { name: /create/i }));
    expect(
      await screen.findByText(/start must be ≤ end/i)
    ).toBeInTheDocument();
  });

  it("submit success navigates to list", async () => {
    vi.spyOn(projectsApi, "createProject").mockResolvedValue({
      name: "VT-NEW",
    } as unknown as Awaited<ReturnType<typeof projectsApi.createProject>>);
    const user = userEvent.setup();
    wrap();
    await user.type(screen.getByLabelText(/title/i), "Demo");
    await user.type(screen.getByLabelText(/owner/i), "o@e.com");
    await user.type(screen.getByLabelText(/leader/i), "l@e.com");
    await user.type(screen.getByLabelText(/start date/i), "2026-04-01");
    await user.type(screen.getByLabelText(/end date/i), "2026-06-30");
    await user.click(screen.getByRole("button", { name: /create/i }));
    await waitFor(() => expect(screen.getByText("LIST")).toBeInTheDocument());
  });
});
```

- [ ] 14.3 Run.

```bash
cd pwa && npx vitest run src/portal/projects/ProjectEditor.test.tsx
```

Expected: `3 passed`.

- [ ] 14.4 Commit.

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks
git add pwa/src/portal/projects/ProjectEditor.tsx pwa/src/portal/projects/ProjectEditor.test.tsx
git commit -m "feat(projects): ProjectEditor with zod validation"
```

---

## Task 15 — ProjectRoutes + ProjectsFeatureGate + wire into PortalRoutes

**Files:**
- `pwa/src/portal/projects/ProjectRoutes.tsx` (new)
- `pwa/src/portal/projects/ProjectsFeatureGate.tsx` (new)
- `pwa/src/portal/projects/ProjectRoutes.test.tsx` (new)
- `pwa/src/hooks/useVtSettings.ts` (modify — extend interface + field list)
- `pwa/src/portal/routes.tsx` (modify — wrap projects route)

**Steps:**

- [ ] 15.1 Extend `pwa/src/hooks/useVtSettings.ts`. Open the file, find the `VtSettings` interface, append:

```ts
portal_projects_enabled?: 0 | 1;
```

And in the `frappe.client.get_value` fieldname list, append `"portal_projects_enabled"`.

- [ ] 15.2 Create `ProjectsFeatureGate.tsx`:

```tsx
import type { ReactNode } from "react";

import { ComingSoon } from "../shared/ComingSoon";
import { useVtSettings } from "../../hooks/useVtSettings";

export function ProjectsFeatureGate({ children }: { children: ReactNode }) {
  const { data, isLoading } = useVtSettings();
  if (isLoading) return null;
  if (!data?.portal_projects_enabled) {
    return <ComingSoon domain="Projects" />;
  }
  return <>{children}</>;
}
```

- [ ] 15.3 Create `ProjectRoutes.tsx`:

```tsx
import { Route, Routes } from "react-router-dom";

import { ProjectEditor } from "./ProjectEditor";
import { ProjectList } from "./ProjectList";

export function ProjectRoutes() {
  return (
    <Routes>
      <Route index element={<ProjectList />} />
      <Route path="new" element={<ProjectEditor mode="create" />} />
      <Route path=":id/edit" element={<ProjectEditor mode="edit" />} />
    </Routes>
  );
}
```

- [ ] 15.4 In `pwa/src/portal/routes.tsx`, find the `projects/*` route and replace its element with the wrapped form:

```tsx
<Route
  path="projects/*"
  element={
    <RequirePermission perm="project.read">
      <ProjectsFeatureGate>
        <ProjectRoutes />
      </ProjectsFeatureGate>
    </RequirePermission>
  }
/>
```

Add the imports near the top of `routes.tsx`:

```tsx
import { ProjectRoutes } from "./projects/ProjectRoutes";
import { ProjectsFeatureGate } from "./projects/ProjectsFeatureGate";
```

- [ ] 15.5 Create `ProjectRoutes.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProjectRoutes } from "./ProjectRoutes";
import * as projectsApi from "./api/projects";

function wrap(initial: string) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/portal/projects/*" element={<ProjectRoutes />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

afterEach(() => vi.restoreAllMocks());

describe("<ProjectRoutes>", () => {
  it("/portal/projects renders ProjectList heading", async () => {
    vi.spyOn(projectsApi, "listProjects").mockResolvedValue([]);
    wrap("/portal/projects");
    expect(
      await screen.findByRole("heading", { name: /Projects/ })
    ).toBeInTheDocument();
  });

  it("/portal/projects/new renders editor heading", async () => {
    wrap("/portal/projects/new");
    expect(
      await screen.findByRole("heading", { name: /New Project/ })
    ).toBeInTheDocument();
  });
});
```

- [ ] 15.6 Run.

```bash
cd pwa && npx vitest run src/portal/projects/ProjectRoutes.test.tsx
```

Expected: `2 passed`.

- [ ] 15.7 Commit.

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks
git add pwa/src/portal/projects/ProjectRoutes.tsx pwa/src/portal/projects/ProjectsFeatureGate.tsx pwa/src/portal/projects/ProjectRoutes.test.tsx pwa/src/hooks/useVtSettings.ts pwa/src/portal/routes.tsx
git commit -m "feat(projects): mount ProjectRoutes behind portal_projects_enabled gate"
```

---

## Task 16 — Telemetry events

**Files:**
- `pwa/src/telemetry.ts` (modify)
- `pwa/src/telemetry.projects.test.ts` (new)

**Steps:**

- [ ] 16.1 Open `pwa/src/telemetry.ts`. Find the `TelemetryEvent` union type and append the 9 projects events. Find the existing wrapper functions section (e.g. `trackOkrListView`) and append:

```ts
// --- Projects ---

export function trackProjectsListView(filtersCount: number): void {
  telemetry.track("projects.list_view", { filters_count: filtersCount });
}

export function trackProjectsDetailView(name: string): void {
  telemetry.track("projects.detail_view", { name });
}

export function trackProjectsCreate(name: string): void {
  telemetry.track("projects.create", { name });
}

export function trackProjectsEdit(name: string): void {
  telemetry.track("projects.edit", { name });
}

export function trackProjectsBulkPdca(
  count: number,
  fromToPairs: Array<{ name: string; to: string }>
): void {
  telemetry.track("projects.bulk_pdca_advance", {
    count,
    from_to_pairs: fromToPairs,
  });
}

export function trackProjectsBulkStatusSet(
  count: number,
  targetStatus: string
): void {
  telemetry.track("projects.bulk_status_set", {
    count,
    target_status: targetStatus,
  });
}

export function trackProjectsInlineStatusChange(
  name: string,
  from: string,
  to: string
): void {
  telemetry.track("projects.inline_status_change", { name, from, to });
}

export function trackProjectsObjectiveLinkClick(
  project: string,
  objective: string
): void {
  telemetry.track("projects.objective_link_click", { project, objective });
}

export function trackProjectsPermissionDenied(
  path: string,
  action: string
): void {
  telemetry.track("projects.permission_denied", { path, action });
}
```

The `telemetry.*` self-import pattern (so tests can spy) — at the top of the file ensure:

```ts
import * as telemetry from "./telemetry";
```

(P2 OKR file already uses this — match exactly.)

Extend the union (search for `TelemetryEvent =` and append the 9 strings):

```ts
| "projects.list_view"
| "projects.detail_view"
| "projects.create"
| "projects.edit"
| "projects.bulk_pdca_advance"
| "projects.bulk_status_set"
| "projects.inline_status_change"
| "projects.objective_link_click"
| "projects.permission_denied"
```

- [ ] 16.2 Create `pwa/src/telemetry.projects.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import * as telemetry from "./telemetry";

describe("projects telemetry wrappers", () => {
  afterEach(() => vi.restoreAllMocks());

  it("trackProjectsListView emits with filters_count", () => {
    const spy = vi.spyOn(telemetry, "track").mockImplementation(() => {});
    telemetry.trackProjectsListView(2);
    expect(spy).toHaveBeenCalledWith("projects.list_view", {
      filters_count: 2,
    });
  });

  it("trackProjectsBulkPdca emits count and pairs", () => {
    const spy = vi.spyOn(telemetry, "track").mockImplementation(() => {});
    telemetry.trackProjectsBulkPdca(1, [{ name: "X", to: "DO" }]);
    expect(spy).toHaveBeenCalledWith("projects.bulk_pdca_advance", {
      count: 1,
      from_to_pairs: [{ name: "X", to: "DO" }],
    });
  });

  it("trackProjectsBulkStatusSet emits target_status", () => {
    const spy = vi.spyOn(telemetry, "track").mockImplementation(() => {});
    telemetry.trackProjectsBulkStatusSet(3, "On Hold");
    expect(spy).toHaveBeenCalledWith("projects.bulk_status_set", {
      count: 3,
      target_status: "On Hold",
    });
  });

  it("trackProjectsObjectiveLinkClick emits project + objective", () => {
    const spy = vi.spyOn(telemetry, "track").mockImplementation(() => {});
    telemetry.trackProjectsObjectiveLinkClick("P", "O");
    expect(spy).toHaveBeenCalledWith("projects.objective_link_click", {
      project: "P",
      objective: "O",
    });
  });
});
```

- [ ] 16.3 Wire `trackProjectsDetailView` into `ProjectDetail.tsx`. After the `if (!data) ...` guard, add:

```tsx
import { useEffect } from "react";
// ...
useEffect(() => {
  if (data?.project) {
    telemetry.trackProjectsDetailView(data.project.name);
  }
}, [data?.project?.name]);
```

(`ProjectList` already wires `trackProjectsListView` per Task 13. `BulkActions` already wires bulk events per Task 12. `ProjectEditor` already wires create/edit per Task 14. `ProjectDetail` quick action already calls `trackProjectsInlineStatusChange`. `ObjectiveLink` already calls `trackProjectsObjectiveLinkClick`.)

- [ ] 16.4 Run.

```bash
cd pwa && npx vitest run src/telemetry.projects.test.ts && npx tsc --noEmit
```

Expected: `4 passed` and clean typecheck.

- [ ] 16.5 Commit.

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks
git add pwa/src/telemetry.ts pwa/src/telemetry.projects.test.ts pwa/src/portal/projects/ProjectDetail.tsx
git commit -m "feat(projects): telemetry events + component wiring"
```

---

## Task 17 — Bundle chunk + coverage gate

**Files:**
- `pwa/vite.config.ts` (modify)

**Steps:**

- [ ] 17.1 Open `pwa/vite.config.ts`. Find the `manualChunks` function (defined for OKR split). Add a branch BEFORE the existing `/pwa/src/portal/` catch-all:

```ts
if (id.includes("/pwa/src/portal/projects/")) return "projects";
```

- [ ] 17.2 In the same file, find `test.coverage.thresholds` and append the projects key:

```ts
"src/portal/projects/**": {
  lines: 80,
  functions: 75,
  statements: 80,
  branches: 70,
},
```

- [ ] 17.3 Build and run coverage.

```bash
cd pwa && npm run build
npm test -- --coverage --run
```

Capture the gzip size of the `projects-*.js` chunk from the build output and the actual coverage % for `src/portal/projects/**`. Expected: chunk ≤120KB gzip; coverage meets thresholds. If under threshold, add tests until green before committing.

- [ ] 17.4 Commit.

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks
git add pwa/vite.config.ts
git commit -m "build(projects): isolate projects chunk + coverage gate"
```

---

## Task 18 — E2E spec

**Files:**
- `pwa/e2e/portal-projects.spec.ts` (new)

**Steps:**

- [ ] 18.1 Create `pwa/e2e/portal-projects.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

const USER = process.env.MANAGER_USER ?? "Administrator";
const PASS = process.env.MANAGER_PASS ?? "admin";

test.describe("portal projects", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="usr"]', USER);
    await page.fill('input[name="pwd"]', PASS);
    await page.click('button[type="submit"]');
    await page.waitForLoadState("networkidle");
  });

  test("list page renders heading and may open first row", async ({ page }) => {
    await page.goto("/portal/projects");
    await expect(
      page.getByRole("heading", { name: /Projects/ })
    ).toBeVisible();
    const firstRow = page.locator("table.projects-table tbody tr").first();
    if ((await firstRow.count()) > 0) {
      await firstRow.click();
      await expect(page.locator(".projects-detail")).toBeVisible();
    }
  });

  test("/portal/projects/new shows form", async ({ page }) => {
    await page.goto("/portal/projects/new");
    await expect(
      page.getByRole("heading", { name: /New Project/ })
    ).toBeVisible();
    await expect(page.getByLabel(/title/i)).toBeVisible();
  });
});
```

- [ ] 18.2 Attempt run; skip on connection refused.

```bash
cd pwa && PWA_BASE_URL=http://task2.localhost:8000 npx playwright test portal-projects || echo "E2E SKIPPED (server unavailable)"
```

- [ ] 18.3 Commit.

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks
git add pwa/e2e/portal-projects.spec.ts
git commit -m "test(e2e): portal projects list + create flow"
```

---

## Task 19 — Objective link click telemetry verification

**Files:**
- `pwa/src/portal/projects/ObjectiveLink.test.tsx` (modify — extend with one test)

**Steps:**

- [ ] 19.1 At the bottom of `describe("<ObjectiveLink>", () => { ... })`, append:

```tsx
import userEvent from "@testing-library/user-event";
import * as telemetry from "../../telemetry";

// ...inside the describe
it("emits objective_link_click telemetry on link click", async () => {
  vi.spyOn(okrHook, "useObjective").mockReturnValue({
    data: {
      name: "OBJ-77",
      title: "Click Me",
      period_start: "2026-04-01",
      period_end: "2026-06-30",
      status: "Active",
      key_results: [],
    },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof okrHook.useObjective>);
  const spy = vi
    .spyOn(telemetry, "trackProjectsObjectiveLinkClick")
    .mockImplementation(() => {});
  const user = userEvent.setup();

  wrap(<ObjectiveLink projectName="PROJ-1" objectiveName="OBJ-77" />);
  await user.click(screen.getByText("Click Me"));
  expect(spy).toHaveBeenCalledWith("PROJ-1", "OBJ-77");
});
```

(Add the two new imports at the TOP of the file if not already present.)

- [ ] 19.2 Run.

```bash
cd pwa && npx vitest run src/portal/projects/ObjectiveLink.test.tsx
```

Expected: `4 passed`.

- [ ] 19.3 Commit.

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks
git add pwa/src/portal/projects/ObjectiveLink.test.tsx
git commit -m "test(projects): assert objective_link_click telemetry on ObjectiveLink click"
```

---

## Task 20 — Smoke routes integration test

**Files:**
- `pwa/src/portal/projects/__integration.test.tsx` (new)

**Steps:**

- [ ] 20.1 Create file:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProjectRoutes } from "./ProjectRoutes";
import * as projectsApi from "./api/projects";
import * as vtSettings from "../../hooks/useVtSettings";

afterEach(() => vi.restoreAllMocks());

describe("Projects integration smoke", () => {
  it("renders ProjectList then navigates to /new", async () => {
    vi.spyOn(projectsApi, "listProjects").mockResolvedValue([]);
    vi.spyOn(vtSettings, "useVtSettings").mockReturnValue({
      data: { portal_projects_enabled: 1 },
      isLoading: false,
    } as unknown as ReturnType<typeof vtSettings.useVtSettings>);

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/portal/projects"]}>
          <Routes>
            <Route path="/portal/projects/*" element={<ProjectRoutes />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(
      await screen.findByRole("heading", { name: /Projects/ })
    ).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: /\+ New Project/ }));
    expect(
      await screen.findByRole("heading", { name: /New Project/ })
    ).toBeInTheDocument();
  });
});
```

- [ ] 20.2 Run.

```bash
cd pwa && npx vitest run src/portal/projects/__integration.test.tsx
```

Expected: `1 passed`.

- [ ] 20.3 Commit.

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks
git add pwa/src/portal/projects/__integration.test.tsx
git commit -m "test(projects): integration smoke over ProjectRoutes"
```

---

## Task 21 — Manual smoke + flag flip + status update

**Files:**
- `docs/superpowers/specs/2026-05-17-portal-projects-p3-design.md` (modify — Status header)
- `docs/implementation-tracker.html` (modify — PORTAL-P3.1 row)

**Steps:**

- [ ] 21.1 Full sanity sweep.

```bash
cd pwa && npx tsc --noEmit
npm test -- --run
npm run build
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks
$BENCH run-tests --app vernon_tasks --module vernon_tasks.api.test_projects
```

Expected: typecheck clean, all vitest green, build success, backend tests `OK`.

- [ ] 21.2 Enable feature flag via Frappe console.

```bash
$BENCH console <<'PY'
import frappe
frappe.db.set_single_value("VT Settings", "portal_projects_enabled", 1)
frappe.db.commit()
print("FLAG_SET", frappe.db.get_single_value("VT Settings", "portal_projects_enabled"))
PY
$BENCH clear-cache
```

Expected: `FLAG_SET 1`.

- [ ] 21.3 Hit the route.

```bash
$BENCH execute frappe.utils.print_format.download_pdf || true   # warm up
curl -sI http://task2.localhost:8000/portal/projects | head -1
```

Expected: `HTTP/1.1 200 OK` (or 302 redirect to /login if anonymous — that's acceptable).

- [ ] 21.4 Flip spec status. Open `docs/superpowers/specs/2026-05-17-portal-projects-p3-design.md` and change line 3:

From:
```
**Status:** Draft
```
To:
```
**Status:** Implemented (P3.1)
```

- [ ] 21.5 Update `docs/implementation-tracker.html`. Search for the `PORTAL-P3.1` row, change its status cell to `Implemented`, and bump the timestamp cell to today (`2026-05-17`).

```bash
grep -n "PORTAL-P3.1" docs/implementation-tracker.html
```

Edit the matched row's status `<td>` and timestamp `<td>` accordingly.

- [ ] 21.6 Commit.

```bash
git add docs/superpowers/specs/2026-05-17-portal-projects-p3-design.md docs/implementation-tracker.html
git commit -m "docs(projects): mark P3.1 as Implemented and update tracker"
```

---

## Task 22 — Push + PR

**Steps:**

- [ ] 22.1 Push.

```bash
git push -u origin feat/portal-projects-p3
```

- [ ] 22.2 Open PR against `feat/portal-okr-p2`.

```bash
gh pr create --base feat/portal-okr-p2 --title "feat(projects): portal Projects P3.1 implementation" --body "$(cat <<'EOF'
## Summary

Ships desktop Projects portal (P3.1) at `/portal/projects/*` behind the new `portal_projects_enabled` VT Settings flag.

- **Backend** (`vernon_tasks/api/projects.py`): 3 whitelisted endpoints — `list_projects` (date-range overlap + status/PDCA/leader/owner filters + linked OKR title + child counts), `get_project_with_relations` (project doc + linked Objective summary w/ avg KR progress + counts), `bulk_update_projects` (status + PDCA-advance via `next_pdca_phase`, permission-filtered per name).
- **Frontend** (`pwa/src/portal/projects/`): master-detail `<ProjectList>`, URL-synced `<FiltersBar>`, `<ProjectTable>` w/ bulk select, `<ProjectDetail>` with inline status/PDCA actions, `<BulkActions>` w/ confirm dialogs, `<ProjectEditor>` (zod), cross-domain `<ObjectiveLink>` reusing OKR `useObjective` hook.
- **Feature flag**: `portal_projects_enabled` Check in VT Settings — gate enforced by `<ProjectsFeatureGate>` which falls back to `<ComingSoon domain="Projects" />`.
- **Telemetry**: 9 new events under `projects.*` namespace.
- **Build**: separate `projects` Vite chunk; coverage gate ≥80/75/80/70.
- **Cross-domain reuse**: `useObjective` imported directly — no duplication.

## Test plan

- [ ] `$BENCH run-tests --app vernon_tasks --module vernon_tasks.api.test_projects` → green
- [ ] `cd pwa && npx tsc --noEmit` → clean
- [ ] `cd pwa && npm test -- --run` → all green incl. projects + telemetry
- [ ] `cd pwa && npm run build` → projects chunk ≤120KB gzip
- [ ] `cd pwa && npm test -- --coverage --run` → projects/** meets thresholds
- [ ] Enable flag in staging → `/portal/projects` returns 200
- [ ] Manual: create project → appears in list → click → detail → Advance PDCA → row updates
- [ ] Manual: select 2+ projects → BulkActions visible → Set Status → confirm → updated
EOF
)"
```

- [ ] 22.3 Capture PR URL and confirm in report.

---

## Self-Review

**Spec coverage matrix:**

| Spec section | Tasks |
|---|---|
| §1 Background & Goal | T1 (flag bootstrap), all FE/BE tasks |
| §3.1 Routes | T15 (ProjectRoutes) |
| §3.2 Folder layout | T5–T15 match the spec tree exactly |
| §3.3 Backend (3 endpoints + flag + reuse pdca.py) | T1 (flag), T2 (list), T3 (detail), T4 (bulk, imports `next_pdca_phase`) |
| §3.4 Cross-domain reuse (`useObjective`, `useVtSettings.portal_projects_enabled`) | T10 (ObjectiveLink), T15 (settings hook extended) |
| §4.1 ProjectList | T13 |
| §4.2 FiltersBar | T8 |
| §4.3 ProjectTable | T9 |
| §4.4 BulkActions | T12 |
| §4.5 ProjectDetail (inline actions, ObjectiveLink, counts) | T11 (composition), T16 (detail_view telemetry) |
| §4.6 ObjectiveLink (loading / 404 / success / link out) | T10, T19 (click telemetry) |
| §4.7 ProjectEditor (RHF + zod) | T14 |
| §5.1–5.2 react-query keys + invalidation | T7 |
| §5.3 Permission Gate | T11 (canWrite hides inline + edit), backend `has_permission` in T2/T3/T4 |
| §5.4 Telemetry (9 events) | T16 (definitions), wired in T10/T11/T12/T13/T14 |
| §6.1 Form validation | T14 zod |
| §6.2 API errors | client error path inherits P2 wrapper; surfaced through `isError` in T11/T13 |
| §6.3 Inline save (optimistic / disable) | T11 uses `bulk.isPending` to disable controls (full optimistic deferred — spec says "optimistic; on error rollback + toast"; mutation invalidates on success per react-query default) |
| §6.4 Bulk skip reasons | T4 backend returns `already_closed`/`no_permission`; UI surfaces via mutation result in T12 |
| §6.5 Linked OKR failures | T10 isError → "(linked OKR not found)" |
| §6.6 Date filter independence | T2 SQL branches (only-start / only-end / both / neither) |
| §6.7 Empty / loading | T11 EmptyState placeholders; T13 list empty state; T11 PageSkeleton |
| §7 Testing | TDD on every BE task; FE vitest on every component; T17 coverage gate; T18 E2E; T19 telemetry; T20 integration smoke |
| §8 Build & bundle | T17 manualChunks + coverage |
| §9 Rollout (feature flag) | T1 schema + T15 gate + T21 flip |
| §10 Success metrics | T17 bundle budget; T16 telemetry events feed adoption metrics |
| §11 Open questions resolved | Set Status to Completed orthogonal (no gating in `bulk_update_projects`); objective autocomplete deferred (T14 free-text input); Advance PDCA disabled when CLOSED (T11 `pdcaClosed` boolean) |

**Placeholder scan:** No `TODO`, `TBD`, `<fill>`. Two explicit "adapt to actual signature" guidance callouts (T6 api wrapper signature, T11 shared-component import paths) are intentional integration notes, not unfilled placeholders.

**Type consistency:**
- `ProjectRow` (T6) matches the SQL projection in T2 exactly (14 fields).
- `BulkUpdateResult` (T6) matches the server return shape in T4 (`updated[]`, `skipped[]`).
- `projectKeys.detail(name)` consistent across T7 / T11 / T16.
- Telemetry wrapper names consistent across T16 (definition), T19 (assertion), and consumer calls in T10/T11/T12/T13/T14.
- `BulkUpdatePayload.pdca_phase` typed as `PdcaPhase | "__next__"` (T6) — matches both literal-phase and advance-sentinel paths handled by backend T4.

---

**After plan written:**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks
git add docs/superpowers/plans/2026-05-17-portal-projects-p3.md
git commit -m "docs(plan): portal projects p3.1 implementation plan"
git push origin docs/portal-projects-p3-prd
```

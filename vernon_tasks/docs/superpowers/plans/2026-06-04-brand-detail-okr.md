# Brand Detail Page — OKR per Period — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking a brand card on `/app/vt-brands` opens a new `vt-brand-detail` desk Page that lists the brand's Objectives grouped by period (newest first) with their Key Results, and supports inline create/edit of Objectives and Key Results via dialogs.

**Architecture:** A new desk Page (`vt-brand-detail`) mirrors the `vt-project-detail` pattern (hero + body, IIFE-wrapped script, route param). A read endpoint (`brand_okr.get_brand_okr`) returns objectives grouped by period; thin mutation endpoints (`brand_okr_mutations.*`) delegate all validation to the existing `Objective` / `Key Result` controllers. PDCA transitions and deletes stay on the native form.

**Tech Stack:** Frappe Framework (Python controllers + `@frappe.whitelist()` endpoints), Frappe Desk Page JS (jQuery + `frappe.ui.Dialog`), `FrappeTestCase`.

**Spec:** `docs/superpowers/specs/2026-06-04-brand-detail-okr-design.html`

**Test runner:** bench runs inside Docker — prefix every test command with
`docker exec frappe-backend-1 bench --site task.localhost ...`.

**Schema recap (already exists, do NOT modify):**
- `Objective`: `title` (Data, reqd), `brand` (Link VT Brand, reqd), `period` (Data, reqd — grammar `YYYY` / `YYYY-Hn` / `YYYY-Qn` / `YYYY-MM`), `period_start`/`period_end` (Date, auto-filled by controller), `objective_owner` (Link User), `status` (Select: Open/On Track/At Risk/Closed), `pdca_phase` (Select: PLAN/DO/CHECK/ACT/CLOSED), `description` (Long Text). Controller auto-fills period dates + guards PDCA transitions.
- `Key Result`: `objective` (Link Objective), `metric` (Data, reqd), `target_value` (Float, must be > 0), `current_value` (Float ≥ 0), `unit` (Data), `progress_percent` (Percent, controller-computed), `confidence` (Percent 0–100), `confidence_last_week` (Percent, system).

---

### Task 1: Desk Page scaffold (`vt-brand-detail`)

Creates the empty page + role gating + test, and registers it in the DB. JS body comes in Task 4.

**Files:**
- Create: `task/page/vt_brand_detail/__init__.py`
- Create: `task/page/vt_brand_detail/vt_brand_detail.json`
- Create: `task/page/vt_brand_detail/vt_brand_detail.js`
- Test: `task/page/vt_brand_detail/test_vt_brand_detail.py`

- [ ] **Step 1: Create the package init**

`task/page/vt_brand_detail/__init__.py` — empty file:

```python
```

- [ ] **Step 2: Create the Page doc JSON**

`task/page/vt_brand_detail/vt_brand_detail.json`:

```json
{
 "creation": "2026-06-04 00:00:00.000000",
 "doctype": "Page",
 "module": "Task",
 "name": "vt-brand-detail",
 "page_name": "vt-brand-detail",
 "standard": "Yes",
 "system_page": 1,
 "roles": [
  {"role": "VT Member"},
  {"role": "VT Leader"},
  {"role": "VT Manager"}
 ],
 "title": "Brand"
}
```

- [ ] **Step 3: Create a placeholder JS (replaced in Task 4)**

`task/page/vt_brand_detail/vt_brand_detail.js`:

```javascript
(function () {
/* vt_brand_detail.js — placeholder; full implementation lands in Task 4. */
frappe.pages["vt-brand-detail"].on_page_load = function (wrapper) {
    frappe.ui.make_app_page({ parent: wrapper, title: __("Brand"), single_column: true });
};
})();
```

- [ ] **Step 4: Write the page test**

`task/page/vt_brand_detail/test_vt_brand_detail.py`:

```python
# Tests for vt-brand-detail desk Page (per-brand OKR surface).
import frappe
import unittest

PAGE_NAME = "vt-brand-detail"
EXPECTED_ROLES = {"VT Member", "VT Leader", "VT Manager"}


class TestVtBrandDetailPage(unittest.TestCase):
    def test_page_exists(self):
        self.assertTrue(frappe.db.exists("Page", PAGE_NAME))

    def test_page_route_name(self):
        page = frappe.get_doc("Page", PAGE_NAME)
        self.assertEqual(page.page_name, PAGE_NAME)

    def test_role_gating(self):
        page = frappe.get_doc("Page", PAGE_NAME)
        roles = {r.role for r in page.roles}
        self.assertEqual(roles, EXPECTED_ROLES)
```

- [ ] **Step 5: Migrate so the Page doc is created in the DB**

Run: `docker exec frappe-backend-1 bench --site task.localhost migrate`
Expected: completes without error; `Page vt-brand-detail` synced from disk.

- [ ] **Step 6: Run the page test to verify it passes**

Run: `docker exec frappe-backend-1 bench --site task.localhost run-tests --module vernon_tasks.task.page.vt_brand_detail.test_vt_brand_detail`
Expected: 3 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add task/page/vt_brand_detail/
git commit -m "feat(brand-okr): scaffold vt-brand-detail desk Page"
```

---

### Task 2: Read API — `brand_okr.get_brand_okr`

Returns the brand + objectives grouped by period (newest first) with batched Key Results. The grouping + aggregate helpers are pure (DB-free) so they unit-test without fixtures.

**Files:**
- Create: `brand/api/brand_okr.py`
- Test: `brand/api/test_brand_okr.py`

- [ ] **Step 1: Write the failing tests**

`brand/api/test_brand_okr.py`:

```python
import frappe
from frappe.tests.utils import FrappeTestCase

from vernon_tasks.brand.api import brand_okr

TEST_BRAND = "TestBrandOKR-Z"


class TestBrandOkrGrouping(FrappeTestCase):
    """Pure-function tests for the period grouping + aggregate helpers (no DB)."""

    def _obj(self, name, title, period, start, end):
        return {
            "name": name, "title": title, "status": "Open", "pdca_phase": "PLAN",
            "objective_owner": None, "period": period,
            "period_start": start, "period_end": end,
        }

    def test_groups_by_period_and_orders_blank_last(self):
        objectives = [
            self._obj("O1", "A", "2026-Q1", "2026-01-01", "2026-03-31"),
            self._obj("O2", "B", "2025-Q4", "2025-10-01", "2025-12-31"),
            self._obj("O3", "C", None, None, None),
        ]
        krs = {"O1": [{"target": 100.0, "current": 50.0, "progress_percent": 50.0}]}
        periods = brand_okr._group_by_period(objectives, krs)
        labels = [p["period"] for p in periods]
        self.assertEqual(labels, ["2026-Q1", "2025-Q4", brand_okr.NO_PERIOD_LABEL])
        self.assertEqual(periods[0]["objectives"][0]["progress"], 50.0)
        self.assertEqual(periods[0]["objectives"][0]["key_results"], krs["O1"])

    def test_aggregate_progress_ignores_zero_target(self):
        krs = [
            {"target": 0.0, "current": 5.0, "progress_percent": 0.0},
            {"target": 100.0, "current": 80.0, "progress_percent": 80.0},
        ]
        self.assertEqual(brand_okr._aggregate_progress(krs), 80.0)

    def test_aggregate_progress_empty_is_zero(self):
        self.assertEqual(brand_okr._aggregate_progress([]), 0.0)


class TestBrandOkrEndpoint(FrappeTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._cleanup()
        frappe.get_doc({"doctype": "VT Brand", "brand_name": TEST_BRAND}).insert(
            ignore_permissions=True
        )
        cls.obj_current = frappe.get_doc({
            "doctype": "Objective", "title": "Current Obj", "brand": TEST_BRAND,
            "period": "2026-Q2", "objective_owner": "Administrator",
            "status": "Open", "pdca_phase": "PLAN",
        }).insert(ignore_permissions=True)
        cls.obj_past = frappe.get_doc({
            "doctype": "Objective", "title": "Past Obj", "brand": TEST_BRAND,
            "period": "2025-Q1", "objective_owner": "Administrator",
            "status": "Open", "pdca_phase": "PLAN",
        }).insert(ignore_permissions=True)
        frappe.get_doc({
            "doctype": "Key Result", "objective": cls.obj_current.name,
            "metric": "Signups", "target_value": 100, "current_value": 40,
        }).insert(ignore_permissions=True)

    @classmethod
    def tearDownClass(cls):
        cls._cleanup()
        super().tearDownClass()

    @classmethod
    def _cleanup(cls):
        for obj in frappe.get_all("Objective", filters={"brand": TEST_BRAND}):
            for kr in frappe.get_all("Key Result", filters={"objective": obj.name}):
                frappe.delete_doc("Key Result", kr.name, force=True, ignore_permissions=True)
            frappe.delete_doc("Objective", obj.name, force=True, ignore_permissions=True)
        if frappe.db.exists("VT Brand", TEST_BRAND):
            frappe.delete_doc("VT Brand", TEST_BRAND, force=True, ignore_permissions=True)

    def setUp(self):
        frappe.set_user("Administrator")

    def test_returns_periods_newest_first(self):
        res = brand_okr.get_brand_okr(TEST_BRAND)
        self.assertEqual(res["brand"]["id"], TEST_BRAND)
        labels = [p["period"] for p in res["periods"]]
        self.assertEqual(labels, ["2026-Q2", "2025-Q1"])

    def test_key_results_attached_no_n_plus_1(self):
        res = brand_okr.get_brand_okr(TEST_BRAND)
        current = next(p for p in res["periods"] if p["period"] == "2026-Q2")
        krs = current["objectives"][0]["key_results"]
        self.assertEqual(len(krs), 1)
        self.assertEqual(krs[0]["target"], 100.0)
        self.assertEqual(krs[0]["current"], 40.0)

    def test_unknown_brand_raises(self):
        with self.assertRaises(frappe.DoesNotExistError):
            brand_okr.get_brand_okr("NoSuchBrand-XYZ")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker exec frappe-backend-1 bench --site task.localhost run-tests --module vernon_tasks.brand.api.test_brand_okr`
Expected: FAIL — `ModuleNotFoundError: No module named 'vernon_tasks.brand.api.brand_okr'`.

- [ ] **Step 3: Implement the read endpoint**

`brand/api/brand_okr.py`:

```python
"""Brand OKR read endpoint — objectives grouped by period for the brand detail page.

Layer: HTTP entrypoint (Layer 2, Priority 5 per vernon-dev Frappe Hooks-First).
Read-only aggregation; all write paths live in brand_okr_mutations.py and delegate
to the Objective / Key Result controllers.

Source of truth: docs/superpowers/specs/2026-06-04-brand-detail-okr-design.html
"""
from __future__ import annotations

from typing import Any

import frappe
from frappe.utils import getdate, today

from vernon_tasks.task.api.security import max_str, require_login

BRAND_DOCTYPE = "VT Brand"
OBJECTIVE_DOCTYPE = "Objective"
KEY_RESULT_DOCTYPE = "Key Result"
NO_PERIOD_LABEL = "Tanpa Period"
OBJECTIVE_FETCH_LIMIT = 500
KEY_RESULT_FETCH_LIMIT = 1000


@frappe.whitelist()
def get_brand_okr(brand_id: str) -> dict:
    """Return the brand header + its objectives grouped by period.

    Shape: see docs/superpowers/specs/2026-06-04-brand-detail-okr-design.html §2.2.
    Periods are ordered newest-first (objectives pre-sorted by period_start desc);
    objectives with a blank period fall into a trailing "Tanpa Period" bucket.
    """
    require_login()
    brand_id = max_str(brand_id, 140)
    if not brand_id or not frappe.db.exists(BRAND_DOCTYPE, brand_id):
        frappe.throw("Brand tidak ditemukan", frappe.DoesNotExistError)
    if not frappe.has_permission(BRAND_DOCTYPE, "read", brand_id):
        raise frappe.PermissionError

    brand = frappe.db.get_value(
        BRAND_DOCTYPE, brand_id,
        ["name", "brand_name", "logo", "description"], as_dict=True,
    )
    objectives = _read_objectives(brand_id)
    krs_by_obj = _read_key_results([o["name"] for o in objectives])
    return {
        "brand": {
            "id": brand["name"],
            "brand_name": brand.get("brand_name"),
            "logo": brand.get("logo"),
            "description": brand.get("description"),
            "can_edit": bool(frappe.has_permission(OBJECTIVE_DOCTYPE, "write")),
        },
        "can_create_objective": bool(frappe.has_permission(OBJECTIVE_DOCTYPE, "create")),
        "periods": _group_by_period(objectives, krs_by_obj),
    }


def _read_objectives(brand_id: str) -> list[dict]:
    """All objectives for a brand, pre-sorted newest-period first."""
    return frappe.get_all(
        OBJECTIVE_DOCTYPE,
        filters={"brand": brand_id},
        fields=["name", "title", "status", "pdca_phase", "objective_owner",
                "period", "period_start", "period_end"],
        order_by="period_start desc, title asc",
        limit_page_length=OBJECTIVE_FETCH_LIMIT,
    )


def _read_key_results(objective_ids: list[str]) -> dict[str, list[dict]]:
    """Batch-load Key Results for all objectives at once — avoids N+1."""
    grouped: dict[str, list[dict]] = {}
    if not objective_ids:
        return grouped
    rows = frappe.get_all(
        KEY_RESULT_DOCTYPE,
        filters={"objective": ["in", objective_ids]},
        fields=["name", "objective", "metric", "target_value", "current_value",
                "unit", "progress_percent", "confidence"],
        limit_page_length=KEY_RESULT_FETCH_LIMIT,
    )
    for r in rows:
        grouped.setdefault(r["objective"], []).append({
            "id": r["name"],
            "metric": r.get("metric"),
            "target": float(r.get("target_value") or 0),
            "current": float(r.get("current_value") or 0),
            "unit": r.get("unit"),
            "progress_percent": float(r.get("progress_percent") or 0),
            "confidence": float(r.get("confidence") or 0),
        })
    return grouped


def _aggregate_progress(krs: list[dict]) -> float:
    """Mean of stored KR progress_percent over KRs with target > 0.

    Reuses the controller-computed Key Result.progress_percent (single source of
    truth) instead of recomputing from raw values; this equals the canonical
    Objective.get_objective_progress but avoids a per-objective DB round-trip
    (no N+1) since the KRs are already batched.
    """
    valid = [k for k in krs if k["target"] > 0]
    if not valid:
        return 0.0
    return round(sum(k["progress_percent"] for k in valid) / len(valid), 2)


def _group_by_period(objectives: list[dict], krs_by_obj: dict[str, list[dict]]) -> list[dict]:
    """Group objectives by `period`; blank period → trailing bucket.

    Objectives arrive pre-sorted by period_start desc, so each period's first
    sighting fixes its display order. The blank-period bucket always renders last.
    """
    order: list[str] = []
    buckets: dict[str, dict] = {}
    for obj in objectives:
        key = obj.get("period") or NO_PERIOD_LABEL
        if key not in buckets:
            order.append(key)
            buckets[key] = {
                "period": key,
                "period_start": obj.get("period_start"),
                "period_end": obj.get("period_end"),
                "is_current": _is_current(obj.get("period_start"), obj.get("period_end")),
                "objectives": [],
            }
        krs = krs_by_obj.get(obj["name"], [])
        buckets[key]["objectives"].append({
            "id": obj["name"],
            "title": obj.get("title") or obj["name"],
            "status": obj.get("status"),
            "pdca_phase": obj.get("pdca_phase"),
            "owner": obj.get("objective_owner"),
            "progress": _aggregate_progress(krs),
            "key_results": krs,
        })
    keys = [k for k in order if k != NO_PERIOD_LABEL]
    if NO_PERIOD_LABEL in buckets:
        keys.append(NO_PERIOD_LABEL)
    return [buckets[k] for k in keys]


def _is_current(period_start: Any, period_end: Any) -> bool:
    """True when today falls within [period_start, period_end]."""
    if not period_start or not period_end:
        return False
    now = getdate(today())
    return getdate(period_start) <= now <= getdate(period_end)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker exec frappe-backend-1 bench --site task.localhost run-tests --module vernon_tasks.brand.api.test_brand_okr`
Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add brand/api/brand_okr.py brand/api/test_brand_okr.py
git commit -m "feat(brand-okr): read endpoint grouping objectives by period"
```

---

### Task 3: Write API — `brand_okr_mutations.*`

Thin whitelisted wrappers delegating to the controllers. Allow-lists block mass-assignment; `brand` is forced from the path param; native permissions enforced.

**Files:**
- Create: `brand/api/brand_okr_mutations.py`
- Test: `brand/api/test_brand_okr_mutations.py`

- [ ] **Step 1: Write the failing tests**

`brand/api/test_brand_okr_mutations.py`:

```python
import frappe
from frappe.tests.utils import FrappeTestCase

from vernon_tasks.brand.api import brand_okr_mutations as m

TEST_BRAND = "TestBrandMut-Q"


class TestBrandOkrMutations(FrappeTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._cleanup()
        frappe.get_doc({"doctype": "VT Brand", "brand_name": TEST_BRAND}).insert(
            ignore_permissions=True
        )

    @classmethod
    def tearDownClass(cls):
        cls._cleanup()
        super().tearDownClass()

    @classmethod
    def _cleanup(cls):
        for obj in frappe.get_all("Objective", filters={"brand": TEST_BRAND}):
            for kr in frappe.get_all("Key Result", filters={"objective": obj.name}):
                frappe.delete_doc("Key Result", kr.name, force=True, ignore_permissions=True)
            frappe.delete_doc("Objective", obj.name, force=True, ignore_permissions=True)
        if frappe.db.exists("VT Brand", TEST_BRAND):
            frappe.delete_doc("VT Brand", TEST_BRAND, force=True, ignore_permissions=True)

    def setUp(self):
        frappe.set_user("Administrator")

    def _make_objective(self, title="Obj"):
        return m.create_objective(TEST_BRAND, {
            "title": title, "period": "2026-Q3", "objective_owner": "Administrator",
        })

    def test_create_objective_forces_brand_and_blocks_mass_assignment(self):
        res = m.create_objective(TEST_BRAND, {
            "title": "Grow", "period": "2026-Q3", "objective_owner": "Administrator",
            "brand": "SomeOtherBrand", "pdca_phase": "CLOSED",  # both must be ignored
        })
        doc = frappe.get_doc("Objective", res["id"])
        self.assertEqual(doc.brand, TEST_BRAND)       # forced from path param
        self.assertEqual(doc.pdca_phase, "PLAN")      # not in allow-list → default

    def test_create_objective_autofills_period_dates(self):
        res = self._make_objective("Dates")
        doc = frappe.get_doc("Objective", res["id"])
        self.assertEqual(str(doc.period_start), "2026-07-01")  # controller auto-fill
        self.assertEqual(str(doc.period_end), "2026-09-30")

    def test_update_objective_allow_list_blocks_pdca(self):
        res = self._make_objective("Edit")
        m.update_objective(res["id"], {"title": "Renamed", "pdca_phase": "CLOSED"})
        doc = frappe.get_doc("Objective", res["id"])
        self.assertEqual(doc.title, "Renamed")
        self.assertEqual(doc.pdca_phase, "PLAN")  # pdca excluded from allow-list

    def test_create_key_result_computes_progress(self):
        obj = self._make_objective("KR")
        kr = m.create_key_result(obj["id"], {
            "metric": "Leads", "target_value": 200, "current_value": 50,
            "progress_percent": 999,  # must be ignored (controller-computed)
        })
        doc = frappe.get_doc("Key Result", kr["id"])
        self.assertEqual(doc.progress_percent, 25.0)

    def test_create_key_result_rejects_zero_target(self):
        obj = self._make_objective("BadKR")
        with self.assertRaises(frappe.ValidationError):
            m.create_key_result(obj["id"], {"metric": "Bad", "target_value": 0})

    def test_get_objective_returns_editable_scalars_only(self):
        obj = self._make_objective("Hydrate")
        row = m.get_objective(obj["id"])
        self.assertEqual(row["title"], "Hydrate")
        self.assertIn("period", row)
        self.assertNotIn("pdca_phase", row)  # not an editable scalar

    def test_create_objective_unknown_brand_raises(self):
        with self.assertRaises(frappe.DoesNotExistError):
            m.create_objective("NoBrand-XYZ", {"title": "x", "period": "2026"})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker exec frappe-backend-1 bench --site task.localhost run-tests --module vernon_tasks.brand.api.test_brand_okr_mutations`
Expected: FAIL — `ModuleNotFoundError: No module named 'vernon_tasks.brand.api.brand_okr_mutations'`.

- [ ] **Step 3: Implement the mutation endpoints**

`brand/api/brand_okr_mutations.py`:

```python
"""Brand OKR mutations — inline create/edit of Objective + Key Result.

Layer: HTTP entrypoints (Layer 2, Priority 5 per vernon-dev Frappe Hooks-First).
Each whitelist is a thin wrapper that delegates ALL validation to the Objective /
Key Result controllers via doc.insert() / doc.save() — the controllers own period
auto-fill, PDCA legality and progress computation. Field allow-lists guard against
mass-assignment; native DocType permissions are honored (no ignore_permissions).
`brand` is forced from the path param so an objective created on a brand's page
always belongs to that brand. pdca_phase is excluded so PDCA transitions stay on
the native form (the Deming state machine in Objective.validate stays authoritative).

Source of truth: docs/superpowers/specs/2026-06-04-brand-detail-okr-design.html §2.3
"""
from __future__ import annotations

import json
from typing import Any

import frappe

from vernon_tasks.task.api.security import max_str, require_login

BRAND_DOCTYPE = "VT Brand"
OBJECTIVE_DOCTYPE = "Objective"
KEY_RESULT_DOCTYPE = "Key Result"

# Mass-assignment allow-lists. EXCLUDES pdca_phase (PDCA state machine stays on the
# native form) and every server-computed field.
OBJECTIVE_EDITABLE_FIELDS = (
    "title", "period", "period_start", "period_end",
    "objective_owner", "status", "description",
)
# EXCLUDES progress_percent (controller-computed) + confidence_last_week (system).
KEY_RESULT_EDITABLE_FIELDS = (
    "metric", "target_value", "current_value", "unit", "confidence",
)


def _parse_values(payload: Any) -> dict:
    """Accept a dict or a JSON string; reject anything else."""
    if payload is None:
        return {}
    if isinstance(payload, dict):
        return payload
    try:
        parsed = json.loads(payload)
    except (TypeError, ValueError):
        raise frappe.ValidationError("invalid values payload")
    if not isinstance(parsed, dict):
        raise frappe.ValidationError("values must be an object")
    return parsed


def _whitelist(values: dict, allowed: tuple[str, ...]) -> dict:
    """Keep only allow-listed keys — blocks mass-assignment."""
    return {k: values[k] for k in allowed if k in values}


@frappe.whitelist()
def create_objective(brand_id: str, values: str | dict) -> dict:
    require_login()
    brand_id = max_str(brand_id, 140)
    if not frappe.db.exists(BRAND_DOCTYPE, brand_id):
        frappe.throw("Brand tidak ditemukan", frappe.DoesNotExistError)
    if not frappe.has_permission(OBJECTIVE_DOCTYPE, "create"):
        raise frappe.PermissionError
    data = _whitelist(_parse_values(values), OBJECTIVE_EDITABLE_FIELDS)
    # brand is forced from the path param — never trust a brand in the payload.
    doc = frappe.get_doc({"doctype": OBJECTIVE_DOCTYPE, "brand": brand_id, **data})
    doc.insert(ignore_permissions=False)
    return {"id": doc.name}


@frappe.whitelist()
def update_objective(objective_id: str, values: str | dict) -> dict:
    require_login()
    objective_id = max_str(objective_id, 140)
    if not frappe.has_permission(OBJECTIVE_DOCTYPE, "write", objective_id):
        raise frappe.PermissionError
    doc = frappe.get_doc(OBJECTIVE_DOCTYPE, objective_id)
    # brand is NOT in the allow-list, so it can never be reassigned here.
    for field, value in _whitelist(_parse_values(values), OBJECTIVE_EDITABLE_FIELDS).items():
        setattr(doc, field, value)
    doc.save(ignore_permissions=False)
    return {"id": doc.name}


@frappe.whitelist()
def create_key_result(objective_id: str, values: str | dict) -> dict:
    require_login()
    objective_id = max_str(objective_id, 140)
    if not frappe.db.exists(OBJECTIVE_DOCTYPE, objective_id):
        frappe.throw("Objective tidak ditemukan", frappe.DoesNotExistError)
    if not frappe.has_permission(KEY_RESULT_DOCTYPE, "create"):
        raise frappe.PermissionError
    data = _whitelist(_parse_values(values), KEY_RESULT_EDITABLE_FIELDS)
    doc = frappe.get_doc({"doctype": KEY_RESULT_DOCTYPE, "objective": objective_id, **data})
    doc.insert(ignore_permissions=False)
    return {"id": doc.name}


@frappe.whitelist()
def update_key_result(kr_id: str, values: str | dict) -> dict:
    require_login()
    kr_id = max_str(kr_id, 140)
    if not frappe.has_permission(KEY_RESULT_DOCTYPE, "write", kr_id):
        raise frappe.PermissionError
    doc = frappe.get_doc(KEY_RESULT_DOCTYPE, kr_id)
    for field, value in _whitelist(_parse_values(values), KEY_RESULT_EDITABLE_FIELDS).items():
        setattr(doc, field, value)
    doc.save(ignore_permissions=False)
    return {"id": doc.name}


@frappe.whitelist()
def get_objective(objective_id: str) -> dict:
    """Editable scalar fields to hydrate the objective edit dialog."""
    require_login()
    objective_id = max_str(objective_id, 140)
    if not frappe.has_permission(OBJECTIVE_DOCTYPE, "read", objective_id):
        raise frappe.PermissionError
    row = frappe.db.get_value(
        OBJECTIVE_DOCTYPE, objective_id,
        ["name", *OBJECTIVE_EDITABLE_FIELDS], as_dict=True,
    )
    if not row:
        frappe.throw("Objective tidak ditemukan", frappe.DoesNotExistError)
    return row


@frappe.whitelist()
def get_key_result(kr_id: str) -> dict:
    """Editable scalar fields to hydrate the key result edit dialog."""
    require_login()
    kr_id = max_str(kr_id, 140)
    if not frappe.has_permission(KEY_RESULT_DOCTYPE, "read", kr_id):
        raise frappe.PermissionError
    row = frappe.db.get_value(
        KEY_RESULT_DOCTYPE, kr_id,
        ["name", "objective", *KEY_RESULT_EDITABLE_FIELDS], as_dict=True,
    )
    if not row:
        frappe.throw("Key Result tidak ditemukan", frappe.DoesNotExistError)
    return row
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker exec frappe-backend-1 bench --site task.localhost run-tests --module vernon_tasks.brand.api.test_brand_okr_mutations`
Expected: 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add brand/api/brand_okr_mutations.py brand/api/test_brand_okr_mutations.py
git commit -m "feat(brand-okr): inline mutation endpoints for objective + key result"
```

---

### Task 4: Page JS — render + dialogs (`vt_brand_detail.js`)

Replace the Task 1 placeholder with the full page: hero, collapsible period sections, objective cards + KR rows, and create/edit dialogs. Presentation only — all rules stay server-side.

**Files:**
- Modify (replace): `task/page/vt_brand_detail/vt_brand_detail.js`

- [ ] **Step 1: Replace the file with the full implementation**

`task/page/vt_brand_detail/vt_brand_detail.js`:

```javascript
/* IIFE wrapper: desk Page scripts run via frappe.dom.eval as a <script> in
   GLOBAL scope. Top-level const/let would leak and collide on re-eval. Wrapping
   isolates every declaration to function scope. */
(function () {
/* vt_brand_detail.js — desk Page: per-brand OKR surface.
   Hero (brand logo/name/desc) + period sections (collapsible, newest first)
   listing Objectives and their Key Results with progress. Inline create/edit of
   Objective + Key Result via frappe.ui.Dialog — PDCA transitions and deletes stay
   on the native form (state machine + cascade guards live in the controllers).
   Route shape: ["vt-brand-detail", <brand_id>].
   APIs: vernon_tasks.brand.api.brand_okr.* + brand_okr_mutations.* */

const READ_API = "vernon_tasks.brand.api.brand_okr.get_brand_okr";
const CREATE_OBJ_API = "vernon_tasks.brand.api.brand_okr_mutations.create_objective";
const UPDATE_OBJ_API = "vernon_tasks.brand.api.brand_okr_mutations.update_objective";
const GET_OBJ_API = "vernon_tasks.brand.api.brand_okr_mutations.get_objective";
const CREATE_KR_API = "vernon_tasks.brand.api.brand_okr_mutations.create_key_result";
const UPDATE_KR_API = "vernon_tasks.brand.api.brand_okr_mutations.update_key_result";
const GET_KR_API = "vernon_tasks.brand.api.brand_okr_mutations.get_key_result";

const BRAND_DOCTYPE = "VT Brand";
const STATUS_OPTIONS = "Open\nOn Track\nAt Risk\nClosed";
const PERIOD_HINT = "Format: YYYY, YYYY-Hn, YYYY-Qn, atau YYYY-MM";
const STATUS_COLORS = {
    "Open": "#6b7280", "On Track": "#16a34a", "At Risk": "#f59e0b", "Closed": "#374151",
};

const esc = (s) => frappe.utils.escape_html(s == null ? "" : String(s));
const pct = (n) => Math.min(Math.max(Number(n) || 0, 0), 100);

frappe.pages["vt-brand-detail"].on_page_load = function (wrapper) {
    // Gray page background; styled via .vt-gray-bg in vt_home.css.
    $(wrapper).addClass("vt-gray-bg");
    const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Brand"), single_column: true });
    const brand_id = frappe.get_route()[1];
    if (!brand_id) {
        page.main.empty().append('<div class="vt-home"><div class="vh-empty">Brand tidak ditemukan.</div></div>');
        return;
    }
    page.add_button(__("Refresh"), () => load_page(page, brand_id), { icon: "refresh" });
    page.add_button(__("Edit Brand"), () => frappe.set_route("Form", BRAND_DOCTYPE, brand_id));
    load_page(page, brand_id);
};

/**
 * Fetch the brand OKR payload and paint it.
 * @param {object} page - Frappe AppPage instance.
 * @param {string} brand_id - VT Brand name.
 */
function load_page(page, brand_id) {
    frappe.call({ method: READ_API, args: { brand_id } }).then((r) => {
        const data = r.message;
        if (!data) {
            page.main.empty().append('<div class="vt-home"><div class="vh-empty">Brand tidak ditemukan.</div></div>');
            return;
        }
        render(page, brand_id, data);
    });
}

/**
 * Paint hero + period sections; wire the "+ Objective" primary action.
 * @param {object} page
 * @param {string} brand_id
 * @param {object} data - get_brand_okr response.
 */
function render(page, brand_id, data) {
    const root = $('<div class="vt-home vt-detail"></div>');
    page.main.empty().append(root);
    root.append(hero(data.brand));

    page.clear_primary_action();
    if (data.can_create_objective) {
        page.set_primary_action(__("+ Objective"), () => objective_dialog(page, brand_id, null), "add");
    }

    if (!data.periods.length) {
        root.append('<div class="vh-section"><div class="vh-empty">Belum ada OKR untuk brand ini.</div></div>');
        return;
    }
    data.periods.forEach((p) => root.append(period_section(page, brand_id, p, data.brand.can_edit)));
}

/**
 * Brand hero block (logo + name + description).
 * @param {object} brand - {brand_name, logo, description}.
 * @returns {jQuery}
 */
function hero(brand) {
    const name = esc(brand.brand_name);
    const logo = brand.logo
        ? `<img src="${esc(brand.logo)}" alt="${name}" style="width:56px;height:56px;border-radius:10px;object-fit:cover;">`
        : `<span style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:10px;background:#6366f1;color:#fff;font-weight:700;font-size:22px;">${name.slice(0, 1).toUpperCase() || "?"}</span>`;
    const desc = (brand.description || "").trim();
    return $(`<div class="vh-section" style="display:flex;align-items:center;gap:14px;">
        ${logo}
        <div>
            <h2 style="margin:0;font-size:20px;">${name}</h2>
            ${desc ? `<div class="vh-item-meta">${esc(desc)}</div>` : ""}
        </div>
    </div>`);
}

/**
 * One collapsible period section. Auto-expanded when is_current.
 * @returns {jQuery}
 */
function period_section(page, brand_id, p, can_edit) {
    const open = !!p.is_current;
    const section = $(`<div class="vh-section vt-period">
        <div class="vt-period-head" style="display:flex;align-items:center;gap:8px;cursor:pointer;">
            <span class="vt-caret">${open ? "▼" : "▶"}</span>
            <strong>${esc(p.period)}</strong>
            <span class="vh-item-meta">${p.objectives.length} objective</span>
            ${p.is_current ? '<span style="font-size:11px;padding:1px 6px;border-radius:8px;background:#dbeafe;color:#1d4ed8;">aktif</span>' : ""}
        </div>
        <div class="vt-period-body" style="${open ? "" : "display:none;"}margin-top:10px;"></div>
    </div>`);
    const body = section.find(".vt-period-body");
    p.objectives.forEach((o) => body.append(objective_card(page, brand_id, o, can_edit)));
    section.find(".vt-period-head").on("click", () => {
        const visible = body.is(":visible");
        body.toggle();
        section.find(".vt-caret").text(visible ? "▶" : "▼");
    });
    return section;
}

/**
 * Objective card: title + status + PDCA + aggregate progress, with its KR rows.
 * @returns {jQuery}
 */
function objective_card(page, brand_id, o, can_edit) {
    const color = STATUS_COLORS[o.status] || "#6b7280";
    const actions = can_edit
        ? `<button class="btn btn-xs btn-default vt-obj-edit">${__("edit")}</button>
           <button class="btn btn-xs btn-default vt-kr-add">${__("+ KR")}</button>`
        : "";
    const card = $(`<div class="vh-card" style="margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
            <strong style="font-size:14px;">${esc(o.title)}</strong>
            <span style="font-size:11px;padding:1px 6px;border-radius:8px;background:${color}1a;color:${color};">${esc(o.status || "")}</span>
            <span class="vh-item-meta">PDCA: ${esc(o.pdca_phase || "")}</span>
            <span class="vh-item-meta">${o.progress}%</span>
            <span style="margin-left:auto;display:flex;gap:6px;">${actions}</span>
        </div>
        <div style="height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden;margin-bottom:8px;">
            <div style="height:100%;width:${pct(o.progress)}%;background:#6366f1;"></div>
        </div>
        <div class="vt-kr-list"></div>
    </div>`);
    const list = card.find(".vt-kr-list");
    if (!o.key_results.length) {
        list.append('<div class="vh-item-meta">Belum ada key result.</div>');
    } else {
        o.key_results.forEach((kr) => list.append(kr_row(page, brand_id, kr, can_edit)));
    }
    card.find(".vt-obj-edit").on("click", () => objective_dialog(page, brand_id, o.id));
    card.find(".vt-kr-add").on("click", () => kr_dialog(page, brand_id, o.id, null));
    return card;
}

/**
 * Single Key Result row: metric, current/target, progress bar.
 * @returns {jQuery}
 */
function kr_row(page, brand_id, kr, can_edit) {
    const unit = kr.unit ? " " + esc(kr.unit) : "";
    const edit = can_edit ? `<button class="btn btn-xs btn-default vt-kr-edit">${__("edit")}</button>` : "";
    const row = $(`<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-top:1px solid #f1f1f1;">
        <span style="flex:1;">${esc(kr.metric)}</span>
        <span class="vh-item-meta">${kr.current}/${kr.target}${unit}</span>
        <div style="width:90px;height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden;">
            <div style="height:100%;width:${pct(kr.progress_percent)}%;background:#16a34a;"></div>
        </div>
        <span class="vh-item-meta">${kr.progress_percent}%</span>
        ${edit}
    </div>`);
    row.find(".vt-kr-edit").on("click", () => kr_dialog(page, brand_id, null, kr.id));
    return row;
}

/**
 * Create/edit Objective dialog. objective_id null => create.
 */
function objective_dialog(page, brand_id, objective_id) {
    const dialog = new frappe.ui.Dialog({
        title: objective_id ? __("Edit Objective") : __("Objective Baru"),
        fields: [
            { fieldname: "title", label: __("Judul"), fieldtype: "Data", reqd: 1 },
            { fieldname: "period", label: __("Periode"), fieldtype: "Data", reqd: 1, description: PERIOD_HINT },
            { fieldname: "objective_owner", label: __("Owner"), fieldtype: "Link", options: "User" },
            { fieldname: "status", label: __("Status"), fieldtype: "Select", options: STATUS_OPTIONS },
            { fieldname: "description", label: __("Deskripsi"), fieldtype: "Small Text" },
        ],
        primary_action_label: __("Simpan"),
        primary_action(values) {
            const method = objective_id ? UPDATE_OBJ_API : CREATE_OBJ_API;
            const args = objective_id ? { objective_id, values } : { brand_id, values };
            frappe.call({ method, args }).then(() => {
                dialog.hide();
                load_page(page, brand_id);
            });
        },
    });
    if (objective_id) {
        frappe.call({ method: GET_OBJ_API, args: { objective_id } }).then((r) => {
            dialog.set_values(r.message || {});
            dialog.show();
        });
    } else {
        dialog.show();
    }
}

/**
 * Create/edit Key Result dialog. kr_id null => create under objective_id.
 */
function kr_dialog(page, brand_id, objective_id, kr_id) {
    const dialog = new frappe.ui.Dialog({
        title: kr_id ? __("Edit Key Result") : __("Key Result Baru"),
        fields: [
            { fieldname: "metric", label: __("Metric"), fieldtype: "Data", reqd: 1 },
            { fieldname: "target_value", label: __("Target"), fieldtype: "Float", reqd: 1 },
            { fieldname: "current_value", label: __("Current"), fieldtype: "Float", default: 0 },
            { fieldname: "unit", label: __("Unit"), fieldtype: "Data" },
            { fieldname: "confidence", label: __("Confidence (%)"), fieldtype: "Percent" },
        ],
        primary_action_label: __("Simpan"),
        primary_action(values) {
            const method = kr_id ? UPDATE_KR_API : CREATE_KR_API;
            const args = kr_id ? { kr_id, values } : { objective_id, values };
            frappe.call({ method, args }).then(() => {
                dialog.hide();
                load_page(page, brand_id);
            });
        },
    });
    if (kr_id) {
        frappe.call({ method: GET_KR_API, args: { kr_id } }).then((r) => {
            dialog.set_values(r.message || {});
            dialog.show();
        });
    } else {
        dialog.show();
    }
}

})();
```

- [ ] **Step 2: Restart backend so new whitelisted methods are importable**

Run: `docker restart frappe-backend-1`
Expected: container restarts; gunicorn re-imports the new `brand_okr*` modules (new `@frappe.whitelist()` methods 404 until restart — see project memory).

- [ ] **Step 3: Build assets so the page JS is served**

Run: `docker exec frappe-backend-1 bench build --app vernon_tasks`
Expected: build completes (or, in developer_mode, the page JS is served from disk — a hard refresh suffices).

- [ ] **Step 4: Manual smoke (acceptance)**

Open `http://task.localhost:8080/app/vt-brands`, click a brand → lands on `/app/vt-brand-detail/<brand>`. Verify: hero renders; period sections collapse/expand; "+ Objective" creates an objective (appears under its period); "+ KR" + "edit" on an objective/KR open dialogs that save and refresh. Create an objective with period `2026-Q3` and confirm it groups correctly.

- [ ] **Step 5: Commit**

```bash
git add task/page/vt_brand_detail/vt_brand_detail.js
git commit -m "feat(brand-okr): brand detail page render + OKR dialogs"
```

---

### Task 5: Wire `vt-brands` card click to the detail page

**Files:**
- Modify: `task/page/vt_brands/vt_brands.js:103`

- [ ] **Step 1: Change the card click target**

In `brand_card`, replace the click handler:

```javascript
// before
card.on("click", () => frappe.set_route("Form", BRAND_DOCTYPE, b.id));
// after
card.on("click", () => frappe.set_route("vt-brand-detail", b.id));
```

- [ ] **Step 2: Manual smoke**

Reload `/app/vt-brands`, click a card → opens `vt-brand-detail` (not the native form). The native form is still reachable via the detail page's "Edit Brand" button.

- [ ] **Step 3: Commit**

```bash
git add task/page/vt_brands/vt_brands.js
git commit -m "feat(brand-okr): vt-brands card opens brand detail page"
```

---

### Task 6: Docs + bookkeeping + full-suite regression

**Files:**
- Modify: `docs/domains/okr/README.html` (add the brand-detail surface to the OKR domain doc)
- Modify: `docs/implementation-tracker.md` (status + tests columns)
- Modify: `.wolf/anatomy.md`, `.wolf/memory.md` (OpenWolf bookkeeping)

- [ ] **Step 1: Add a "Brand Detail surface" subsection to the OKR domain README**

In `docs/domains/okr/README.html`, add a section documenting the new surface (insert before the closing `</div>`/`</body>`; match the file's existing HTML structure):

```html
<h2 id="brand-detail-surface">Brand Detail Surface (vt-brand-detail)</h2>
<p>The desk Page <code>/app/vt-brand-detail/&lt;brand&gt;</code> lists a brand's
Objectives grouped by <code>period</code> (newest first) with their Key Results.
Read endpoint: <code>vernon_tasks.brand.api.brand_okr.get_brand_okr</code>. Inline
create/edit of Objective + Key Result go through
<code>vernon_tasks.brand.api.brand_okr_mutations.*</code>, thin wrappers that
delegate to the controllers (allow-listed fields; <code>brand</code> forced from
the route; <code>pdca_phase</code> excluded so PDCA transitions stay on the native
form). Reached from <code>/app/vt-brands</code> card click.</p>
```

- [ ] **Step 2: Update the implementation tracker**

In `docs/implementation-tracker.md`, add a row recording this feature (brand-detail OKR page) with its status set to done and the three new test modules listed in the Tests column. Match the table format already used in that file.

- [ ] **Step 3: OpenWolf bookkeeping**

Append entries to `.wolf/anatomy.md` for the new files:

```markdown
- `vernon_tasks/task/page/vt_brand_detail/` — desk Page `vt-brand-detail` (/app/vt-brand-detail/<brand>): hero + period sections (collapsible, newest first) of brand's Objectives + Key Results; inline create/edit via dialogs (PDCA/delete stay on native form). vt_brand_detail.js calls brand.api.brand_okr.get_brand_okr + brand_okr_mutations.*. Reached from vt-brands card click. ~6k
- `vernon_tasks/brand/api/brand_okr.py` — read: get_brand_okr(brand_id) → brand + objectives grouped by period (newest first), batched Key Results (no N+1), aggregate progress from stored KR progress_percent. ~1.5k
- `vernon_tasks/brand/api/brand_okr_mutations.py` — write: create/update objective + key_result, get_objective/get_key_result; thin wrappers delegating to controllers, allow-list fields, brand forced from param, pdca_phase excluded. ~1.5k
```

Append a one-line entry to `.wolf/memory.md` summarizing the session.

- [ ] **Step 4: Run the full brand + okr test suites (regression)**

Run: `docker exec frappe-backend-1 bench --site task.localhost run-tests --module vernon_tasks.brand.api.test_brand_okr && docker exec frappe-backend-1 bench --site task.localhost run-tests --module vernon_tasks.brand.api.test_brand_okr_mutations && docker exec frappe-backend-1 bench --site task.localhost run-tests --module vernon_tasks.task.page.vt_brand_detail.test_vt_brand_detail`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/domains/okr/README.html docs/implementation-tracker.md .wolf/anatomy.md .wolf/memory.md
git commit -m "docs(brand-okr): document brand detail surface + bookkeeping"
```

---

## Self-Review

**Spec coverage:**
- §2.1 desk Page `vt-brand-detail` → Task 1 (scaffold) + Task 4 (full JS). ✓
- §2.2 read API shape + grouping + no-N+1 → Task 2. ✓
- §2.3 mutation endpoints + allow-lists + forced brand + pdca exclusion → Task 3. ✓
- §2.4 vt_brands.js click rewire → Task 5. ✓
- §3 data flow (dialogs reload page) → Task 4 dialogs. ✓
- §4 error handling (unknown brand throws, empty states, validation surfaces) → Task 2 (`DoesNotExistError`), Task 4 (empty-state HTML), controller `frappe.throw` shown by dialog. ✓
- §5 tests (3 modules) → Tasks 1/2/3 + Task 6 regression. ✓
- §6 out-of-scope (no PDCA/delete inline) → enforced by allow-list (Task 3) + no delete UI (Task 4). ✓
- §7 files touched → all created/modified across Tasks 1–6. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code; Task 6 Step 1/2 give exact HTML/row content + structural instruction. ✓

**Type consistency:** API method paths identical between `brand_okr*.py` definitions and the JS constants (`get_brand_okr`, `create_objective`, `update_objective`, `get_objective`, `create_key_result`, `update_key_result`, `get_key_result`). Response keys (`brand.id/brand_name/logo/description`, `can_create_objective`, `can_edit_objective`, `can_create_kr`, `can_edit_kr`, `periods[].period/period_start/period_end/is_current/objectives[]`, `objectives[].id/title/status/pdca_phase/owner/progress/key_results[]`, `key_results[].id/metric/target/current/unit/progress_percent/confidence`) match between Task 2 implementation and Task 4 consumers. Allow-list constants (`OBJECTIVE_EDITABLE_FIELDS`, `KEY_RESULT_EDITABLE_FIELDS`) consistent between impl and tests. ✓

---

## Post-Review Adjustments (System Analyst + Code Reviewer)

Two agents reviewed this plan before coding. Apply these deltas to the tasks above; everything else stands.

**A. [BLOCKER] Test isolation — `FrappeTestCase` does NOT roll back per test.**
The base `FrappeTestCase` only rolls back once per class (via `addClassCleanup`); it has no per-test `setUp`/`tearDown` rollback. The "setUpClass fixtures + per-test rollback" framing in Tasks 2/3 is wrong and would leak/poison state across tests. **Fix:** mirror the proven repo pattern in `brand/api/test_portal_brands.py` — per-test `setUp` creates fixtures, per-test `tearDown` deletes them (objectives + their KRs, then the brand). The corrected test files below replace the ones inlined in Tasks 2 and 3.

**B. [SHOULD] DRY the canonical progress formula + exact parity (no double-rounding).**
Add a shared pure helper in `okr/doctype/objective/objective.py` and have both `get_objective_progress` and the brand read path delegate to it (preserves no-N+1; removes the duplicated mean/clamp/round and the double-rounding divergence):

```python
def aggregate_kr_progress(pairs: list[tuple[float, float]]) -> float:
    """Mean of clamp(current/target, 0..1) * 100 over pairs with target > 0, rounded 2dp.

    Canonical OKR progress scalar. Callers pass pre-loaded (current, target) pairs so
    read paths can batch their Key Result query (no N+1):
      - get_objective_progress()  — single-objective rollup (Health Score)
      - vernon_tasks.brand.api.brand_okr — brand-detail page (batched)
    """
    valid = [(c, t) for (c, t) in pairs if t and t > 0]
    if not valid:
        return 0.0
    total = sum(min((c or 0) / t, 1.0) for (c, t) in valid)
    return round(total / len(valid) * 100, 2)
```

Refactor the existing `get_objective_progress` body to:

```python
def get_objective_progress(objective_name: str) -> float:
    """Aggregate progress for an Objective across its Key Results (delegates to
    aggregate_kr_progress). Returns a float in [0.0, 100.0]; 0.0 when no KRs."""
    key_results = frappe.get_all(
        "Key Result", filters={"objective": objective_name},
        fields=["target_value", "current_value"],
    )
    return aggregate_kr_progress([(kr.current_value, kr.target_value) for kr in key_results])
```

In `brand_okr.py`: `from vernon_tasks.okr.doctype.objective.objective import aggregate_kr_progress`, drop the local `_aggregate_progress`, and compute progress in `_group_by_period` as
`aggregate_kr_progress([(k["current"], k["target"]) for k in krs])`.

**C. [SHOULD] Per-doctype edit gating.** The read payload returns FOUR boolean flags instead of `brand.can_edit`:
`can_create_objective`, `can_edit_objective`, `can_create_kr`, `can_edit_kr` (each a `has_permission` on the matching doctype + ptype). The JS gates: `+ Objective`→`can_create_objective`, objective `edit`→`can_edit_objective`, `+ KR`→`can_create_kr`, KR `edit`→`can_edit_kr`.

**D. [SHOULD] Shared payload helpers.** Add `parse_payload` + `pick_fields` to `task/api/security.py` and use them in `brand_okr_mutations.py` (instead of local `_parse_values`/`_whitelist`):

```python
import json  # add at top of security.py

def parse_payload(payload):
    """Normalize a whitelisted-method payload to a dict (accepts dict or JSON string)."""
    if payload is None:
        return {}
    if isinstance(payload, dict):
        return payload
    try:
        parsed = json.loads(payload)
    except (TypeError, ValueError):
        frappe.throw("invalid payload", frappe.ValidationError)
    if not isinstance(parsed, dict):
        frappe.throw("payload must be an object", frappe.ValidationError)
    return parsed


def pick_fields(payload: dict, allowed: tuple) -> dict:
    """Keep only allow-listed keys from a payload — blocks mass-assignment."""
    return {k: payload[k] for k in allowed if k in payload}
```

**E. [SHOULD] `has_permission` keyword form.** In both new modules use the explicit `doc=` keyword: `frappe.has_permission(OBJECTIVE_DOCTYPE, "write", doc=objective_id)`.

**F. [SHOULD] Extra tests.** Add to `test_brand_okr.py`: `test_brand_with_no_objectives_returns_empty_periods`. Add to `test_brand_okr_mutations.py`: `test_create_objective_invalid_period_raises` (asserts `frappe.ValidationError`). The grouping test asserts progress through `_group_by_period` output (covering the zero-target-ignored case), so no separate `_aggregate_progress` test is needed.

**G. [INFO] IDOR / brand isolation.** OKR write reach is role-wide (a VT Leader can edit any brand's objectives), identical to the native form and consistent with the spec's threat model (brand is not an isolation boundary). Accepted as-is. If brand isolation is ever required, it must be added as a `permission_query_conditions` / `has_permission` hook on the doctype — never inside these handlers.

### Corrected test file — `brand/api/test_brand_okr.py` (replaces Task 2 Step 1)

```python
import frappe
from frappe.tests.utils import FrappeTestCase

from vernon_tasks.brand.api import brand_okr

TEST_BRAND = "TestBrandOKR-Z"
EMPTY_BRAND = "TestBrandOKR-Empty"


class TestBrandOkrGrouping(FrappeTestCase):
    """Pure-function tests for period grouping (no DB)."""

    def _obj(self, name, title, period, start, end):
        return {"name": name, "title": title, "status": "Open", "pdca_phase": "PLAN",
                "objective_owner": None, "period": period,
                "period_start": start, "period_end": end}

    def test_groups_by_period_blank_last_and_aggregates_progress(self):
        objectives = [
            self._obj("O1", "A", "2026-Q1", "2026-01-01", "2026-03-31"),
            self._obj("O2", "B", "2025-Q4", "2025-10-01", "2025-12-31"),
            self._obj("O3", "C", None, None, None),
        ]
        krs = {"O1": [
            {"id": "K1", "target": 100.0, "current": 50.0, "progress_percent": 50.0},
            {"id": "K2", "target": 0.0, "current": 9.0, "progress_percent": 0.0},  # ignored
        ]}
        periods = brand_okr._group_by_period(objectives, krs)
        self.assertEqual([p["period"] for p in periods],
                         ["2026-Q1", "2025-Q4", brand_okr.NO_PERIOD_LABEL])
        # zero-target KR ignored → mean over {50.0} = 50.0
        self.assertEqual(periods[0]["objectives"][0]["progress"], 50.0)
        self.assertEqual(periods[0]["objectives"][0]["key_results"], krs["O1"])

    def test_objective_without_krs_has_zero_progress(self):
        objectives = [self._obj("O1", "A", "2026-Q1", "2026-01-01", "2026-03-31")]
        periods = brand_okr._group_by_period(objectives, {})
        self.assertEqual(periods[0]["objectives"][0]["progress"], 0.0)


class TestBrandOkrEndpoint(FrappeTestCase):
    def setUp(self):
        frappe.set_user("Administrator")
        self._cleanup()
        frappe.get_doc({"doctype": "VT Brand", "brand_name": TEST_BRAND}).insert(
            ignore_permissions=True)
        self.obj_current = frappe.get_doc({
            "doctype": "Objective", "title": "Current Obj", "brand": TEST_BRAND,
            "period": "2026-Q2", "objective_owner": "Administrator",
            "status": "Open", "pdca_phase": "PLAN"}).insert(ignore_permissions=True)
        self.obj_past = frappe.get_doc({
            "doctype": "Objective", "title": "Past Obj", "brand": TEST_BRAND,
            "period": "2025-Q1", "objective_owner": "Administrator",
            "status": "Open", "pdca_phase": "PLAN"}).insert(ignore_permissions=True)
        frappe.get_doc({
            "doctype": "Key Result", "objective": self.obj_current.name,
            "metric": "Signups", "target_value": 100, "current_value": 40,
        }).insert(ignore_permissions=True)

    def tearDown(self):
        self._cleanup()

    def _cleanup(self):
        for brand in (TEST_BRAND, EMPTY_BRAND):
            for obj in frappe.get_all("Objective", filters={"brand": brand}):
                for kr in frappe.get_all("Key Result", filters={"objective": obj.name}):
                    frappe.delete_doc("Key Result", kr.name, force=True, ignore_permissions=True)
                frappe.delete_doc("Objective", obj.name, force=True, ignore_permissions=True)
            if frappe.db.exists("VT Brand", brand):
                frappe.delete_doc("VT Brand", brand, force=True, ignore_permissions=True)

    def test_returns_periods_newest_first(self):
        res = brand_okr.get_brand_okr(TEST_BRAND)
        self.assertEqual(res["brand"]["id"], TEST_BRAND)
        self.assertEqual([p["period"] for p in res["periods"]], ["2026-Q2", "2025-Q1"])

    def test_key_results_attached(self):
        res = brand_okr.get_brand_okr(TEST_BRAND)
        current = next(p for p in res["periods"] if p["period"] == "2026-Q2")
        krs = current["objectives"][0]["key_results"]
        self.assertEqual(len(krs), 1)
        self.assertEqual(krs[0]["target"], 100.0)
        self.assertEqual(krs[0]["current"], 40.0)

    def test_brand_with_no_objectives_returns_empty_periods(self):
        frappe.get_doc({"doctype": "VT Brand", "brand_name": EMPTY_BRAND}).insert(
            ignore_permissions=True)
        res = brand_okr.get_brand_okr(EMPTY_BRAND)
        self.assertEqual(res["periods"], [])

    def test_unknown_brand_raises(self):
        with self.assertRaises(frappe.DoesNotExistError):
            brand_okr.get_brand_okr("NoSuchBrand-XYZ")
```

### Corrected test file — `brand/api/test_brand_okr_mutations.py` (replaces Task 3 Step 1)

```python
import frappe
from frappe.tests.utils import FrappeTestCase

from vernon_tasks.brand.api import brand_okr_mutations as m

TEST_BRAND = "TestBrandMut-Q"


class TestBrandOkrMutations(FrappeTestCase):
    def setUp(self):
        frappe.set_user("Administrator")
        self._cleanup()
        frappe.get_doc({"doctype": "VT Brand", "brand_name": TEST_BRAND}).insert(
            ignore_permissions=True)

    def tearDown(self):
        self._cleanup()

    def _cleanup(self):
        for obj in frappe.get_all("Objective", filters={"brand": TEST_BRAND}):
            for kr in frappe.get_all("Key Result", filters={"objective": obj.name}):
                frappe.delete_doc("Key Result", kr.name, force=True, ignore_permissions=True)
            frappe.delete_doc("Objective", obj.name, force=True, ignore_permissions=True)
        if frappe.db.exists("VT Brand", TEST_BRAND):
            frappe.delete_doc("VT Brand", TEST_BRAND, force=True, ignore_permissions=True)

    def _make_objective(self, title="Obj"):
        return m.create_objective(TEST_BRAND, {
            "title": title, "period": "2026-Q3", "objective_owner": "Administrator"})

    def test_create_objective_forces_brand_and_blocks_mass_assignment(self):
        res = m.create_objective(TEST_BRAND, {
            "title": "Grow", "period": "2026-Q3", "objective_owner": "Administrator",
            "brand": "SomeOtherBrand", "pdca_phase": "CLOSED"})  # both ignored
        doc = frappe.get_doc("Objective", res["id"])
        self.assertEqual(doc.brand, TEST_BRAND)
        self.assertEqual(doc.pdca_phase, "PLAN")

    def test_create_objective_autofills_period_dates(self):
        doc = frappe.get_doc("Objective", self._make_objective("Dates")["id"])
        self.assertEqual(str(doc.period_start), "2026-07-01")
        self.assertEqual(str(doc.period_end), "2026-09-30")

    def test_create_objective_invalid_period_raises(self):
        with self.assertRaises(frappe.ValidationError):
            m.create_objective(TEST_BRAND, {"title": "Bad", "period": "2026-Q9"})

    def test_update_objective_allow_list_blocks_pdca(self):
        res = self._make_objective("Edit")
        m.update_objective(res["id"], {"title": "Renamed", "pdca_phase": "CLOSED"})
        doc = frappe.get_doc("Objective", res["id"])
        self.assertEqual(doc.title, "Renamed")
        self.assertEqual(doc.pdca_phase, "PLAN")

    def test_create_key_result_computes_progress(self):
        obj = self._make_objective("KR")
        kr = m.create_key_result(obj["id"], {
            "metric": "Leads", "target_value": 200, "current_value": 50,
            "progress_percent": 999})  # ignored, controller recomputes
        doc = frappe.get_doc("Key Result", kr["id"])
        self.assertEqual(doc.progress_percent, 25.0)

    def test_create_key_result_rejects_zero_target(self):
        obj = self._make_objective("BadKR")
        with self.assertRaises(frappe.ValidationError):
            m.create_key_result(obj["id"], {"metric": "Bad", "target_value": 0})

    def test_get_objective_returns_editable_scalars_only(self):
        obj = self._make_objective("Hydrate")
        row = m.get_objective(obj["id"])
        self.assertEqual(row["title"], "Hydrate")
        self.assertIn("period", row)
        self.assertNotIn("pdca_phase", row)

    def test_create_objective_unknown_brand_raises(self):
        with self.assertRaises(frappe.DoesNotExistError):
            m.create_objective("NoBrand-XYZ", {"title": "x", "period": "2026"})
```

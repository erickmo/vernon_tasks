# Brand Detail diperkaya — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/app/vt-brand-detail/<brand>` informative at a glance — add a summary stat bar, an execution (projects + sprint + remaining work) section, owner chips on objectives, and confidence chips on key results, all in one existing API call.

**Architecture:** Extend the single read endpoint `brand_okr.get_brand_okr` with `summary` (computed in-memory, zero queries), `execution` (reuses the `portal_brands` rollup primitives — no number drift vs the brand-list cards), and owner display (one batched User query). Rewrite the desk page JS to render the four new blocks in the existing enriched-scroll layout. No new page, no new doctype, no Frappe core files touched.

**Tech Stack:** Frappe (Python whitelisted methods + DocType controllers), desk Page JS (jQuery, IIFE-wrapped, `frappe.call`), plain CSS bundled via `app_include_css`.

**Base branch:** `master` · **Working branch:** `feat/brand-detail-informative` (already created)

**Spec:** `docs/superpowers/specs/2026-06-06-brand-detail-informative-design.html`

---

## Key facts (verified)

- `VT Project` display name field is **`title`** (autoname `PROJ-.YYYY.-.#####`) and it has a **`percent_done`** field → per-project progress is free, no task-aggregation duplication.
- `portal_brands.py` already has the per-brand rollup primitives: `_project_brand_map`, `_task_aggregates`, `_active_sprints`, `_progress_pct`, `_brand_stats_map`. Constants: `DONE_KANBAN_STATUS`, `CANCELLED_KANBAN_STATUS`, `ACTIVE_SPRINT_STATUS`, `DOCSTATUS_CANCELLED`, `PERCENT_FACTOR`.
- `_task_aggregates(proj_to_brand)` returns `{brand: {total_minutes, remaining_minutes, remaining_tasks, total_tasks, done_tasks}}` (empty dict if no tasks).
- `_active_sprints(proj_to_brand)` returns `{brand: {count, title}}`.
- `_progress_pct(agg)` consumes `total_minutes, remaining_minutes, total_tasks, done_tasks`.
- Objective status vocabulary: `Open`, `On Track`, `At Risk`, `Closed` (matches `STATUS_COLORS` in the page JS).
- `vt_home.css` lives at `public/css/vt_home.css`, bundled globally via `app_include_css` in `hooks.py` — new `.vt-*` classes there reach this page.
- `User` has `full_name` + `user_image`.
- After deploy, restart `frappe-backend-1` (gunicorn caches the module) — extending an existing whitelisted method needs no new registration but the worker must reload.
- Run tests in Docker: `docker exec frappe-backend-1 bench --site task.localhost run-tests --app vernon_tasks --module <dotted.module>`.

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `brand/api/portal_brands.py` | per-brand rollup | add public `brand_execution(brand_id)` + `_zero_task_agg()`; reuse existing primitives |
| `brand/api/brand_okr.py` | brand OKR read endpoint | add `_summary`, `_attach_owners`, period `progress`; extend `get_brand_okr` response |
| `task/page/vt_brand_detail/vt_brand_detail.js` | page render | add `stat_bar`, `execution_section`; enrich `objective_card`, `kr_row`, `period_section` |
| `public/css/vt_home.css` | styling | new `.vt-stat-*`, `.vt-status-seg`, `.vt-owner-chip`, `.vt-kr-conf`, `.vt-exec*` classes |
| `brand/api/test_portal_brands.py` | test | `brand_execution` no-drift + project list |
| `brand/api/test_brand_okr.py` | test | `summary` / `execution` / owner assertions |
| `docs/implementation-tracker.md`, `.wolf/anatomy.md`, memory | docs | status + entries |

---

## Task 1: `brand_execution` rollup helper (portal_brands.py)

**Files:**
- Modify: `brand/api/portal_brands.py`
- Test: `brand/api/test_portal_brands.py`

- [ ] **Step 1: Write the failing test**

Append to `brand/api/test_portal_brands.py` (inside the existing test class; mirror its existing brand/project/task seeding helpers — reuse whatever `setUp`/factory the file already defines):

```python
def test_brand_execution_matches_stats_map_and_lists_projects(self):
    # PRD-brand | spec: 2026-06-06-brand-detail-informative
    # brand_execution(brand) must equal the per-brand slice of the list-endpoint
    # rollup (proves the numbers cannot drift) and must list the brand's projects.
    from vernon_tasks.brand.api import portal_brands

    brand_id = self.brand  # brand seeded in setUp with >=1 project + tasks
    exec_block = portal_brands.brand_execution(brand_id)
    map_slice = portal_brands._brand_stats_map().get(brand_id, portal_brands._zero_stats())

    self.assertEqual(exec_block["progress_pct"], map_slice["progress_pct"])
    self.assertEqual(exec_block["remaining_tasks"], map_slice["remaining_tasks"])
    self.assertEqual(exec_block["remaining_minutes"], map_slice["remaining_minutes"])
    self.assertEqual(exec_block["total_minutes"], map_slice["total_minutes"])
    self.assertEqual(exec_block["active_sprint_count"], map_slice["active_sprint_count"])
    self.assertEqual(exec_block["active_sprint_title"], map_slice["active_sprint_title"])

    self.assertGreaterEqual(exec_block["project_count"], 1)
    self.assertTrue(all({"id", "name", "progress"} <= set(p) for p in exec_block["projects"]))

def test_brand_execution_empty_brand_is_zero(self):
    # A brand with no projects returns zeros + empty project list, never errors.
    from vernon_tasks.brand.api import portal_brands
    empty = frappe.get_doc({"doctype": "VT Brand", "brand_name": "Empty Exec Brand"}).insert()
    block = portal_brands.brand_execution(empty.name)
    self.assertEqual(block["project_count"], 0)
    self.assertEqual(block["progress_pct"], 0)
    self.assertEqual(block["projects"], [])
```

> If the file's existing `setUp` does not already create a brand with projects+tasks named `self.brand`, adapt these two tests to the file's actual fixtures (reuse them; do not invent a parallel seeding path). The first test's value lies in asserting equality with `_brand_stats_map()`, whatever fixtures exist.

- [ ] **Step 2: Run test to verify it fails**

Run: `docker exec frappe-backend-1 bench --site task.localhost run-tests --app vernon_tasks --module vernon_tasks.brand.api.test_portal_brands`
Expected: FAIL — `AttributeError: module 'portal_brands' has no attribute 'brand_execution'`.

- [ ] **Step 3: Add `_zero_task_agg` and refactor the `setdefault` literal**

In `brand/api/portal_brands.py`, add this helper near `_zero_stats` (after it):

```python
def _zero_task_agg() -> dict:
    """Empty task-rollup bucket — five counters that _progress_pct understands."""
    return {"total_minutes": 0, "remaining_minutes": 0,
            "remaining_tasks": 0, "total_tasks": 0, "done_tasks": 0}
```

Then, in `_task_aggregates`, replace the inline bucket literal:

```python
        bucket = agg.setdefault(
            brand, {"total_minutes": 0, "remaining_minutes": 0,
                    "remaining_tasks": 0, "total_tasks": 0, "done_tasks": 0})
```

with:

```python
        bucket = agg.setdefault(brand, _zero_task_agg())
```

- [ ] **Step 4: Implement `brand_execution`**

Add to `brand/api/portal_brands.py` (after `_brand_stats_map`, before `list_brands`):

```python
def brand_execution(brand_id: str) -> dict:
    """Single-brand execution rollup: projects + active sprint + remaining work.

    Reuses the SAME primitives as the brand-list cards (_task_aggregates /
    _active_sprints / _progress_pct) so detail-page numbers cannot drift from the
    list. Per-project progress is read from VT Project.percent_done (the project's
    own computed field) — no task re-aggregation. Read-only; safe for the detail
    page's single get_brand_okr call. spec: 2026-06-06-brand-detail-informative.
    """
    projects = frappe.get_all(
        PROJECT_DOCTYPE,
        fields=["name", "title", "percent_done"],
        filters={"brand": brand_id},
        order_by="title asc",
    )
    proj_to_brand = {p["name"]: brand_id for p in projects}
    agg = _task_aggregates(proj_to_brand).get(brand_id) or _zero_task_agg()
    sprint = _active_sprints(proj_to_brand).get(brand_id, {"count": 0, "title": None})
    return {
        "project_count": len(projects),
        "active_sprint_count": sprint["count"],
        "active_sprint_title": sprint["title"],
        "remaining_tasks": agg["remaining_tasks"],
        "remaining_minutes": agg["remaining_minutes"],
        "total_minutes": agg["total_minutes"],
        "progress_pct": _progress_pct(agg),
        "projects": [
            {"id": p["name"], "name": p.get("title") or p["name"],
             "progress": round(p.get("percent_done") or 0)}
            for p in projects
        ],
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `docker exec frappe-backend-1 bench --site task.localhost run-tests --app vernon_tasks --module vernon_tasks.brand.api.test_portal_brands`
Expected: PASS (both new tests + all pre-existing tests in the module).

- [ ] **Step 6: Commit**

```bash
git add brand/api/portal_brands.py brand/api/test_portal_brands.py
git commit -m "feat(brand): brand_execution rollup reusing portal_brands primitives"
```

---

## Task 2: `summary` + owner + period progress (brand_okr.py)

**Files:**
- Modify: `brand/api/brand_okr.py`
- Test: `brand/api/test_brand_okr.py`

- [ ] **Step 1: Write the failing test**

Append to `brand/api/test_brand_okr.py` (inside the class that already seeds `TEST_BRAND` with objectives/KRs — reuse that fixture):

```python
def test_get_brand_okr_has_summary_and_execution(self):
    # spec: 2026-06-06-brand-detail-informative
    res = brand_okr.get_brand_okr(TEST_BRAND)

    summary = res["summary"]
    self.assertEqual(summary["objective_count"],
                     sum(len(p["objectives"]) for p in res["periods"]))
    self.assertEqual(summary["kr_count"],
                     sum(len(o["key_results"]) for p in res["periods"] for o in p["objectives"]))
    self.assertIn("avg_progress", summary)
    self.assertIsInstance(summary["status_counts"], dict)
    self.assertEqual(summary["at_risk_count"], summary["status_counts"].get("At Risk", 0))
    # active_period is the is_current period (or None)
    current = next((p for p in res["periods"] if p.get("is_current")), None)
    if current:
        self.assertEqual(summary["active_period"]["period"], current["period"])
    else:
        self.assertIsNone(summary["active_period"])

    execution = res["execution"]
    for key in ("project_count", "active_sprint_count", "remaining_tasks",
                "remaining_minutes", "total_minutes", "progress_pct", "projects"):
        self.assertIn(key, execution)

def test_get_brand_okr_attaches_owner_display(self):
    # Every objective carries owner_name + owner_image keys (values may be None).
    res = brand_okr.get_brand_okr(TEST_BRAND)
    for p in res["periods"]:
        for o in p["objectives"]:
            self.assertIn("owner_name", o)
            self.assertIn("owner_image", o)

def test_period_has_progress(self):
    # spec: each period exposes its aggregate progress for the header label.
    objectives = [
        {"name": "O1", "title": "A", "status": "On Track", "pdca_phase": "Do",
         "objective_owner": None, "period": "2026-Q1",
         "period_start": "2026-01-01", "period_end": "2026-03-31"},
    ]
    krs = {"O1": [{"current": 50.0, "target": 100.0}]}
    periods = brand_okr._group_by_period(objectives, krs)
    self.assertIn("progress", periods[0])
    self.assertEqual(periods[0]["progress"], periods[0]["objectives"][0]["progress"])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker exec frappe-backend-1 bench --site task.localhost run-tests --app vernon_tasks --module vernon_tasks.brand.api.test_brand_okr`
Expected: FAIL — `KeyError: 'summary'` (and `'progress'` missing on period).

- [ ] **Step 3: Add period progress inside `_group_by_period`**

In `brand/api/brand_okr.py`, in `_group_by_period`, after the objective loop builds all buckets and before the return, compute each period's aggregate progress (mean of its objectives' progress):

Locate the tail of `_group_by_period`:

```python
    keys = [k for k in order if k != NO_PERIOD_LABEL]
    if NO_PERIOD_LABEL in buckets:
        keys.append(NO_PERIOD_LABEL)
    return [buckets[k] for k in keys]
```

Replace with:

```python
    for bucket in buckets.values():
        objs = bucket["objectives"]
        bucket["progress"] = round(sum(o["progress"] for o in objs) / len(objs)) if objs else 0
    keys = [k for k in order if k != NO_PERIOD_LABEL]
    if NO_PERIOD_LABEL in buckets:
        keys.append(NO_PERIOD_LABEL)
    return [buckets[k] for k in keys]
```

- [ ] **Step 4: Add `_summary` and `_attach_owners` helpers**

Add these to `brand/api/brand_okr.py` (after `_is_current`). Add the constant near the top constants block:

```python
USER_DOCTYPE = "User"
DEFAULT_STATUS = "Open"
```

```python
def _summary(periods: list[dict]) -> dict:
    """At-a-glance brand health, computed from already-loaded periods (no DB hit).

    avg_progress = mean of per-objective aggregate progress; status_counts feeds
    the segment bar; active_period mirrors the is_current period's progress.
    spec: 2026-06-06-brand-detail-informative §3.1.1.
    """
    objectives = [o for p in periods for o in p["objectives"]]
    obj_count = len(objectives)
    kr_count = sum(len(o["key_results"]) for o in objectives)
    status_counts: dict[str, int] = {}
    for o in objectives:
        key = o.get("status") or DEFAULT_STATUS
        status_counts[key] = status_counts.get(key, 0) + 1
    avg_progress = round(sum(o["progress"] for o in objectives) / obj_count) if obj_count else 0
    current = next((p for p in periods if p.get("is_current")), None)
    active_period = {"period": current["period"], "progress": current["progress"]} if current else None
    return {
        "objective_count": obj_count,
        "kr_count": kr_count,
        "avg_progress": avg_progress,
        "status_counts": status_counts,
        "at_risk_count": status_counts.get("At Risk", 0),
        "active_period": active_period,
    }


def _attach_owners(periods: list[dict]) -> None:
    """Resolve each objective's owner to display name + avatar in ONE query.

    Mutates the period dicts in place, adding owner_name / owner_image. Falls back
    to the raw owner id (name) and None (image) when the User row is missing.
    Avoids N+1 by batching all distinct owners into a single get_all.
    """
    owner_ids = {o["owner"] for p in periods for o in p["objectives"] if o.get("owner")}
    info: dict[str, dict] = {}
    if owner_ids:
        rows = frappe.get_all(
            USER_DOCTYPE,
            filters={"name": ["in", list(owner_ids)]},
            fields=["name", "full_name", "user_image"],
        )
        info = {r["name"]: {"name": r.get("full_name") or r["name"],
                            "image": r.get("user_image")} for r in rows}
    for p in periods:
        for o in p["objectives"]:
            resolved = info.get(o.get("owner"))
            o["owner_name"] = resolved["name"] if resolved else (o.get("owner") or None)
            o["owner_image"] = resolved["image"] if resolved else None
```

- [ ] **Step 5: Wire them into `get_brand_okr`**

In `brand/api/brand_okr.py`, add the import near the top:

```python
from vernon_tasks.brand.api.portal_brands import brand_execution
```

Then change the body of `get_brand_okr`. Replace:

```python
    objectives = _read_objectives(brand_id)
    krs_by_obj = _read_key_results([o["name"] for o in objectives])
    return {
        "brand": {
            "id": brand["name"],
            "brand_name": brand.get("brand_name"),
            "logo": brand.get("logo"),
            "description": brand.get("description"),
        },
        # Per-doctype edit gating — affordances are hidden unless the user holds
        # the matching permission (Objective and Key Result are separate doctypes).
        "can_create_objective": bool(frappe.has_permission(OBJECTIVE_DOCTYPE, "create")),
        "can_edit_objective": bool(frappe.has_permission(OBJECTIVE_DOCTYPE, "write")),
        "can_create_kr": bool(frappe.has_permission(KEY_RESULT_DOCTYPE, "create")),
        "can_edit_kr": bool(frappe.has_permission(KEY_RESULT_DOCTYPE, "write")),
        "periods": _group_by_period(objectives, krs_by_obj),
    }
```

with:

```python
    objectives = _read_objectives(brand_id)
    krs_by_obj = _read_key_results([o["name"] for o in objectives])
    periods = _group_by_period(objectives, krs_by_obj)
    _attach_owners(periods)
    return {
        "brand": {
            "id": brand["name"],
            "brand_name": brand.get("brand_name"),
            "logo": brand.get("logo"),
            "description": brand.get("description"),
        },
        # Per-doctype edit gating — affordances are hidden unless the user holds
        # the matching permission (Objective and Key Result are separate doctypes).
        "can_create_objective": bool(frappe.has_permission(OBJECTIVE_DOCTYPE, "create")),
        "can_edit_objective": bool(frappe.has_permission(OBJECTIVE_DOCTYPE, "write")),
        "can_create_kr": bool(frappe.has_permission(KEY_RESULT_DOCTYPE, "create")),
        "can_edit_kr": bool(frappe.has_permission(KEY_RESULT_DOCTYPE, "write")),
        "summary": _summary(periods),
        "execution": brand_execution(brand_id),
        "periods": periods,
    }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `docker exec frappe-backend-1 bench --site task.localhost run-tests --app vernon_tasks --module vernon_tasks.brand.api.test_brand_okr`
Expected: PASS (new tests + all pre-existing tests, including the `_group_by_period` ones).

- [ ] **Step 7: Commit**

```bash
git add brand/api/brand_okr.py brand/api/test_brand_okr.py
git commit -m "feat(brand): get_brand_okr return summary + execution + owner display"
```

---

## Task 3: Page render — stat bar, execution, owner/confidence (vt_brand_detail.js)

**Files:**
- Modify: `task/page/vt_brand_detail/vt_brand_detail.js`

No JS unit-test harness exists in this project — verify by manual smoke (Task 6). Keep every function focused and under 40 lines; all user strings Bahasa Indonesia; route every value through the existing `esc()` / `pct()` helpers.

- [ ] **Step 1: Add constants**

Near the existing constants (after `STATUS_COLORS`), add a segment-bar color order and labels:

```javascript
// Status segment bar — render order + color, reusing STATUS_COLORS values.
const STATUS_ORDER = ["On Track", "At Risk", "Open", "Closed"];
```

- [ ] **Step 2: Render the stat bar after the hero**

In `render(...)`, after `root.append(hero(data.brand));`, insert:

```javascript
    root.append(stat_bar(data.summary));
    if (data.execution && data.execution.project_count > 0) {
        root.append(execution_section(data.execution));
    }
```

Add the two new functions (place them after `hero(...)`):

```javascript
/**
 * Summary stat bar: metric chips + active-period bar + status segment bar.
 * @param {object} s - get_brand_okr().summary.
 * @returns {jQuery}
 */
function stat_bar(s) {
    const chips = [
        `<span class="vt-stat-chip"><b>${s.objective_count}</b> Objective</span>`,
        `<span class="vt-stat-chip"><b>${s.kr_count}</b> KR</span>`,
        `<span class="vt-stat-chip"><b>${pct(s.avg_progress)}%</b> rata-rata</span>`,
        `<span class="vt-stat-chip vt-stat-chip--risk"><b>${s.at_risk_count}</b> At Risk</span>`,
    ].join("");
    const ap = s.active_period
        ? `<div class="vt-stat-active">Period aktif <b>${esc(s.active_period.period)}</b>: ${pct(s.active_period.progress)}%
             <div class="vt-bar"><div class="vt-bar-fill" style="width:${pct(s.active_period.progress)}%;"></div></div></div>`
        : "";
    return $(`<div class="vh-section vt-stat-bar">
        <div class="vt-stat-chips">${chips}</div>
        ${ap}
        ${status_segments(s.status_counts)}
    </div>`);
}

/**
 * Thin segmented bar showing objective status distribution.
 * @param {object} counts - {status: n}.
 * @returns {string} HTML (empty when no objectives).
 */
function status_segments(counts) {
    const total = STATUS_ORDER.reduce((acc, k) => acc + (counts[k] || 0), 0);
    if (!total) return "";
    const segs = STATUS_ORDER.filter((k) => counts[k]).map((k) => {
        const width = (counts[k] / total) * 100;
        return `<div title="${esc(k)}: ${counts[k]}" style="width:${width}%;background:${STATUS_COLORS[k]};"></div>`;
    }).join("");
    return `<div class="vt-status-seg">${segs}</div>`;
}

/**
 * Collapsible execution section: active sprint + remaining work + project list.
 * @param {object} e - get_brand_okr().execution.
 * @returns {jQuery}
 */
function execution_section(e) {
    const sprint = e.active_sprint_title
        ? `Sprint aktif: <b>${esc(e.active_sprint_title)}</b>${e.active_sprint_count > 1 ? ` (+${e.active_sprint_count - 1})` : ""}`
        : "Tidak ada sprint aktif";
    const projects = e.projects.map((p) =>
        `<div class="vt-exec-proj" data-id="${esc(p.id)}">
            <span>${esc(p.name)}</span>
            <span class="vh-item-meta">${pct(p.progress)}%</span>
        </div>`).join("");
    const section = $(`<div class="vh-section vt-period vt-exec">
        <div class="vt-period-head" style="cursor:pointer;">
            <span class="vt-caret">▼</span>
            <strong>Eksekusi</strong>
            <span class="vh-item-meta">${e.project_count} proyek</span>
        </div>
        <div class="vt-period-body" style="margin-top:10px;">
            <div class="vt-exec-meta">${sprint} · Sisa: ${e.remaining_tasks} tugas / ${e.remaining_minutes}m · Progress ${pct(e.progress_pct)}%</div>
            <div class="vt-bar"><div class="vt-bar-fill vt-bar-fill--exec" style="width:${pct(e.progress_pct)}%;"></div></div>
            <div class="vt-exec-list">${projects}</div>
        </div>
    </div>`);
    const body = section.find(".vt-period-body");
    section.find(".vt-period-head").on("click", () => {
        const visible = body.is(":visible");
        body.toggle();
        section.find(".vt-caret").text(visible ? "▶" : "▼");
    });
    section.find(".vt-exec-proj").on("click", function () {
        frappe.set_route("vt-project-detail", $(this).data("id"));
    });
    return section;
}
```

- [ ] **Step 3: Show period progress in the period header**

In `period_section`, change the header meta line. Replace:

```javascript
            <span class="vh-item-meta">${p.objectives.length} objective</span>
```

with:

```javascript
            <span class="vh-item-meta">${p.objectives.length} objective · ${pct(p.progress)}%</span>
```

- [ ] **Step 4: Add owner chip to the objective card**

In `objective_card`, inside the header `<div>` (the flex row), add an owner chip before the edit/KR buttons. Replace:

```javascript
            <span class="vh-item-meta">${o.progress}%</span>
            <span style="margin-left:auto;display:flex;gap:6px;">${obj_edit}${kr_add}</span>
```

with:

```javascript
            <span class="vh-item-meta">${o.progress}%</span>
            ${owner_chip(o)}
            <span style="margin-left:auto;display:flex;gap:6px;">${obj_edit}${kr_add}</span>
```

Add the helper (after `objective_card`):

```javascript
/**
 * Owner chip: avatar (image or initial circle) + name. Empty when no owner.
 * @param {object} o - objective with owner_name / owner_image.
 * @returns {string} HTML.
 */
function owner_chip(o) {
    if (!o.owner_name) return "";
    const name = esc(o.owner_name);
    const avatar = o.owner_image
        ? `<img src="${esc(o.owner_image)}" alt="${name}">`
        : `<span class="vt-owner-initial">${name.slice(0, 1).toUpperCase()}</span>`;
    return `<span class="vt-owner-chip">${avatar}${name}</span>`;
}
```

- [ ] **Step 5: Add confidence chip to the KR row**

In `kr_row`, add a confidence chip next to the progress percent. Replace:

```javascript
        <span class="vh-item-meta">${kr.progress_percent}%</span>
        ${edit}
```

with:

```javascript
        <span class="vh-item-meta">${kr.progress_percent}%</span>
        ${kr.confidence ? `<span class="vt-kr-conf" title="Confidence">c:${pct(kr.confidence)}%</span>` : ""}
        ${edit}
```

- [ ] **Step 6: Commit**

```bash
git add task/page/vt_brand_detail/vt_brand_detail.js
git commit -m "feat(brand): render stat bar, execution section, owner + confidence chips"
```

---

## Task 4: Styling (vt_home.css)

**Files:**
- Modify: `public/css/vt_home.css`

- [ ] **Step 1: Append the new classes**

Add to the end of `public/css/vt_home.css`:

```css
/* ---- Brand detail: stat bar + execution + owner/confidence chips ---- */
.vt-stat-bar { display: flex; flex-direction: column; gap: 10px; }
.vt-stat-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.vt-stat-chip {
    font-size: 12px; padding: 4px 10px; border-radius: 999px;
    background: #f1f5f9; color: #334155;
}
.vt-stat-chip b { font-size: 14px; }
.vt-stat-chip--risk { background: #fef3c7; color: #92400e; }
.vt-stat-active { font-size: 12px; color: #475569; }
.vt-bar { height: 6px; background: #e5e7eb; border-radius: 3px; overflow: hidden; margin-top: 4px; }
.vt-bar-fill { height: 100%; background: #6366f1; }
.vt-bar-fill--exec { background: #0ea5e9; }
.vt-status-seg {
    display: flex; height: 8px; border-radius: 4px; overflow: hidden; gap: 1px;
}
.vt-owner-chip {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 11px; color: #475569;
}
.vt-owner-chip img, .vt-owner-initial {
    width: 18px; height: 18px; border-radius: 50%; object-fit: cover;
}
.vt-owner-initial {
    display: inline-flex; align-items: center; justify-content: center;
    background: #6366f1; color: #fff; font-size: 10px; font-weight: 700;
}
.vt-kr-conf {
    font-size: 11px; padding: 1px 6px; border-radius: 8px;
    background: #ecfdf5; color: #047857;
}
.vt-exec-meta { font-size: 12px; color: #475569; margin-bottom: 6px; }
.vt-exec-list { margin-top: 8px; }
.vt-exec-proj {
    display: flex; justify-content: space-between; align-items: center;
    padding: 5px 0; border-top: 1px solid #f1f1f1; cursor: pointer;
}
.vt-exec-proj:hover { color: #6366f1; }
```

- [ ] **Step 2: Build assets**

Run: `docker exec frappe-backend-1 bench build --app vernon_tasks`
Expected: build succeeds (CSS bundled into `/assets/vernon_tasks/css/vt_home.css`).

- [ ] **Step 3: Commit**

```bash
git add public/css/vt_home.css
git commit -m "style(brand): stat bar, segment bar, owner + confidence chip styles"
```

---

## Task 5: Restart + manual smoke

**Files:** none (verification only)

- [ ] **Step 1: Restart backend (whitelist module reload)**

Run: `docker restart frappe-backend-1`
Expected: container restarts; gunicorn reloads `brand_okr` + `portal_brands`.

- [ ] **Step 2: Smoke the endpoint via bench execute**

Run:
```bash
docker exec frappe-backend-1 bench --site task.localhost execute vernon_tasks.brand.api.brand_okr.get_brand_okr --kwargs '{"brand_id": "Default"}'
```
Expected: JSON containing `summary` (with `objective_count`, `status_counts`, `active_period`), `execution` (with `project_count`, `projects`), and each objective carrying `owner_name` / `owner_image`.

- [ ] **Step 3: Visual check**

Open `http://task.localhost:8080/app/vt-brand-detail/Default`. Confirm:
- Stat bar shows 4 chips + active-period bar + status segment bar.
- Execution section appears (if the brand has projects) and collapses; clicking a project routes to `vt-project-detail`.
- Objective cards show an owner chip; KR rows show `c:NN%` when confidence is set.
- Period headers show `N objective · NN%`.

If any block is wrong, fix in the relevant file and re-run the matching test before continuing.

---

## Task 6: Docs + tracker + memory, then merge

**Files:**
- Modify: `docs/implementation-tracker.md` (if present), `.wolf/anatomy.md`, memory index

- [ ] **Step 1: Update implementation tracker**

If `docs/implementation-tracker.md` exists, mark the brand-detail-informative spec as implemented (Tests column = the two new test files). Recalculate the Summary table. If the tracker does not exist, skip.

- [ ] **Step 2: Update anatomy + memory**

- Update the `.wolf/anatomy.md` entries for `brand_okr.py`, `portal_brands.py`, and `vt_brand_detail.js` to mention `summary` / `execution` / owner+confidence.
- Update the memory pointer `project_brand_detail_okr.md` body to note the page now shows stat bar + execution + owner/confidence (one line).

- [ ] **Step 3: Commit docs**

```bash
git add docs/ .wolf/anatomy.md
git commit -m "docs(brand): tracker + anatomy for brand-detail diperkaya"
```

- [ ] **Step 4: Merge to master**

```bash
git checkout master
git merge --no-ff feat/brand-detail-informative -m "Merge: brand-detail diperkaya (stats+execution+owner/confidence)"
```

- [ ] **Step 5: Clean up branch**

```bash
git branch -d feat/brand-detail-informative
```

> Push only if the user asks.

---

## Self-Review (done while writing)

- **Spec coverage:** stat bar → Task 3 step 2; execution → Task 1 + Task 3 step 2; owner chip → Task 2 + Task 3 step 4; confidence chip → Task 3 step 5; per-period progress (trend) → Task 2 step 3 + Task 3 step 3. All four selected features covered.
- **Placeholder scan:** no TBD/TODO; all code shown in full. The only conditional ("adapt to the file's actual fixtures") is a necessary guard because the test file's `setUp` is reused, not rewritten.
- **Type consistency:** `brand_execution` keys defined in Task 1 are consumed identically in Task 3 `execution_section`. `summary` keys defined in Task 2 are consumed identically in Task 3 `stat_bar`. `owner_name`/`owner_image` defined in Task 2 `_attach_owners`, consumed in Task 3 `owner_chip`. `_zero_task_agg` defined and used in Task 1. `STATUS_ORDER`/`STATUS_COLORS` consistent in Task 3.

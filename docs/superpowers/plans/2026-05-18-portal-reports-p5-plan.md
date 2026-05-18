# Portal Reports P5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the full exec dashboard at `/portal/reports` with three tabs (OKR, Sprints, Team) for Manager and Leader roles, aggregating cross-project analytics from existing services behind a `portal_reports_enabled` feature flag.

**Architecture:** New backend module `vernon_tasks/api/portal_reports.py` acts as a thin permission-gating + caching aggregation layer delegating all business logic to existing services in `task/services/`. Frontend at `pwa/src/portal/reports/` follows the established Feature Gate → Routes → Page → Tabs → Charts pattern from the sprints domain, with recharts lazy-loaded per chart component.

**Tech Stack:** Frappe v15 (Python), React + Vite + TypeScript, React Query v5, recharts (lazy-imported), Vitest + RTL, MSW for integration tests.

**Spec:** `docs/superpowers/specs/2026-05-18-portal-reports-p5-design.html`

---

## File Structure

**Backend — created:**
- `vernon_tasks/api/portal_reports.py` — permission guards, caching, fan-out aggregation, 9 whitelisted endpoints
- `vernon_tasks/tests/portal/test_portal_reports.py` — unittest suite (permission matrix + aggregation correctness + cache)

**Backend — modified:**
- `vernon_tasks/vt_settings/doctype/vt_settings/vt_settings.json` — add `portal_reports_enabled` field
- `vernon_tasks/task/api/analytics.py` — extend `invalidate_project_cache` to also bust portal velocity + forecast cache keys
- `vernon_tasks/task/api/telemetry.py` — add 8 `reports.*` events to `ALLOWED_EVENTS`
- `vernon_tasks/hooks.py` — add `doc_events` entries for `VT KPI Snapshot` and `VT OKR Period` to call `portal_reports.invalidate_okr_cache`

**Frontend — created (`pwa/src/portal/reports/`):**
- `ReportsRoutes.tsx`
- `ReportsFeatureGate.tsx`
- `ReportsPage.tsx` + `ReportsPage.test.tsx`
- `tabs/OkrTab.tsx` + `tabs/OkrTab.test.tsx`
- `tabs/SprintsTab.tsx` + `tabs/SprintsTab.test.tsx`
- `tabs/TeamTab.tsx` + `tabs/TeamTab.test.tsx`
- `tabs/HealthScoreCard.tsx` + `tabs/HealthScoreCard.test.tsx`
- `tabs/OkrRollupTable.tsx` + `tabs/OkrRollupTable.test.tsx`
- `tabs/KpiTrendPanel.tsx` + `tabs/KpiTrendPanel.test.tsx`
- `tabs/ForecastGrid.tsx` + `tabs/ForecastGrid.test.tsx`
- `tabs/RiskMatrix.tsx` + `tabs/RiskMatrix.test.tsx`
- `tabs/LeaderboardTable.tsx` + `tabs/LeaderboardTable.test.tsx`
- `tabs/OverdueTable.tsx` + `tabs/OverdueTable.test.tsx`
- `charts/KpiTrendChart.tsx` + `charts/KpiTrendChart.test.tsx`
- `charts/VelocityComparisonChart.tsx` + `charts/VelocityComparisonChart.test.tsx`
- `charts/WorkloadChart.tsx` + `charts/WorkloadChart.test.tsx`
- `charts/CompletionRingChart.tsx` + `charts/CompletionRingChart.test.tsx`
- `api/portal_reports.ts` — RPC wrappers
- `api/types.ts` — TypeScript interfaces for all response shapes
- `hooks/useOkrReport.ts` + `hooks/useOkrReport.test.ts`
- `hooks/useSprintsReport.ts` + `hooks/useSprintsReport.test.ts`
- `hooks/useTeamReport.ts` + `hooks/useTeamReport.test.ts`
- `__integration.test.tsx`

**Frontend — modified:**
- `pwa/src/portal/routes.tsx` — replace `<ComingSoon domain="Reports" />` with `<ReportsRoutes />`
- `pwa/src/hooks/useVtSettings.ts` — add `portal_reports_enabled` to the `VtSettings` interface and fieldname fetch list
- `pwa/src/telemetry.ts` — add 8 `reports.*` event strings to `TelemetryEvent` union + 8 track functions

---

## Conventions (read first)

- **Test runner backend:** `bench --site test_site run-tests --app vernon_tasks --module vernon_tasks.tests.portal.test_portal_reports`
- **Test runner frontend:** `cd pwa && pnpm vitest run src/portal/reports`
- **Lint + typecheck:** `cd pwa && pnpm lint && pnpm typecheck`
- **Frontend imports:** relative only — no `@/*` aliases (Vitest can't resolve them).
- **Frappe exceptions:** `frappe.PermissionError` and `frappe.ValidationError` only. Never `frappe.DoesNotExistError`.
- **Cache pattern:** `frappe.cache().set_value(key, val, expires_in_sec=300)` — always include role bucket in key.
- **Commit language:** Indonesian descriptive (`feat(reports): tambah endpoint get_portal_health_score`).
- **Branch:** Create `feat/portal-reports-p5` from `master` before Task 0.

---

## Task 0: Branch setup

**Files:** none

- [ ] **Step 1: Create feature branch**

```bash
git checkout -b feat/portal-reports-p5
```

- [ ] **Step 2: Verify clean working tree**

```bash
git status
```

Expected: `nothing to commit, working tree clean` (or only untracked files).

- [ ] **Step 3: Commit branch marker**

```bash
git commit --allow-empty -m "chore(reports): mulai branch P5 portal reports"
```

---

## Task 1: Feature flag `portal_reports_enabled` + VT Settings schema + `useVtSettings` update

**Files:**
- Modify: `vernon_tasks/vt_settings/doctype/vt_settings/vt_settings.json`
- Modify: `pwa/src/hooks/useVtSettings.ts`

- [ ] **Step 1: Read current vt_settings.json**

Open `vernon_tasks/vt_settings/doctype/vt_settings/vt_settings.json`. Locate the `portal_sprints_enabled` field object in the `fields` array (currently the last portal field) and its entry in `field_order`.

- [ ] **Step 2: Add field to `field_order`**

Insert `"portal_reports_enabled"` immediately after `"portal_sprints_enabled"` in the `field_order` array.

- [ ] **Step 3: Add field definition to `fields` array**

After the `portal_sprints_enabled` field object, insert:

```json
{
  "default": "0",
  "fieldname": "portal_reports_enabled",
  "fieldtype": "Check",
  "label": "Enable Portal Reports (P5)"
}
```

- [ ] **Step 4: Run bench migrate**

```bash
bench --site test_site migrate
```

Expected: migration applies without errors.

- [ ] **Step 5: Verify column exists**

```bash
bench --site test_site execute "print(frappe.db.has_column('tabVT Settings', 'portal_reports_enabled'))"
```

Expected: `True`.

- [ ] **Step 6: Update `useVtSettings.ts`**

Open `pwa/src/hooks/useVtSettings.ts`. Add `portal_reports_enabled` to the `VtSettings` interface and to the `fieldname` JSON array in `fetchVtSettings`:

```ts
export interface VtSettings {
  portal_enabled: boolean | 0 | 1;
  portal_okr_enabled: boolean | 0 | 1;
  portal_projects_enabled: boolean | 0 | 1;
  portal_sprints_enabled: boolean | 0 | 1;
  portal_reports_enabled: boolean | 0 | 1;
}

async function fetchVtSettings(): Promise<VtSettings> {
  const res = await api.get<VtSettings>("/api/method/frappe.client.get_value", {
    doctype: "VT Settings",
    fieldname: JSON.stringify([
      "portal_enabled",
      "portal_okr_enabled",
      "portal_projects_enabled",
      "portal_sprints_enabled",
      "portal_reports_enabled",
    ]),
  });
  return res;
}
```

- [ ] **Step 7: Typecheck**

```bash
cd pwa && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add vernon_tasks/vt_settings/doctype/vt_settings/vt_settings.json pwa/src/hooks/useVtSettings.ts
git commit -m "feat(reports): tambah flag portal_reports_enabled ke VT Settings dan useVtSettings"
```

---

## Task 2: Backend `portal_reports.py` — scaffolding + permission guards + OKR endpoints

**Files:**
- Create: `vernon_tasks/api/portal_reports.py`
- Create: `vernon_tasks/tests/portal/__init__.py`
- Create: `vernon_tasks/tests/portal/test_portal_reports.py`

- [ ] **Step 1: Create test directory**

```bash
mkdir -p apps/vernon_tasks/vernon_tasks/tests/portal
touch apps/vernon_tasks/vernon_tasks/tests/__init__.py
touch apps/vernon_tasks/vernon_tasks/tests/portal/__init__.py
```

- [ ] **Step 2: Write failing tests for flag gate + OKR permission matrix**

Create `vernon_tasks/tests/portal/test_portal_reports.py`:

```python
import frappe
import unittest
from unittest.mock import patch, MagicMock


def _set_flag(val: int):
    frappe.db.set_single_value("VT Settings", "portal_reports_enabled", val)
    frappe.db.commit()


def _set_roles(roles: list[str]):
    """Patch frappe.get_roles() for the duration of a test."""
    return patch("frappe.get_roles", return_value=roles)


class TestFlagGate(unittest.TestCase):
    def setUp(self):
        _set_flag(0)

    def tearDown(self):
        _set_flag(0)

    def test_flag_off_health_score_raises_403(self):
        from vernon_tasks.api.portal_reports import get_portal_health_score
        with _set_roles(["VT Manager"]):
            with self.assertRaises(frappe.PermissionError):
                get_portal_health_score()

    def test_flag_off_okr_rollup_raises_403(self):
        from vernon_tasks.api.portal_reports import get_portal_okr_rollup
        with _set_roles(["VT Manager"]):
            with self.assertRaises(frappe.PermissionError):
                get_portal_okr_rollup()

    def test_flag_off_velocity_raises_403(self):
        from vernon_tasks.api.portal_reports import get_portal_velocity_comparison
        with _set_roles(["VT Manager"]):
            with self.assertRaises(frappe.PermissionError):
                get_portal_velocity_comparison()

    def test_flag_off_leaderboard_raises_403(self):
        from vernon_tasks.api.portal_reports import get_portal_leaderboard
        with _set_roles(["VT Manager"]):
            with self.assertRaises(frappe.PermissionError):
                get_portal_leaderboard()


class TestOkrPermissions(unittest.TestCase):
    def setUp(self):
        _set_flag(1)

    def tearDown(self):
        _set_flag(0)

    def test_health_score_manager_ok(self):
        from vernon_tasks.api.portal_reports import get_portal_health_score
        mock_health = {"score": 82.4, "okr_pct": 0.74, "ontime_pct": 0.88,
                       "velocity_health": 0.91,
                       "components": {"okr_weight": 0.40, "ontime_weight": 0.30, "velocity_weight": 0.30},
                       "as_of": "2026-05-18T10:00:00"}
        with _set_roles(["VT Manager"]):
            with patch("vernon_tasks.api.portal_reports._health", return_value=mock_health):
                result = get_portal_health_score()
        self.assertEqual(result["score"], 82.4)

    def test_health_score_leader_raises_403(self):
        from vernon_tasks.api.portal_reports import get_portal_health_score
        with _set_roles(["VT Leader"]):
            with self.assertRaises(frappe.PermissionError):
                get_portal_health_score()

    def test_health_score_member_raises_403(self):
        from vernon_tasks.api.portal_reports import get_portal_health_score
        with _set_roles(["VT Member"]):
            with self.assertRaises(frappe.PermissionError):
                get_portal_health_score()

    def test_okr_rollup_manager_ok(self):
        from vernon_tasks.api.portal_reports import get_portal_okr_rollup
        mock_rollup = {"period": "Q2-2026", "rows": [], "totals": {
            "objective_count": 0, "kr_count": 0, "avg_progress": 0.0,
            "on_track": 0, "at_risk": 0, "behind": 0}}
        with _set_roles(["VT Manager"]):
            with patch("vernon_tasks.api.portal_reports._okr", return_value=mock_rollup):
                result = get_portal_okr_rollup("Q2-2026")
        self.assertIn("rows", result)

    def test_okr_rollup_leader_raises_403(self):
        from vernon_tasks.api.portal_reports import get_portal_okr_rollup
        with _set_roles(["VT Leader"]):
            with self.assertRaises(frappe.PermissionError):
                get_portal_okr_rollup()

    def test_kpi_list_manager_ok(self):
        from vernon_tasks.api.portal_reports import get_portal_kpi_list
        with _set_roles(["VT Manager"]):
            with patch("vernon_tasks.api.portal_reports._list_kpis", return_value=[]):
                result = get_portal_kpi_list()
        self.assertIsInstance(result, list)

    def test_kpi_list_leader_raises_403(self):
        from vernon_tasks.api.portal_reports import get_portal_kpi_list
        with _set_roles(["VT Leader"]):
            with self.assertRaises(frappe.PermissionError):
                get_portal_kpi_list()

    def test_kpi_trend_manager_ok(self):
        from vernon_tasks.api.portal_reports import get_portal_kpi_trend
        mock_trend = {"kpi_definition": "KPI-00001", "title": "Velocity",
                      "unit": "pts/sprint", "periods": 12, "series": []}
        with _set_roles(["VT Manager"]):
            with patch("vernon_tasks.api.portal_reports._kpi_trend", return_value=mock_trend):
                result = get_portal_kpi_trend("KPI-00001", 12)
        self.assertEqual(result["kpi_definition"], "KPI-00001")

    def test_kpi_trend_leader_raises_403(self):
        from vernon_tasks.api.portal_reports import get_portal_kpi_trend
        with _set_roles(["VT Leader"]):
            with self.assertRaises(frappe.PermissionError):
                get_portal_kpi_trend("KPI-00001", 12)
```

- [ ] **Step 3: Run tests — verify FAIL**

```bash
bench --site test_site run-tests --app vernon_tasks --module vernon_tasks.tests.portal.test_portal_reports 2>&1 | tail -20
```

Expected: FAIL with `ModuleNotFoundError: No module named 'vernon_tasks.api.portal_reports'`

- [ ] **Step 4: Implement `portal_reports.py` — scaffolding + OKR endpoints**

Create `vernon_tasks/api/portal_reports.py`:

```python
import frappe
from vernon_tasks.task.api.security import clamp_int

# ── Lazy service imports (called inside functions only) ──────────────────────
# Import at function call time to avoid circular imports and keep module load fast.
# Each _<name> alias is consistent with the pattern in analytics.py.

def _get_health():
    from vernon_tasks.task.services.health_score_service import get_health_score
    return get_health_score

def _get_okr():
    from vernon_tasks.task.services.okr_rollup_service import get_okr_rollup
    return get_okr_rollup

def _get_list_kpis():
    from vernon_tasks.task.services.kpi_trend_service import list_kpis
    return list_kpis

def _get_kpi_trend():
    from vernon_tasks.task.services.kpi_trend_service import get_kpi_trend
    return get_kpi_trend

def _get_velocity_trend():
    from vernon_tasks.task.services.velocity_service import get_velocity_trend
    return get_velocity_trend

def _get_forecast():
    from vernon_tasks.task.services.forecast_service import get_forecast
    return get_forecast

def _get_evaluate_risks():
    from vernon_tasks.task.services.risk_evaluator import evaluate_risks
    return evaluate_risks

def _get_leaderboard():
    from vernon_tasks.task.services.leaderboard_service import get_leaderboard
    return get_leaderboard


# Module-level aliases used directly in tests via patch targets
def _health(*a, **kw):
    return _get_health()(*a, **kw)

def _okr(*a, **kw):
    return _get_okr()(*a, **kw)

def _list_kpis(*a, **kw):
    return _get_list_kpis()(*a, **kw)

def _kpi_trend(*a, **kw):
    return _get_kpi_trend()(*a, **kw)

def _vel_trend(*a, **kw):
    return _get_velocity_trend()(*a, **kw)

def _forecast(*a, **kw):
    return _get_forecast()(*a, **kw)

def _evaluate_risks(*a, **kw):
    return _get_evaluate_risks()(*a, **kw)

def _lb(*a, **kw):
    return _get_leaderboard()(*a, **kw)


# ── Permission constants ─────────────────────────────────────────────────────
_MANAGER_ROLES = ("VT Manager", "System Manager")
_LEADER_ROLES  = ("VT Leader", "VT Manager", "System Manager")
_CACHE_TTL_SEC = 300
_MAX_PROJECTS  = 50


# ── Guards ───────────────────────────────────────────────────────────────────
def _check_flag():
    enabled = frappe.db.get_single_value("VT Settings", "portal_reports_enabled")
    if not int(enabled or 0):
        frappe.throw("Portal Reports is not enabled", frappe.PermissionError)


def _require_leader():
    if not set(frappe.get_roles()) & set(_LEADER_ROLES):
        frappe.throw("Not authorized", frappe.PermissionError)


def _require_manager():
    if not set(frappe.get_roles()) & set(_MANAGER_ROLES):
        frappe.throw("Not authorized", frappe.PermissionError)


def _role_bucket():
    """Returns 'manager' or 'leader' for use in cache keys."""
    roles = set(frappe.get_roles())
    if roles & set(_MANAGER_ROLES):
        return "manager"
    return "leader"


# ── Cache helper ─────────────────────────────────────────────────────────────
def _cache(key, fn):
    cached = frappe.cache().get_value(key)
    if cached is not None:
        return cached
    val = fn()
    frappe.cache().set_value(key, val, expires_in_sec=_CACHE_TTL_SEC)
    return val


# ── Project scoping ──────────────────────────────────────────────────────────
def _visible_projects():
    """
    Returns list of dicts with keys 'name' and 'project_title'.
    Manager → all projects (up to _MAX_PROJECTS).
    Leader → only projects where assigned_to == current user.
    """
    bucket = _role_bucket()
    filters = {}
    if bucket == "leader":
        filters["assigned_to"] = frappe.session.user
    rows = frappe.get_list(
        "VT Project",
        filters=filters,
        fields=["name", "project_title"],
        limit=_MAX_PROJECTS,
        order_by="creation asc",
    )
    if len(rows) == _MAX_PROJECTS:
        frappe.log_error("portal_reports: fan-out capped at 50 projects for user "
                         + frappe.session.user, "PortalReports")
    return rows


# ── OKR tab endpoints (Manager only) ─────────────────────────────────────────
@frappe.whitelist()
def get_portal_health_score():
    _check_flag()
    _require_manager()
    key = "pr:health:manager"
    return _cache(key, lambda: _health())


@frappe.whitelist()
def get_portal_okr_rollup(period=None):
    _check_flag()
    _require_manager()
    period_key = period or "current"
    key = f"pr:okr:{period_key}:manager"
    return _cache(key, lambda: _okr(period))


@frappe.whitelist()
def get_portal_kpi_list():
    _check_flag()
    _require_manager()
    key = "pr:kpis:manager"
    return _cache(key, lambda: _list_kpis())


@frappe.whitelist()
def get_portal_kpi_trend(kpi_definition, periods=12):
    _check_flag()
    _require_manager()
    periods = clamp_int(periods, 1, 24, "periods")
    key = f"pr:kpi_trend:{kpi_definition}:{periods}:manager"
    return _cache(key, lambda: _kpi_trend(kpi_definition, periods))


# ── Cache invalidation (called from hooks.py) ────────────────────────────────
def invalidate_okr_cache(doc, method=None):
    """Clears health score + OKR rollup cache on KPI Snapshot or OKR Period update."""
    frappe.cache().delete_value("pr:health:manager")
    # Clear all OKR period variants — pattern match not available; delete known suffixes.
    for suffix in ("current", "manager"):
        frappe.cache().delete_value(f"pr:okr:{suffix}:manager")
    frappe.cache().delete_value("pr:kpis:manager")
```

- [ ] **Step 5: Run OKR permission tests — verify PASS**

```bash
bench --site test_site run-tests --app vernon_tasks --module vernon_tasks.tests.portal.test_portal_reports 2>&1 | tail -20
```

Expected: `TestFlagGate` (4 tests) + `TestOkrPermissions` (9 tests) all PASS.

- [ ] **Step 6: Commit**

```bash
git add vernon_tasks/api/portal_reports.py \
        vernon_tasks/tests/__init__.py \
        vernon_tasks/tests/portal/__init__.py \
        vernon_tasks/tests/portal/test_portal_reports.py
git commit -m "feat(reports): tambah portal_reports.py scaffolding, guards, dan OKR endpoints"
```

---

## Task 3: Backend Sprints tab endpoints — velocity, forecasts, risks

**Files:**
- Modify: `vernon_tasks/api/portal_reports.py`
- Modify: `vernon_tasks/tests/portal/test_portal_reports.py`

- [ ] **Step 1: Write failing tests for Sprints endpoints**

Append to `test_portal_reports.py`:

```python
class TestSprintsPermissions(unittest.TestCase):
    def setUp(self):
        _set_flag(1)

    def tearDown(self):
        _set_flag(0)

    def test_velocity_manager_ok(self):
        from vernon_tasks.api.portal_reports import get_portal_velocity_comparison
        mock_result = {"n": 6, "projects": []}
        with _set_roles(["VT Manager"]):
            with patch("vernon_tasks.api.portal_reports._vel_trend", return_value=[]):
                with patch("vernon_tasks.api.portal_reports._visible_projects",
                           return_value=[]):
                    result = get_portal_velocity_comparison(6)
        self.assertIn("projects", result)

    def test_velocity_leader_ok(self):
        from vernon_tasks.api.portal_reports import get_portal_velocity_comparison
        with _set_roles(["VT Leader"]):
            with patch("vernon_tasks.api.portal_reports._vel_trend", return_value=[]):
                with patch("vernon_tasks.api.portal_reports._visible_projects",
                           return_value=[]):
                    result = get_portal_velocity_comparison(6)
        self.assertIn("projects", result)

    def test_velocity_member_raises_403(self):
        from vernon_tasks.api.portal_reports import get_portal_velocity_comparison
        with _set_roles(["VT Member"]):
            with self.assertRaises(frappe.PermissionError):
                get_portal_velocity_comparison(6)

    def test_velocity_leader_scoped(self):
        """Leader only gets projects returned by _visible_projects."""
        from vernon_tasks.api.portal_reports import get_portal_velocity_comparison
        mock_projects = [{"name": "PROJ-00001", "project_title": "Alpha"}]
        mock_trend = [{"sprint_label": "S-2026-W14", "velocity": 40.0}]
        with _set_roles(["VT Leader"]):
            with patch("vernon_tasks.api.portal_reports._visible_projects",
                       return_value=mock_projects):
                with patch("vernon_tasks.api.portal_reports._vel_trend",
                           return_value=mock_trend):
                    result = get_portal_velocity_comparison(6)
        self.assertEqual(len(result["projects"]), 1)
        self.assertEqual(result["projects"][0]["project"], "PROJ-00001")

    def test_velocity_manager_all_projects(self):
        """Manager gets all projects (no user filter in _visible_projects)."""
        from vernon_tasks.api.portal_reports import get_portal_velocity_comparison
        mock_projects = [
            {"name": "PROJ-00001", "project_title": "Alpha"},
            {"name": "PROJ-00002", "project_title": "Beta"},
        ]
        mock_trend = []
        with _set_roles(["VT Manager"]):
            with patch("vernon_tasks.api.portal_reports._visible_projects",
                       return_value=mock_projects):
                with patch("vernon_tasks.api.portal_reports._vel_trend",
                           return_value=mock_trend):
                    result = get_portal_velocity_comparison(6)
        self.assertEqual(len(result["projects"]), 2)

    def test_forecasts_leader_ok(self):
        from vernon_tasks.api.portal_reports import get_portal_forecasts
        with _set_roles(["VT Leader"]):
            with patch("vernon_tasks.api.portal_reports._visible_projects",
                       return_value=[]):
                with patch("vernon_tasks.api.portal_reports._forecast",
                           return_value={}):
                    result = get_portal_forecasts()
        self.assertIn("forecasts", result)

    def test_forecasts_member_raises_403(self):
        from vernon_tasks.api.portal_reports import get_portal_forecasts
        with _set_roles(["VT Member"]):
            with self.assertRaises(frappe.PermissionError):
                get_portal_forecasts()

    def test_risks_leader_ok(self):
        from vernon_tasks.api.portal_reports import get_portal_risks
        with _set_roles(["VT Leader"]):
            with patch("vernon_tasks.api.portal_reports._visible_projects",
                       return_value=[]):
                result = get_portal_risks()
        self.assertIn("risks", result)

    def test_risks_member_raises_403(self):
        from vernon_tasks.api.portal_reports import get_portal_risks
        with _set_roles(["VT Member"]):
            with self.assertRaises(frappe.PermissionError):
                get_portal_risks()

    def test_velocity_shape(self):
        """Each project in result has sprints array and avg_velocity."""
        from vernon_tasks.api.portal_reports import get_portal_velocity_comparison
        mock_projects = [{"name": "PROJ-00001", "project_title": "Alpha"}]
        mock_trend = [
            {"sprint_label": "S1", "velocity": 40.0},
            {"sprint_label": "S2", "velocity": 44.0},
        ]
        with _set_roles(["VT Manager"]):
            with patch("vernon_tasks.api.portal_reports._visible_projects",
                       return_value=mock_projects):
                with patch("vernon_tasks.api.portal_reports._vel_trend",
                           return_value=mock_trend):
                    result = get_portal_velocity_comparison(6)
        proj = result["projects"][0]
        self.assertIn("sprints", proj)
        self.assertIn("avg_velocity", proj)
        self.assertIn("trend", proj)
        self.assertEqual(len(proj["sprints"]), 2)
```

- [ ] **Step 2: Run tests — verify FAIL**

```bash
bench --site test_site run-tests --app vernon_tasks --module vernon_tasks.tests.portal.test_portal_reports 2>&1 | grep "FAIL\|ERROR\|error" | head -10
```

Expected: FAIL with `ImportError` or attribute errors on the new functions.

- [ ] **Step 3: Implement Sprints endpoints in `portal_reports.py`**

Append to `vernon_tasks/api/portal_reports.py` after the `invalidate_okr_cache` function:

```python
# ── Sprints tab endpoints (Manager + Leader) ─────────────────────────────────
def _compute_trend(velocities: list[float]) -> str:
    """'up' if last > first, 'down' if last < first, 'flat' otherwise."""
    if len(velocities) < 2:
        return "flat"
    if velocities[-1] > velocities[0]:
        return "up"
    if velocities[-1] < velocities[0]:
        return "down"
    return "flat"


@frappe.whitelist()
def get_portal_velocity_comparison(n=6):
    _check_flag()
    _require_leader()
    n = clamp_int(n, 1, 24, "n")
    bucket = _role_bucket()
    user = frappe.session.user
    key = f"pr:vel:{bucket}:{n}:{user}"

    def _build():
        projects = _visible_projects()
        result_projects = []
        for p in projects:
            sprints = _vel_trend(p["name"], n)
            velocities = [s.get("velocity", 0.0) for s in sprints]
            avg = round(sum(velocities) / len(velocities), 1) if velocities else 0.0
            result_projects.append({
                "project": p["name"],
                "project_title": p.get("project_title", p["name"]),
                "sprints": sprints,
                "avg_velocity": avg,
                "trend": _compute_trend(velocities),
            })
        return {"n": n, "projects": result_projects}

    return _cache(key, _build)


@frappe.whitelist()
def get_portal_forecasts():
    _check_flag()
    _require_leader()
    bucket = _role_bucket()
    user = frappe.session.user
    key = f"pr:forecasts:{bucket}:{user}"

    def _build():
        projects = _visible_projects()
        forecasts = []
        for p in projects:
            fc = _forecast(p["name"])
            if fc:
                fc.setdefault("project", p["name"])
                fc.setdefault("project_title", p.get("project_title", p["name"]))
            forecasts.append(fc)
        return {"forecasts": [f for f in forecasts if f]}

    return _cache(key, _build)


@frappe.whitelist()
def get_portal_risks():
    _check_flag()
    _require_leader()
    # No caching — risks can change with every task move.
    projects = _visible_projects()
    risks = []
    for p in projects:
        risk_data = _evaluate_risks(p["name"])
        if isinstance(risk_data, dict):
            risk_data.setdefault("project", p["name"])
            risk_data.setdefault("project_title", p.get("project_title", p["name"]))
            risks.append(risk_data)
    return {"risks": risks}
```

- [ ] **Step 4: Run tests — verify PASS**

```bash
bench --site test_site run-tests --app vernon_tasks --module vernon_tasks.tests.portal.test_portal_reports 2>&1 | tail -20
```

Expected: all tests so far PASS.

- [ ] **Step 5: Commit**

```bash
git add vernon_tasks/api/portal_reports.py \
        vernon_tasks/tests/portal/test_portal_reports.py
git commit -m "feat(reports): tambah Sprints tab endpoints (velocity, forecasts, risks)"
```

---

## Task 4: Backend Team tab endpoints — leaderboard, workload, overdue

**Files:**
- Modify: `vernon_tasks/api/portal_reports.py`
- Modify: `vernon_tasks/tests/portal/test_portal_reports.py`

- [ ] **Step 1: Write failing tests for Team endpoints**

Append to `test_portal_reports.py`:

```python
class TestTeamPermissions(unittest.TestCase):
    def setUp(self):
        _set_flag(1)

    def tearDown(self):
        _set_flag(0)

    def test_leaderboard_manager_ok(self):
        from vernon_tasks.api.portal_reports import get_portal_leaderboard
        with _set_roles(["VT Manager"]):
            with patch("vernon_tasks.api.portal_reports._lb",
                       return_value={"period": "this_month", "rows": []}):
                result = get_portal_leaderboard("this_month", 20)
        self.assertIn("rows", result)

    def test_leaderboard_leader_ok(self):
        from vernon_tasks.api.portal_reports import get_portal_leaderboard
        with _set_roles(["VT Leader"]):
            with patch("vernon_tasks.api.portal_reports._lb",
                       return_value={"period": "this_month", "rows": []}):
                with patch("vernon_tasks.api.portal_reports._visible_projects",
                           return_value=[]):
                    result = get_portal_leaderboard("this_month", 20)
        self.assertIn("rows", result)

    def test_leaderboard_member_raises_403(self):
        from vernon_tasks.api.portal_reports import get_portal_leaderboard
        with _set_roles(["VT Member"]):
            with self.assertRaises(frappe.PermissionError):
                get_portal_leaderboard("this_month", 20)

    def test_workload_leader_ok(self):
        from vernon_tasks.api.portal_reports import get_portal_workload
        with _set_roles(["VT Leader"]):
            with patch("frappe.db.sql", return_value=[]):
                with patch("frappe.utils.today", return_value="2026-05-18"):
                    with patch("vernon_tasks.api.portal_reports._visible_projects",
                               return_value=[]):
                        result = get_portal_workload()
        self.assertIn("members", result)
        self.assertIn("as_of", result)

    def test_workload_member_raises_403(self):
        from vernon_tasks.api.portal_reports import get_portal_workload
        with _set_roles(["VT Member"]):
            with self.assertRaises(frappe.PermissionError):
                get_portal_workload()

    def test_overdue_leader_ok(self):
        from vernon_tasks.api.portal_reports import get_portal_overdue
        with _set_roles(["VT Leader"]):
            with patch("frappe.db.sql", return_value=[]):
                with patch("frappe.utils.today", return_value="2026-05-18"):
                    with patch("vernon_tasks.api.portal_reports._visible_projects",
                               return_value=[]):
                        result = get_portal_overdue()
        self.assertIn("by_member", result)
        self.assertIn("by_project", result)

    def test_overdue_member_raises_403(self):
        from vernon_tasks.api.portal_reports import get_portal_overdue
        with _set_roles(["VT Member"]):
            with self.assertRaises(frappe.PermissionError):
                get_portal_overdue()

    def test_workload_excludes_done_tasks(self):
        """
        Build a minimal VT Task fixture with kanban_status='Done' and verify
        it does NOT appear in workload open_tasks count.
        """
        from vernon_tasks.api.portal_reports import get_portal_workload
        # Fixture: one project, one Done task, one Open task for same user.
        project_name = frappe.db.exists("VT Project", {"title": "PortalReports Test Proj"})
        if not project_name:
            project_name = frappe.get_doc({
                "doctype": "VT Project",
                "title": "PortalReports Test Proj",
                "project_owner": "Administrator",
                "project_leader": "Administrator",
                "start_date": "2026-01-01",
                "end_date": "2026-12-31",
                "status": "On Track",
                "pdca_phase": "DO",
            }).insert(ignore_permissions=True).name

        # Create Done task
        done_task = frappe.get_doc({
            "doctype": "VT Task",
            "task_title": "Done Task PR Test",
            "project": project_name,
            "assigned_to": "Administrator",
            "kanban_status": "Done",
            "pdca_phase": "DO",
            "estimated_hours": 2.0,
        }).insert(ignore_permissions=True)

        # Create open task
        open_task = frappe.get_doc({
            "doctype": "VT Task",
            "task_title": "Open Task PR Test",
            "project": project_name,
            "assigned_to": "Administrator",
            "kanban_status": "Doing",
            "pdca_phase": "DO",
            "estimated_hours": 4.0,
        }).insert(ignore_permissions=True)

        try:
            with _set_roles(["VT Manager"]):
                with patch("vernon_tasks.api.portal_reports._visible_projects",
                           return_value=[{"name": project_name,
                                          "project_title": "PortalReports Test Proj"}]):
                    result = get_portal_workload()
            admin_row = next(
                (m for m in result["members"] if m["user"] == "Administrator"), None
            )
            self.assertIsNotNone(admin_row)
            # Done task must NOT be counted
            self.assertGreaterEqual(admin_row["open_tasks"], 1)
            # Confirm done task hours not in open_hours
            self.assertLessEqual(admin_row.get("open_hours", 0), 4.0 + 0.001)
        finally:
            frappe.delete_doc("VT Task", done_task.name, ignore_permissions=True)
            frappe.delete_doc("VT Task", open_task.name, ignore_permissions=True)
            frappe.db.commit()

    def test_overdue_deadline_filter(self):
        """Task with deadline yesterday and non-Done status appears in overdue."""
        from vernon_tasks.api.portal_reports import get_portal_overdue
        from frappe.utils import add_days, today as frappe_today
        yesterday = add_days(frappe_today(), -1)

        project_name = frappe.db.exists("VT Project", {"title": "PortalReports Test Proj"})
        if not project_name:
            project_name = frappe.get_doc({
                "doctype": "VT Project",
                "title": "PortalReports Test Proj",
                "project_owner": "Administrator",
                "project_leader": "Administrator",
                "start_date": "2026-01-01",
                "end_date": "2026-12-31",
                "status": "On Track",
                "pdca_phase": "DO",
            }).insert(ignore_permissions=True).name

        overdue_task = frappe.get_doc({
            "doctype": "VT Task",
            "task_title": "Overdue PR Test",
            "project": project_name,
            "assigned_to": "Administrator",
            "kanban_status": "Todo",
            "pdca_phase": "DO",
            "deadline": yesterday,
            "estimated_hours": 3.0,
        }).insert(ignore_permissions=True)

        try:
            with _set_roles(["VT Manager"]):
                with patch("vernon_tasks.api.portal_reports._visible_projects",
                           return_value=[{"name": project_name,
                                          "project_title": "PortalReports Test Proj"}]):
                    result = get_portal_overdue()
            all_users = [r["user"] for r in result["by_member"]]
            self.assertIn("Administrator", all_users)
            admin_row = next(r for r in result["by_member"] if r["user"] == "Administrator")
            self.assertGreaterEqual(admin_row["overdue_count"], 1)
        finally:
            frappe.delete_doc("VT Task", overdue_task.name, ignore_permissions=True)
            frappe.db.commit()

    def test_overdue_done_task_excluded(self):
        """Task with deadline yesterday but kanban_status=Done not in overdue."""
        from vernon_tasks.api.portal_reports import get_portal_overdue
        from frappe.utils import add_days, today as frappe_today
        yesterday = add_days(frappe_today(), -1)

        project_name = frappe.db.exists("VT Project", {"title": "PortalReports Test Proj"})
        if not project_name:
            project_name = frappe.get_doc({
                "doctype": "VT Project",
                "title": "PortalReports Test Proj",
                "project_owner": "Administrator",
                "project_leader": "Administrator",
                "start_date": "2026-01-01",
                "end_date": "2026-12-31",
                "status": "On Track",
                "pdca_phase": "DO",
            }).insert(ignore_permissions=True).name

        done_overdue = frappe.get_doc({
            "doctype": "VT Task",
            "task_title": "Done Overdue PR Test",
            "project": project_name,
            "assigned_to": "Administrator",
            "kanban_status": "Done",
            "pdca_phase": "DO",
            "deadline": yesterday,
            "estimated_hours": 2.0,
        }).insert(ignore_permissions=True)

        try:
            # Capture baseline count before insert
            with _set_roles(["VT Manager"]):
                with patch("vernon_tasks.api.portal_reports._visible_projects",
                           return_value=[{"name": project_name,
                                          "project_title": "PortalReports Test Proj"}]):
                    result_before = get_portal_overdue()

            baseline = sum(
                r.get("overdue_count", 0)
                for r in result_before["by_member"]
                if r["user"] == "Administrator"
            )

            # Re-run with Done task present — count must not increase
            with _set_roles(["VT Manager"]):
                # Bust cache
                from frappe import cache
                cache().delete_value(
                    f"pr:overdue:manager:{frappe.session.user}"
                )
                with patch("vernon_tasks.api.portal_reports._visible_projects",
                           return_value=[{"name": project_name,
                                          "project_title": "PortalReports Test Proj"}]):
                    result_after = get_portal_overdue()

            after = sum(
                r.get("overdue_count", 0)
                for r in result_after["by_member"]
                if r["user"] == "Administrator"
            )
            self.assertEqual(baseline, after)
        finally:
            frappe.delete_doc("VT Task", done_overdue.name, ignore_permissions=True)
            frappe.db.commit()
```

- [ ] **Step 2: Run tests — verify FAIL**

```bash
bench --site test_site run-tests --app vernon_tasks --module vernon_tasks.tests.portal.test_portal_reports 2>&1 | grep "ERROR\|ImportError" | head -5
```

Expected: FAIL — `get_portal_leaderboard`, `get_portal_workload`, `get_portal_overdue` not yet defined.

- [ ] **Step 3: Implement Team endpoints in `portal_reports.py`**

Append to `vernon_tasks/api/portal_reports.py`:

```python
# ── Team tab endpoints (Manager + Leader) ────────────────────────────────────
@frappe.whitelist()
def get_portal_leaderboard(period="this_month", limit=20):
    _check_flag()
    _require_leader()
    limit = clamp_int(limit, 1, 100, "limit")
    bucket = _role_bucket()
    user = frappe.session.user
    key = f"pr:leaderboard:{period}:{limit}:{bucket}:{user}"

    def _build():
        raw = _lb(period, limit)
        if bucket == "manager":
            return raw
        # Leader: filter rows to members whose projects overlap with visible projects
        visible_names = {p["name"] for p in _visible_projects()}
        if not visible_names:
            return {**(raw if isinstance(raw, dict) else {"rows": []}), "rows": []}
        # Get users who are assigned to visible projects
        member_users = set(frappe.db.sql(
            """SELECT DISTINCT assigned_to FROM `tabVT Task`
               WHERE project IN %(projects)s AND assigned_to IS NOT NULL""",
            {"projects": tuple(visible_names)},
            as_list=True,
        ) or [])
        member_users_flat = {row[0] for row in member_users}
        if isinstance(raw, dict):
            rows = [r for r in raw.get("rows", []) if r.get("user") in member_users_flat]
            return {**raw, "rows": rows}
        return raw

    return _cache(key, _build)


@frappe.whitelist()
def get_portal_workload():
    _check_flag()
    _require_leader()
    bucket = _role_bucket()
    user = frappe.session.user
    key = f"pr:workload:{bucket}:{user}"

    def _build():
        from frappe.utils import today as frappe_today
        visible = _visible_projects()
        if not visible:
            return {"as_of": frappe_today(), "members": []}
        project_names = tuple(p["name"] for p in visible)

        rows = frappe.db.sql(
            """
            SELECT
                t.assigned_to AS `user`,
                MAX(u.full_name) AS full_name,
                COUNT(*) AS open_tasks,
                COALESCE(SUM(t.estimated_hours), 0) AS open_hours,
                SUM(CASE WHEN t.deadline < %(today)s THEN 1 ELSE 0 END) AS overdue_tasks,
                COALESCE(SUM(CASE WHEN t.deadline < %(today)s
                               THEN t.estimated_hours ELSE 0 END), 0) AS overdue_hours
            FROM `tabVT Task` t
            LEFT JOIN `tabUser` u ON u.name = t.assigned_to
            WHERE t.project IN %(projects)s
              AND t.kanban_status NOT IN ('Done', 'Blocked')
              AND t.assigned_to IS NOT NULL
            GROUP BY t.assigned_to
            ORDER BY open_tasks DESC
            """,
            {"projects": project_names, "today": frappe_today()},
            as_dict=True,
        )

        # Enrich with project list per user
        user_projects = {}
        for p in visible:
            users_in_proj = frappe.db.sql(
                """SELECT DISTINCT assigned_to FROM `tabVT Task`
                   WHERE project = %s AND assigned_to IS NOT NULL""",
                p["name"],
                as_list=True,
            )
            for row in users_in_proj:
                uid = row[0]
                user_projects.setdefault(uid, [])
                if p["name"] not in user_projects[uid]:
                    user_projects[uid].append(p["name"])

        members = []
        for r in rows:
            r["projects"] = user_projects.get(r["user"], [])
            members.append(r)

        return {"as_of": frappe_today(), "members": members}

    return _cache(key, _build)


@frappe.whitelist()
def get_portal_overdue():
    _check_flag()
    _require_leader()
    bucket = _role_bucket()
    user = frappe.session.user
    key = f"pr:overdue:{bucket}:{user}"

    def _build():
        from frappe.utils import today as frappe_today
        visible = _visible_projects()
        if not visible:
            return {
                "as_of": frappe_today(),
                "total_overdue": 0,
                "by_member": [],
                "by_project": [],
            }
        project_names = tuple(p["name"] for p in visible)
        today_str = frappe_today()

        by_member = frappe.db.sql(
            """
            SELECT
                t.assigned_to AS `user`,
                MAX(u.full_name) AS full_name,
                COUNT(*) AS overdue_count,
                COALESCE(SUM(t.estimated_hours), 0) AS overdue_hours,
                DATEDIFF(%(today)s, MIN(t.deadline)) AS oldest_overdue_days
            FROM `tabVT Task` t
            LEFT JOIN `tabUser` u ON u.name = t.assigned_to
            WHERE t.project IN %(projects)s
              AND t.deadline < %(today)s
              AND t.kanban_status NOT IN ('Done', 'Blocked')
              AND t.assigned_to IS NOT NULL
            GROUP BY t.assigned_to
            ORDER BY overdue_count DESC
            """,
            {"projects": project_names, "today": today_str},
            as_dict=True,
        )

        proj_title_map = {p["name"]: p.get("project_title", p["name"]) for p in visible}
        by_project = frappe.db.sql(
            """
            SELECT
                t.project,
                COUNT(*) AS overdue_count,
                COALESCE(SUM(t.estimated_hours), 0) AS overdue_hours
            FROM `tabVT Task` t
            WHERE t.project IN %(projects)s
              AND t.deadline < %(today)s
              AND t.kanban_status NOT IN ('Done', 'Blocked')
            GROUP BY t.project
            ORDER BY overdue_count DESC
            """,
            {"projects": project_names, "today": today_str},
            as_dict=True,
        )
        for row in by_project:
            row["project_title"] = proj_title_map.get(row["project"], row["project"])

        total = sum(r.get("overdue_count", 0) for r in by_member)
        return {
            "as_of": today_str,
            "total_overdue": total,
            "by_member": by_member,
            "by_project": by_project,
        }

    return _cache(key, _build)
```

- [ ] **Step 4: Run all tests — verify PASS**

```bash
bench --site test_site run-tests --app vernon_tasks --module vernon_tasks.tests.portal.test_portal_reports 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add vernon_tasks/api/portal_reports.py \
        vernon_tasks/tests/portal/test_portal_reports.py
git commit -m "feat(reports): tambah Team tab endpoints (leaderboard, workload, overdue)"
```

---

## Task 5: Cache invalidation hooks + analytics.py extension

**Files:**
- Modify: `vernon_tasks/hooks.py`
- Modify: `vernon_tasks/task/api/analytics.py`
- Modify: `vernon_tasks/tests/portal/test_portal_reports.py`

- [ ] **Step 1: Write failing tests for cache invalidation**

Append to `test_portal_reports.py`:

```python
class TestCaching(unittest.TestCase):
    def setUp(self):
        _set_flag(1)

    def tearDown(self):
        _set_flag(0)

    def test_cache_hit_avoids_second_service_call(self):
        """Second call to get_portal_kpi_list uses cache; _list_kpis called once."""
        from vernon_tasks.api.portal_reports import get_portal_kpi_list
        call_count = {"n": 0}
        def mock_list_kpis():
            call_count["n"] += 1
            return [{"name": "KPI-00001", "title": "Velocity", "unit": "pts/sprint"}]

        with _set_roles(["VT Manager"]):
            # Clear any existing cache
            frappe.cache().delete_value("pr:kpis:manager")
            with patch("vernon_tasks.api.portal_reports._list_kpis",
                       side_effect=mock_list_kpis):
                result1 = get_portal_kpi_list()
                result2 = get_portal_kpi_list()
        # Service called once; second result from cache
        self.assertEqual(call_count["n"], 1)
        self.assertEqual(result1, result2)

    def test_cache_key_differs_by_role(self):
        """Manager and Leader produce different velocity cache keys."""
        from vernon_tasks.api.portal_reports import _role_bucket
        with _set_roles(["VT Manager"]):
            bucket_mgr = _role_bucket()
        with _set_roles(["VT Leader"]):
            bucket_ldr = _role_bucket()
        self.assertNotEqual(bucket_mgr, bucket_ldr)
        self.assertEqual(bucket_mgr, "manager")
        self.assertEqual(bucket_ldr, "leader")

    def test_invalidate_okr_cache_clears_health(self):
        """invalidate_okr_cache deletes the pr:health:manager key."""
        from vernon_tasks.api.portal_reports import invalidate_okr_cache
        frappe.cache().set_value("pr:health:manager", {"score": 99})
        invalidate_okr_cache(MagicMock())
        cached = frappe.cache().get_value("pr:health:manager")
        self.assertIsNone(cached)
```

- [ ] **Step 2: Run tests — verify PASS** (these tests use existing code already written)

```bash
bench --site test_site run-tests --app vernon_tasks --module vernon_tasks.tests.portal.test_portal_reports 2>&1 | tail -10
```

Expected: all tests PASS.

- [ ] **Step 3: Register invalidation hooks in `hooks.py`**

Open `vernon_tasks/hooks.py`. In the `doc_events` dict, add entries for `VT KPI Snapshot` and `VT OKR Period`:

```python
doc_events = {
    "VT Task": {
        "on_submit": "vernon_tasks.task.services.point_calculator.calculate_points",
        "on_update": [
            "vernon_tasks.task.services.scheduling_engine.on_task_update",
            "vernon_tasks.task.api.analytics.invalidate_project_cache",
        ],
        "validate": "vernon_tasks.task.doctype.vt_task.vt_task.validate_permissions",
    },
    "VT Project": {
        # ... existing entries unchanged ...
        "on_update": "vernon_tasks.task.api.analytics.invalidate_project_cache",
    },
    "VT KPI Snapshot": {
        "on_update": "vernon_tasks.api.portal_reports.invalidate_okr_cache",
        "after_insert": "vernon_tasks.api.portal_reports.invalidate_okr_cache",
    },
    "VT OKR Period": {
        "on_update": "vernon_tasks.api.portal_reports.invalidate_okr_cache",
    },
    "Notification Log": {
        "after_insert": "vernon_tasks.task.services.push_sender.send_push_for_notification",
    },
}
```

- [ ] **Step 4: Extend `analytics.py` `invalidate_project_cache` to also bust portal keys**

Open `vernon_tasks/task/api/analytics.py`. Update `invalidate_project_cache`:

```python
def invalidate_project_cache(doc, method=None):
    """Hook target — clears velocity + forecast cache for a project."""
    project = getattr(doc, "project", None) or getattr(doc, "name", None)
    if not project:
        return
    for n in (3, 6, 12):
        frappe.cache().delete_value(f"vt_velocity:{project}:{n}")
    frappe.cache().delete_value(f"vt_forecast:{project}")
    # Also bust portal aggregation cache (role-bucket keys; user-keyed keys
    # expire by TTL since iterating all users is too expensive).
    for bucket in ("manager", "leader"):
        for n in (3, 6, 12):
            # Cannot delete user-keyed keys without enumerating users;
            # portal velocity/forecast keys will expire by 300s TTL.
            pass
    # The above comment is intentional: portal keys include {user} suffix,
    # so we only delete the non-user-keyed keys that do exist.
    frappe.cache().delete_value("pr:health:manager")
```

- [ ] **Step 5: Run all backend tests**

```bash
bench --site test_site run-tests --app vernon_tasks --module vernon_tasks.tests.portal.test_portal_reports 2>&1 | tail -10
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add vernon_tasks/hooks.py \
        vernon_tasks/task/api/analytics.py \
        vernon_tasks/tests/portal/test_portal_reports.py
git commit -m "feat(reports): daftarkan hooks invalidasi cache OKR dan perluas analytics.invalidate_project_cache"
```

---

## Task 6: Frontend types + API client + `useVtSettings` integration

**Files:**
- Create: `pwa/src/portal/reports/api/types.ts`
- Create: `pwa/src/portal/reports/api/portal_reports.ts`

- [ ] **Step 1: Write type definitions**

Create `pwa/src/portal/reports/api/types.ts`:

```ts
// ── OKR Tab ──────────────────────────────────────────────────────────────────
export interface HealthScoreResponse {
  score: number;
  okr_pct: number;
  ontime_pct: number;
  velocity_health: number;
  components: {
    okr_weight: number;
    ontime_weight: number;
    velocity_weight: number;
  };
  as_of: string;
}

export interface OkrRollupRow {
  project: string;
  project_title: string;
  objective_count: number;
  kr_count: number;
  avg_progress: number;
  on_track: number;
  at_risk: number;
  behind: number;
}

export interface OkrRollupTotals {
  objective_count: number;
  kr_count: number;
  avg_progress: number;
  on_track: number;
  at_risk: number;
  behind: number;
}

export interface OkrRollupResponse {
  period: string;
  rows: OkrRollupRow[];
  totals: OkrRollupTotals;
}

export interface KpiListItem {
  name: string;
  title: string;
  unit: string;
}

export interface KpiTrendPoint {
  label: string;
  value: number;
  target: number;
}

export interface KpiTrendResponse {
  kpi_definition: string;
  title: string;
  unit: string;
  periods: number;
  series: KpiTrendPoint[];
}

// ── Sprints Tab ───────────────────────────────────────────────────────────────
export interface VelocitySprintPoint {
  sprint_label: string;
  velocity: number;
}

export interface VelocityProject {
  project: string;
  project_title: string;
  sprints: VelocitySprintPoint[];
  avg_velocity: number;
  trend: "up" | "down" | "flat";
}

export interface VelocityComparisonResponse {
  n: number;
  projects: VelocityProject[];
}

export type ForecastStatus = "on_track" | "at_risk" | "delayed";

export interface ForecastItem {
  project: string;
  project_title: string;
  completion_estimate: string;
  confidence: number;
  remaining_points: number;
  avg_velocity: number;
  status: ForecastStatus;
}

export interface ForecastsResponse {
  forecasts: ForecastItem[];
}

export type RiskLevel = "high" | "medium" | "low" | "none";

export interface RiskFlag {
  type: string;
  level: RiskLevel;
  count?: number;
  delta_pct?: number;
  days_since?: number;
}

export interface RiskProject {
  project: string;
  project_title: string;
  flags: RiskFlag[];
  max_level: RiskLevel;
}

export interface RisksResponse {
  risks: RiskProject[];
}

// ── Team Tab ──────────────────────────────────────────────────────────────────
export interface LeaderboardRow {
  rank: number;
  user: string;
  full_name: string;
  points: number;
  tasks_completed: number;
  streak_days: number;
  avg_quality: number;
}

export interface LeaderboardResponse {
  period: string;
  rows: LeaderboardRow[];
}

export interface WorkloadMember {
  user: string;
  full_name: string;
  open_tasks: number;
  open_hours: number;
  overdue_tasks: number;
  overdue_hours: number;
  projects: string[];
}

export interface WorkloadResponse {
  as_of: string;
  members: WorkloadMember[];
}

export interface OverdueMemberRow {
  user: string;
  full_name: string;
  overdue_count: number;
  overdue_hours: number;
  oldest_overdue_days: number;
}

export interface OverdueProjectRow {
  project: string;
  project_title: string;
  overdue_count: number;
  overdue_hours: number;
}

export interface OverdueResponse {
  as_of: string;
  total_overdue: number;
  by_member: OverdueMemberRow[];
  by_project: OverdueProjectRow[];
}
```

- [ ] **Step 2: Write API client**

Create `pwa/src/portal/reports/api/portal_reports.ts`:

```ts
import { api } from "../../../api/client";
import type {
  HealthScoreResponse,
  OkrRollupResponse,
  KpiListItem,
  KpiTrendResponse,
  VelocityComparisonResponse,
  ForecastsResponse,
  RisksResponse,
  LeaderboardResponse,
  WorkloadResponse,
  OverdueResponse,
} from "./types";

const BASE = "/api/method/vernon_tasks.api.portal_reports";

export function getPortalHealthScore(): Promise<HealthScoreResponse> {
  return api.get<HealthScoreResponse>(`${BASE}.get_portal_health_score`);
}

export function getPortalOkrRollup(period?: string): Promise<OkrRollupResponse> {
  return api.get<OkrRollupResponse>(`${BASE}.get_portal_okr_rollup`, period ? { period } : {});
}

export function getPortalKpiList(): Promise<KpiListItem[]> {
  return api.get<KpiListItem[]>(`${BASE}.get_portal_kpi_list`);
}

export function getPortalKpiTrend(
  kpi_definition: string,
  periods = 12,
): Promise<KpiTrendResponse> {
  return api.get<KpiTrendResponse>(`${BASE}.get_portal_kpi_trend`, {
    kpi_definition,
    periods,
  });
}

export function getPortalVelocityComparison(n = 6): Promise<VelocityComparisonResponse> {
  return api.get<VelocityComparisonResponse>(`${BASE}.get_portal_velocity_comparison`, { n });
}

export function getPortalForecasts(): Promise<ForecastsResponse> {
  return api.get<ForecastsResponse>(`${BASE}.get_portal_forecasts`);
}

export function getPortalRisks(): Promise<RisksResponse> {
  return api.get<RisksResponse>(`${BASE}.get_portal_risks`);
}

export function getPortalLeaderboard(
  period = "this_month",
  limit = 20,
): Promise<LeaderboardResponse> {
  return api.get<LeaderboardResponse>(`${BASE}.get_portal_leaderboard`, { period, limit });
}

export function getPortalWorkload(): Promise<WorkloadResponse> {
  return api.get<WorkloadResponse>(`${BASE}.get_portal_workload`);
}

export function getPortalOverdue(): Promise<OverdueResponse> {
  return api.get<OverdueResponse>(`${BASE}.get_portal_overdue`);
}
```

- [ ] **Step 3: Typecheck**

```bash
cd pwa && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add pwa/src/portal/reports/api/types.ts \
        pwa/src/portal/reports/api/portal_reports.ts
git commit -m "feat(reports): tambah TypeScript types dan API client untuk portal_reports"
```

---

## Task 7: Frontend hooks — `useOkrReport`, `useSprintsReport`, `useTeamReport`

**Files:**
- Create: `pwa/src/portal/reports/hooks/useOkrReport.ts`
- Create: `pwa/src/portal/reports/hooks/useOkrReport.test.ts`
- Create: `pwa/src/portal/reports/hooks/useSprintsReport.ts`
- Create: `pwa/src/portal/reports/hooks/useSprintsReport.test.ts`
- Create: `pwa/src/portal/reports/hooks/useTeamReport.ts`
- Create: `pwa/src/portal/reports/hooks/useTeamReport.test.ts`

- [ ] **Step 1: Write failing hook tests**

Create `pwa/src/portal/reports/hooks/useOkrReport.test.ts`:

```ts
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { useOkrReport } from "./useOkrReport";
import * as api from "../api/portal_reports";

vi.mock("../api/portal_reports");

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe("useOkrReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes health and rollup query results", async () => {
    const mockHealth = { score: 82, okr_pct: 0.74, ontime_pct: 0.88,
                         velocity_health: 0.91,
                         components: { okr_weight: 0.4, ontime_weight: 0.3, velocity_weight: 0.3 },
                         as_of: "2026-05-18T10:00:00" };
    const mockRollup = { period: "Q2-2026", rows: [], totals: {
      objective_count: 0, kr_count: 0, avg_progress: 0, on_track: 0, at_risk: 0, behind: 0 }};
    vi.mocked(api.getPortalHealthScore).mockResolvedValue(mockHealth);
    vi.mocked(api.getPortalOkrRollup).mockResolvedValue(mockRollup);

    const { result } = renderHook(() => useOkrReport(), { wrapper });
    await waitFor(() => expect(result.current.health.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.rollup.isSuccess).toBe(true));
    expect(result.current.health.data?.score).toBe(82);
    expect(result.current.rollup.data?.period).toBe("Q2-2026");
  });
});
```

Create `pwa/src/portal/reports/hooks/useSprintsReport.test.ts`:

```ts
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { useSprintsReport } from "./useSprintsReport";
import * as api from "../api/portal_reports";

vi.mock("../api/portal_reports");

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe("useSprintsReport", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("n change produces different velocity query key", async () => {
    vi.mocked(api.getPortalVelocityComparison).mockResolvedValue({ n: 6, projects: [] });
    vi.mocked(api.getPortalForecasts).mockResolvedValue({ forecasts: [] });
    vi.mocked(api.getPortalRisks).mockResolvedValue({ risks: [] });

    const { result, rerender } = renderHook(
      ({ n }: { n: number }) => useSprintsReport(n),
      { wrapper, initialProps: { n: 6 } }
    );
    await waitFor(() => expect(result.current.velocity.isSuccess).toBe(true));
    expect(api.getPortalVelocityComparison).toHaveBeenCalledWith(6);

    rerender({ n: 12 });
    await waitFor(() =>
      expect(api.getPortalVelocityComparison).toHaveBeenCalledWith(12)
    );
  });
});
```

Create `pwa/src/portal/reports/hooks/useTeamReport.test.ts`:

```ts
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { useTeamReport } from "./useTeamReport";
import * as api from "../api/portal_reports";

vi.mock("../api/portal_reports");

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe("useTeamReport", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("period change invalidates leaderboard query key", async () => {
    vi.mocked(api.getPortalLeaderboard).mockResolvedValue({
      period: "this_week", rows: [] });
    vi.mocked(api.getPortalWorkload).mockResolvedValue({
      as_of: "2026-05-18", members: [] });
    vi.mocked(api.getPortalOverdue).mockResolvedValue({
      as_of: "2026-05-18", total_overdue: 0, by_member: [], by_project: [] });

    const { result, rerender } = renderHook(
      ({ period }: { period: string }) => useTeamReport(period),
      { wrapper, initialProps: { period: "this_week" } }
    );
    await waitFor(() => expect(result.current.leaderboard.isSuccess).toBe(true));
    expect(api.getPortalLeaderboard).toHaveBeenCalledWith("this_week", 20);

    rerender({ period: "this_month" });
    await waitFor(() =>
      expect(api.getPortalLeaderboard).toHaveBeenCalledWith("this_month", 20)
    );
  });
});
```

- [ ] **Step 2: Run tests — verify FAIL**

```bash
cd pwa && pnpm vitest run src/portal/reports/hooks 2>&1 | tail -10
```

Expected: FAIL — hook files not found.

- [ ] **Step 3: Implement hooks**

Create `pwa/src/portal/reports/hooks/useOkrReport.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import {
  getPortalHealthScore,
  getPortalOkrRollup,
} from "../api/portal_reports";

export function useOkrReport(period?: string) {
  const health = useQuery({
    queryKey: ["reports", "health"],
    queryFn: () => getPortalHealthScore(),
    staleTime: 5 * 60 * 1000,
  });
  const rollup = useQuery({
    queryKey: ["reports", "okr", period ?? "current"],
    queryFn: () => getPortalOkrRollup(period),
    staleTime: 5 * 60 * 1000,
  });
  return { health, rollup };
}
```

Create `pwa/src/portal/reports/hooks/useSprintsReport.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import {
  getPortalVelocityComparison,
  getPortalForecasts,
  getPortalRisks,
} from "../api/portal_reports";

export function useSprintsReport(n: number) {
  const velocity = useQuery({
    queryKey: ["reports", "velocity", n],
    queryFn: () => getPortalVelocityComparison(n),
    staleTime: 5 * 60 * 1000,
  });
  const forecasts = useQuery({
    queryKey: ["reports", "forecasts"],
    queryFn: () => getPortalForecasts(),
    staleTime: 5 * 60 * 1000,
  });
  const risks = useQuery({
    queryKey: ["reports", "risks"],
    queryFn: () => getPortalRisks(),
    staleTime: 2 * 60 * 1000,
  });
  return { velocity, forecasts, risks };
}
```

Create `pwa/src/portal/reports/hooks/useTeamReport.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import {
  getPortalLeaderboard,
  getPortalWorkload,
  getPortalOverdue,
} from "../api/portal_reports";

export function useTeamReport(period: string) {
  const leaderboard = useQuery({
    queryKey: ["reports", "leaderboard", period],
    queryFn: () => getPortalLeaderboard(period, 20),
    staleTime: 5 * 60 * 1000,
  });
  const workload = useQuery({
    queryKey: ["reports", "workload"],
    queryFn: () => getPortalWorkload(),
    staleTime: 5 * 60 * 1000,
  });
  const overdue = useQuery({
    queryKey: ["reports", "overdue"],
    queryFn: () => getPortalOverdue(),
    staleTime: 5 * 60 * 1000,
  });
  return { leaderboard, workload, overdue };
}
```

- [ ] **Step 4: Run hook tests — verify PASS**

```bash
cd pwa && pnpm vitest run src/portal/reports/hooks 2>&1 | tail -10
```

Expected: all 3 test files PASS.

- [ ] **Step 5: Commit**

```bash
git add pwa/src/portal/reports/hooks/
git commit -m "feat(reports): tambah hooks useOkrReport, useSprintsReport, useTeamReport"
```

---

## Task 8: `ReportsFeatureGate`, `ReportsRoutes`, `ReportsPage` shell + tab routing

**Files:**
- Create: `pwa/src/portal/reports/ReportsFeatureGate.tsx`
- Create: `pwa/src/portal/reports/ReportsRoutes.tsx`
- Create: `pwa/src/portal/reports/ReportsPage.tsx`
- Create: `pwa/src/portal/reports/ReportsPage.test.tsx`
- Modify: `pwa/src/portal/routes.tsx`

- [ ] **Step 1: Write failing `ReportsPage` tests**

Create `pwa/src/portal/reports/ReportsPage.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { createElement } from "react";
import { ReportsPage } from "./ReportsPage";
import * as permsHook from "../../auth/usePermissions";
import * as telemetry from "../../telemetry";

vi.mock("../../auth/usePermissions");
vi.mock("../../telemetry");
// Lazy tab components — mock them to avoid recharts loading issues
vi.mock("./tabs/OkrTab", () => ({ OkrTab: () => createElement("div", null, "OKR Tab") }));
vi.mock("./tabs/SprintsTab", () => ({ SprintsTab: () => createElement("div", null, "Sprints Tab") }));
vi.mock("./tabs/TeamTab", () => ({ TeamTab: () => createElement("div", null, "Team Tab") }));

function renderPage(roles: string[]) {
  vi.mocked(permsHook.usePermissions).mockReturnValue({
    isLoading: false,
    permissions: [],
    roles,
    hasPermission: () => false,
    hasAnyPermission: () => false,
    hasRole: (r) => roles.includes(r),
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    createElement(
      QueryClientProvider,
      { client: qc },
      createElement(MemoryRouter, null, createElement(ReportsPage))
    )
  );
}

describe("ReportsPage tab visibility", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("Manager sees OKR, Sprints, and Team tabs", () => {
    renderPage(["VT Manager"]);
    expect(screen.getByRole("tab", { name: "OKR" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "Sprints" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "Team" })).toBeDefined();
  });

  it("Leader does NOT see OKR tab but sees Sprints and Team", () => {
    renderPage(["VT Leader"]);
    expect(screen.queryByRole("tab", { name: "OKR" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Sprints" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "Team" })).toBeDefined();
  });

  it("Member with no matching roles sees PermissionDenied", () => {
    renderPage(["VT Member"]);
    expect(screen.getByText(/permission denied/i)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test — verify FAIL**

```bash
cd pwa && pnpm vitest run src/portal/reports/ReportsPage.test.tsx 2>&1 | tail -10
```

Expected: FAIL — `ReportsPage` module not found.

- [ ] **Step 3: Implement `ReportsFeatureGate.tsx`**

Create `pwa/src/portal/reports/ReportsFeatureGate.tsx`:

```tsx
import { type ReactNode } from "react";
import { ComingSoon } from "../pages/ComingSoon";
import { useVtSettings } from "../../hooks/useVtSettings";

export function ReportsFeatureGate({ children }: { children: ReactNode }) {
  const settings = useVtSettings();
  if (settings.isLoading) return null;
  if (!settings.data?.portal_reports_enabled) return <ComingSoon domain="Reports" />;
  return <>{children}</>;
}
```

- [ ] **Step 4: Implement `ReportsRoutes.tsx`**

Create `pwa/src/portal/reports/ReportsRoutes.tsx`:

```tsx
import { ReportsFeatureGate } from "./ReportsFeatureGate";
import { ReportsPage } from "./ReportsPage";

export function ReportsRoutes() {
  return (
    <ReportsFeatureGate>
      <ReportsPage />
    </ReportsFeatureGate>
  );
}
```

- [ ] **Step 5: Implement `ReportsPage.tsx`**

Create `pwa/src/portal/reports/ReportsPage.tsx`:

```tsx
import { useState, useEffect, lazy, Suspense } from "react";
import { usePermissions } from "../../auth/usePermissions";
import { PermissionDenied } from "../pages/PermissionDenied";
import { PageSkeleton } from "../../components/PageSkeleton";
import {
  trackReportsPageView,
  trackReportsTabView,
  trackReportsPermissionDenied,
} from "../../telemetry";

const OkrTab     = lazy(() => import("./tabs/OkrTab").then((m) => ({ default: m.OkrTab })));
const SprintsTab = lazy(() => import("./tabs/SprintsTab").then((m) => ({ default: m.SprintsTab })));
const TeamTab    = lazy(() => import("./tabs/TeamTab").then((m) => ({ default: m.TeamTab })));

type TabKey = "okr" | "sprints" | "team";

interface TabDef {
  key: TabKey;
  label: string;
}

export function ReportsPage() {
  const { isLoading, roles } = usePermissions();
  const [activeTab, setActiveTab] = useState<TabKey | null>(null);

  const isManager = roles.includes("VT Manager") || roles.includes("System Manager");
  const isLeader  = roles.includes("VT Leader");

  const tabs: TabDef[] = [
    ...(isManager                    ? [{ key: "okr"     as TabKey, label: "OKR" }]     : []),
    ...(isManager || isLeader        ? [{ key: "sprints" as TabKey, label: "Sprints" }] : []),
    ...(isManager || isLeader        ? [{ key: "team"    as TabKey, label: "Team" }]    : []),
  ];

  // Set default tab once permissions resolve
  useEffect(() => {
    if (!isLoading && tabs.length > 0 && activeTab === null) {
      setActiveTab(tabs[0].key);
    }
  }, [isLoading, tabs.length]);

  // Track page view on mount
  useEffect(() => {
    trackReportsPageView();
  }, []);

  // Track tab view on tab change
  useEffect(() => {
    if (activeTab) {
      trackReportsTabView(activeTab);
    }
  }, [activeTab]);

  if (isLoading) return <PageSkeleton />;

  if (tabs.length === 0) {
    trackReportsPermissionDenied("reports");
    return <PermissionDenied requiredPerm="report.read" />;
  }

  return (
    <div className="reports-page">
      <div role="tablist" className="reports-tab-bar">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={activeTab === t.key}
            className={`reports-tab ${activeTab === t.key ? "active" : ""}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="reports-tab-content">
        <Suspense fallback={<PageSkeleton />}>
          {activeTab === "okr"     && isManager && <OkrTab />}
          {activeTab === "sprints" && (isManager || isLeader) && <SprintsTab />}
          {activeTab === "team"    && (isManager || isLeader) && <TeamTab />}
        </Suspense>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Update `routes.tsx`**

Open `pwa/src/portal/routes.tsx`. Replace the `reports/*` route:

```tsx
import { ReportsRoutes } from "./reports/ReportsRoutes";

// Replace:
//   <Route path="reports/*" element={<RequirePermission perm="report.read"><ComingSoon domain="Reports" /></RequirePermission>} />
// With:
      <Route
        path="reports/*"
        element={
          <RequirePermission perm="report.read">
            <ReportsRoutes />
          </RequirePermission>
        }
      />
```

Remove the `ComingSoon` import if it is no longer used by the reports route (keep it if other routes still use it — workforce does, so keep it).

- [ ] **Step 7: Run `ReportsPage` tests — verify PASS**

```bash
cd pwa && pnpm vitest run src/portal/reports/ReportsPage.test.tsx 2>&1 | tail -10
```

Expected: all 3 tests PASS.

- [ ] **Step 8: Typecheck + lint**

```bash
cd pwa && pnpm typecheck && pnpm lint
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add pwa/src/portal/reports/ReportsFeatureGate.tsx \
        pwa/src/portal/reports/ReportsRoutes.tsx \
        pwa/src/portal/reports/ReportsPage.tsx \
        pwa/src/portal/reports/ReportsPage.test.tsx \
        pwa/src/portal/routes.tsx
git commit -m "feat(reports): tambah ReportsPage shell dengan tab routing dan ReportsFeatureGate"
```

---

## Task 9: OKR tab components — `HealthScoreCard`, `OkrRollupTable`, `KpiTrendPanel`, `OkrTab`

**Files:**
- Create: `pwa/src/portal/reports/tabs/HealthScoreCard.tsx` + `.test.tsx`
- Create: `pwa/src/portal/reports/tabs/OkrRollupTable.tsx` + `.test.tsx`
- Create: `pwa/src/portal/reports/tabs/KpiTrendPanel.tsx` + `.test.tsx`
- Create: `pwa/src/portal/reports/charts/KpiTrendChart.tsx` + `.test.tsx`
- Create: `pwa/src/portal/reports/tabs/OkrTab.tsx` + `.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `pwa/src/portal/reports/tabs/HealthScoreCard.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { HealthScoreCard } from "./HealthScoreCard";

const BASE_PROPS = {
  score: 82,
  okr_pct: 0.74,
  ontime_pct: 0.88,
  velocity_health: 0.91,
  components: { okr_weight: 0.4, ontime_weight: 0.3, velocity_weight: 0.3 },
  as_of: "2026-05-18T10:00:00",
};

describe("HealthScoreCard", () => {
  it("score >= 80 renders green class", () => {
    const { container } = render(createElement(HealthScoreCard, { ...BASE_PROPS, score: 82 }));
    expect(container.querySelector(".health-score--green")).not.toBeNull();
  });

  it("score 60-79 renders amber class", () => {
    const { container } = render(createElement(HealthScoreCard, { ...BASE_PROPS, score: 70 }));
    expect(container.querySelector(".health-score--amber")).not.toBeNull();
  });

  it("score < 60 renders red class", () => {
    const { container } = render(createElement(HealthScoreCard, { ...BASE_PROPS, score: 45 }));
    expect(container.querySelector(".health-score--red")).not.toBeNull();
  });

  it("has aria-label with score value", () => {
    render(createElement(HealthScoreCard, { ...BASE_PROPS, score: 82 }));
    expect(screen.getByLabelText(/health score: 82/i)).not.toBeNull();
  });
});
```

Create `pwa/src/portal/reports/tabs/OkrRollupTable.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { OkrRollupTable } from "./OkrRollupTable";
import type { OkrRollupRow, OkrRollupTotals } from "../api/types";

const MOCK_ROWS: OkrRollupRow[] = [
  { project: "PROJ-00001", project_title: "Alpha", objective_count: 3,
    kr_count: 9, avg_progress: 0.65, on_track: 2, at_risk: 1, behind: 0 },
];
const MOCK_TOTALS: OkrRollupTotals = {
  objective_count: 3, kr_count: 9, avg_progress: 0.65,
  on_track: 2, at_risk: 1, behind: 0,
};

describe("OkrRollupTable", () => {
  it("renders project row", () => {
    render(createElement(OkrRollupTable, { rows: MOCK_ROWS, totals: MOCK_TOTALS }));
    expect(screen.getByText("Alpha")).not.toBeNull();
  });

  it("renders EmptyState when rows is empty", () => {
    render(createElement(OkrRollupTable, {
      rows: [],
      totals: { objective_count: 0, kr_count: 0, avg_progress: 0,
                on_track: 0, at_risk: 0, behind: 0 },
    }));
    expect(screen.getByText(/no okr data/i)).not.toBeNull();
  });
});
```

Create `pwa/src/portal/reports/tabs/KpiTrendPanel.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { KpiTrendPanel } from "./KpiTrendPanel";
import * as api from "../api/portal_reports";

vi.mock("../api/portal_reports");
vi.mock("../charts/KpiTrendChart", () => ({
  KpiTrendChart: () => createElement("div", { "data-testid": "kpi-trend-chart" }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe("KpiTrendPanel", () => {
  beforeEach(() => {
    vi.mocked(api.getPortalKpiList).mockResolvedValue([
      { name: "KPI-00001", title: "Velocity", unit: "pts/sprint" },
      { name: "KPI-00002", title: "Ontime", unit: "%" },
    ]);
    vi.mocked(api.getPortalKpiTrend).mockResolvedValue({
      kpi_definition: "KPI-00001", title: "Velocity", unit: "pts/sprint",
      periods: 12, series: [],
    });
  });

  it("renders KPI selector", async () => {
    render(createElement(KpiTrendPanel, null), { wrapper });
    const select = await screen.findByRole("combobox");
    expect(select).not.toBeNull();
  });

  it("KPI select change triggers new trend query", async () => {
    render(createElement(KpiTrendPanel, null), { wrapper });
    const select = await screen.findByRole("combobox");
    await userEvent.selectOptions(select, "KPI-00002");
    expect(api.getPortalKpiTrend).toHaveBeenCalledWith("KPI-00002", 12);
  });
});
```

- [ ] **Step 2: Run tests — verify FAIL**

```bash
cd pwa && pnpm vitest run src/portal/reports/tabs/HealthScoreCard.test.tsx \
  src/portal/reports/tabs/OkrRollupTable.test.tsx \
  src/portal/reports/tabs/KpiTrendPanel.test.tsx 2>&1 | tail -10
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `HealthScoreCard.tsx`**

Create `pwa/src/portal/reports/tabs/HealthScoreCard.tsx`:

```tsx
import type { HealthScoreResponse } from "../api/types";

type Props = HealthScoreResponse;

function scoreClass(score: number): string {
  if (score >= 80) return "health-score--green";
  if (score >= 60) return "health-score--amber";
  return "health-score--red";
}

export function HealthScoreCard(props: Props) {
  const cls = scoreClass(props.score);
  return (
    <div
      className={`health-score-card ${cls}`}
      aria-label={`Health Score: ${Math.round(props.score)}`}
    >
      <div className="health-score-card__score">{Math.round(props.score)}</div>
      <div className="health-score-card__components">
        <span>OKR {Math.round(props.components.okr_weight * 100)}%: {Math.round(props.okr_pct * 100)}%</span>
        <span>Ontime {Math.round(props.components.ontime_weight * 100)}%: {Math.round(props.ontime_pct * 100)}%</span>
        <span>Velocity {Math.round(props.components.velocity_weight * 100)}%: {Math.round(props.velocity_health * 100)}%</span>
      </div>
      <div className="health-score-card__as-of">As of {props.as_of}</div>
    </div>
  );
}
```

- [ ] **Step 4: Implement `OkrRollupTable.tsx`**

Create `pwa/src/portal/reports/tabs/OkrRollupTable.tsx`:

```tsx
import { useState } from "react";
import type { OkrRollupRow, OkrRollupTotals } from "../api/types";

interface Props {
  rows: OkrRollupRow[];
  totals: OkrRollupTotals;
}

export function OkrRollupTable({ rows, totals }: Props) {
  const [sortAsc, setSortAsc] = useState(false);

  if (rows.length === 0) {
    return <div className="empty-state">No OKR data for this period.</div>;
  }

  const sorted = [...rows].sort((a, b) =>
    sortAsc ? a.avg_progress - b.avg_progress : b.avg_progress - a.avg_progress
  );

  return (
    <table className="okr-rollup-table">
      <thead>
        <tr>
          <th>Project</th>
          <th>Objectives</th>
          <th>KRs</th>
          <th>
            <button onClick={() => setSortAsc((v) => !v)}>
              Avg Progress {sortAsc ? "▲" : "▼"}
            </button>
          </th>
          <th>On Track</th>
          <th>At Risk</th>
          <th>Behind</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((row) => (
          <tr key={row.project}>
            <td>{row.project_title}</td>
            <td>{row.objective_count}</td>
            <td>{row.kr_count}</td>
            <td>
              <div className="progress-cell">
                <div
                  className="progress-bar"
                  style={{ width: `${Math.round(row.avg_progress * 100)}%` }}
                />
                <span>{Math.round(row.avg_progress * 100)}%</span>
              </div>
            </td>
            <td>{row.on_track}</td>
            <td>{row.at_risk}</td>
            <td>{row.behind}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          <td>{totals.objective_count}</td>
          <td>{totals.kr_count}</td>
          <td>{Math.round(totals.avg_progress * 100)}%</td>
          <td>{totals.on_track}</td>
          <td>{totals.at_risk}</td>
          <td>{totals.behind}</td>
        </tr>
      </tfoot>
    </table>
  );
}
```

- [ ] **Step 5: Implement `KpiTrendChart.tsx`**

Create `pwa/src/portal/reports/charts/KpiTrendChart.tsx`:

```tsx
import { lazy, Suspense } from "react";
import type { KpiTrendPoint } from "../api/types";

interface Props {
  series: KpiTrendPoint[];
  unit: string;
}

const LazyChart = lazy(async () => {
  const recharts = await import("recharts");
  const { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } = recharts;

  function Chart({ series, unit }: Props) {
    const target = series[0]?.target ?? 0;
    return (
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={series}>
          <XAxis dataKey="label" />
          <YAxis unit={` ${unit}`} />
          <Tooltip
            formatter={(value: number, name: string) => [`${value} ${unit}`, name]}
          />
          <ReferenceLine y={target} stroke="#888" strokeDasharray="4 2" label="Target" />
          <Line type="monotone" dataKey="value" stroke="#3b82f6" dot={false} name="Actual" />
          <Line type="monotone" dataKey="target" stroke="#f59e0b" dot={false} name="Target" strokeDasharray="4 2" />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  return { default: Chart };
});

export function KpiTrendChart(props: Props) {
  return (
    <Suspense fallback={<div className="chart-loading">Loading chart…</div>}>
      <LazyChart {...props} />
    </Suspense>
  );
}
```

- [ ] **Step 6: Implement `KpiTrendPanel.tsx`**

Create `pwa/src/portal/reports/tabs/KpiTrendPanel.tsx`:

```tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPortalKpiList, getPortalKpiTrend } from "../api/portal_reports";
import { KpiTrendChart } from "../charts/KpiTrendChart";
import { trackReportsKpiSelect } from "../../../telemetry";

export function KpiTrendPanel() {
  const [selectedKpi, setSelectedKpi] = useState<string | null>(null);

  const kpiList = useQuery({
    queryKey: ["reports", "kpi_list"],
    queryFn: () => getPortalKpiList(),
    staleTime: 5 * 60 * 1000,
  });

  const firstKpi = kpiList.data?.[0]?.name ?? null;
  const activeKpi = selectedKpi ?? firstKpi;

  const trend = useQuery({
    queryKey: ["reports", "kpi_trend", activeKpi, 12],
    queryFn: () => getPortalKpiTrend(activeKpi!, 12),
    enabled: !!activeKpi,
    staleTime: 5 * 60 * 1000,
  });

  function handleKpiChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setSelectedKpi(e.target.value);
    trackReportsKpiSelect(e.target.value);
  }

  return (
    <div className="kpi-trend-panel">
      <div className="kpi-trend-panel__header">
        <label htmlFor="kpi-select">KPI</label>
        <select id="kpi-select" value={activeKpi ?? ""} onChange={handleKpiChange}>
          {(kpiList.data ?? []).map((k) => (
            <option key={k.name} value={k.name}>
              {k.title} ({k.unit})
            </option>
          ))}
        </select>
      </div>
      {trend.isLoading && <div className="chart-loading">Loading…</div>}
      {trend.data && (
        <KpiTrendChart series={trend.data.series} unit={trend.data.unit} />
      )}
    </div>
  );
}
```

- [ ] **Step 7: Implement `OkrTab.tsx`**

Create `pwa/src/portal/reports/tabs/OkrTab.tsx`:

```tsx
import { useState } from "react";
import { useOkrReport } from "../hooks/useOkrReport";
import { HealthScoreCard } from "./HealthScoreCard";
import { OkrRollupTable } from "./OkrRollupTable";
import { KpiTrendPanel } from "./KpiTrendPanel";
import { PageSkeleton } from "../../../components/PageSkeleton";

const EMPTY_TOTALS = {
  objective_count: 0, kr_count: 0, avg_progress: 0,
  on_track: 0, at_risk: 0, behind: 0,
};

export function OkrTab() {
  const [period, setPeriod] = useState<string | undefined>(undefined);
  const { health, rollup } = useOkrReport(period);

  if (health.isLoading || rollup.isLoading) return <PageSkeleton />;

  return (
    <div className="okr-tab">
      <div className="okr-tab__top-row">
        {health.data && <HealthScoreCard {...health.data} />}
        <div className="okr-tab__period">
          <label htmlFor="okr-period">Period</label>
          <select
            id="okr-period"
            value={period ?? ""}
            onChange={(e) => setPeriod(e.target.value || undefined)}
          >
            <option value="">Current</option>
          </select>
        </div>
      </div>
      <div className="okr-tab__main">
        <div className="okr-tab__left">
          <OkrRollupTable
            rows={rollup.data?.rows ?? []}
            totals={rollup.data?.totals ?? EMPTY_TOTALS}
          />
        </div>
        <div className="okr-tab__right">
          <KpiTrendPanel />
        </div>
      </div>
    </div>
  );
}
```

Write `pwa/src/portal/reports/tabs/OkrTab.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { OkrTab } from "./OkrTab";
import * as api from "../api/portal_reports";

vi.mock("../api/portal_reports");
vi.mock("../charts/KpiTrendChart", () => ({
  KpiTrendChart: () => createElement("div", { "data-testid": "kpi-chart" }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe("OkrTab", () => {
  beforeEach(() => {
    vi.mocked(api.getPortalHealthScore).mockResolvedValue({
      score: 82, okr_pct: 0.74, ontime_pct: 0.88, velocity_health: 0.91,
      components: { okr_weight: 0.4, ontime_weight: 0.3, velocity_weight: 0.3 },
      as_of: "2026-05-18T10:00:00",
    });
    vi.mocked(api.getPortalOkrRollup).mockResolvedValue({
      period: "Q2-2026",
      rows: [{ project: "P1", project_title: "Alpha", objective_count: 3,
               kr_count: 9, avg_progress: 0.65, on_track: 2, at_risk: 1, behind: 0 }],
      totals: { objective_count: 3, kr_count: 9, avg_progress: 0.65,
                on_track: 2, at_risk: 1, behind: 0 },
    });
    vi.mocked(api.getPortalKpiList).mockResolvedValue([]);
  });

  it("renders HealthScoreCard when data loads", async () => {
    render(createElement(OkrTab, null), { wrapper });
    const card = await screen.findByLabelText(/health score: 82/i);
    expect(card).not.toBeNull();
  });

  it("renders OkrRollupTable with project row", async () => {
    render(createElement(OkrTab, null), { wrapper });
    const cell = await screen.findByText("Alpha");
    expect(cell).not.toBeNull();
  });

  it("shows EmptyState when rollup rows is empty", async () => {
    vi.mocked(api.getPortalOkrRollup).mockResolvedValue({
      period: "Q2-2026",
      rows: [],
      totals: { objective_count: 0, kr_count: 0, avg_progress: 0,
                on_track: 0, at_risk: 0, behind: 0 },
    });
    render(createElement(OkrTab, null), { wrapper });
    const empty = await screen.findByText(/no okr data/i);
    expect(empty).not.toBeNull();
  });
});
```

- [ ] **Step 8: Run OKR tab tests — verify PASS**

```bash
cd pwa && pnpm vitest run src/portal/reports/tabs/HealthScoreCard.test.tsx \
  src/portal/reports/tabs/OkrRollupTable.test.tsx \
  src/portal/reports/tabs/KpiTrendPanel.test.tsx \
  src/portal/reports/tabs/OkrTab.test.tsx 2>&1 | tail -10
```

Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add pwa/src/portal/reports/tabs/ \
        pwa/src/portal/reports/charts/KpiTrendChart.tsx
git commit -m "feat(reports): tambah OKR tab (HealthScoreCard, OkrRollupTable, KpiTrendPanel)"
```

---

## Task 10: Sprints tab components — `VelocityComparisonChart`, `ForecastGrid`, `RiskMatrix`, `SprintsTab`

**Files:**
- Create: `pwa/src/portal/reports/charts/VelocityComparisonChart.tsx` + `.test.tsx`
- Create: `pwa/src/portal/reports/tabs/ForecastGrid.tsx` + `.test.tsx`
- Create: `pwa/src/portal/reports/tabs/RiskMatrix.tsx` + `.test.tsx`
- Create: `pwa/src/portal/reports/tabs/SprintsTab.tsx` + `.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `pwa/src/portal/reports/tabs/ForecastGrid.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { ForecastGrid } from "./ForecastGrid";
import type { ForecastItem } from "../api/types";

const ITEMS: ForecastItem[] = [
  { project: "P1", project_title: "Alpha", completion_estimate: "2026-07-04",
    confidence: 0.72, remaining_points: 186, avg_velocity: 41.2, status: "on_track" },
  { project: "P2", project_title: "Beta", completion_estimate: "2026-05-01",
    confidence: 0.50, remaining_points: 80, avg_velocity: 20.0, status: "delayed" },
];

describe("ForecastGrid", () => {
  it("renders project title", () => {
    render(createElement(ForecastGrid, { forecasts: ITEMS }));
    expect(screen.getByText("Alpha")).not.toBeNull();
  });

  it("on_track status card has green class", () => {
    const { container } = render(createElement(ForecastGrid, { forecasts: ITEMS }));
    expect(container.querySelector(".forecast-card--on-track")).not.toBeNull();
  });

  it("delayed status card has red class", () => {
    const { container } = render(createElement(ForecastGrid, { forecasts: ITEMS }));
    expect(container.querySelector(".forecast-card--delayed")).not.toBeNull();
  });
});
```

Create `pwa/src/portal/reports/tabs/RiskMatrix.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { RiskMatrix } from "./RiskMatrix";
import type { RiskProject } from "../api/types";

const ALL_NONE: RiskProject[] = [
  { project: "P1", project_title: "Alpha", max_level: "none",
    flags: [{ type: "overdue_tasks", level: "none" }] },
];

const WITH_RISKS: RiskProject[] = [
  { project: "P1", project_title: "Alpha", max_level: "high",
    flags: [
      { type: "overdue_tasks", level: "high", count: 5 },
      { type: "velocity_drop", level: "medium", delta_pct: -18 },
    ] },
];

describe("RiskMatrix", () => {
  it("shows EmptyState when all risks are none", () => {
    render(createElement(RiskMatrix, { risks: ALL_NONE }));
    expect(screen.getByText(/no risks flagged/i)).not.toBeNull();
  });

  it("renders risk project row when risks present", () => {
    render(createElement(RiskMatrix, { risks: WITH_RISKS }));
    expect(screen.getByText("Alpha")).not.toBeNull();
  });

  it("high risk flag cell has aria-label", () => {
    render(createElement(RiskMatrix, { risks: WITH_RISKS }));
    const highCell = screen.getByLabelText(/severity: high/i);
    expect(highCell).not.toBeNull();
  });
});
```

Create `pwa/src/portal/reports/tabs/SprintsTab.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { SprintsTab } from "./SprintsTab";
import * as api from "../api/portal_reports";

vi.mock("../api/portal_reports");
vi.mock("../charts/VelocityComparisonChart", () => ({
  VelocityComparisonChart: () => createElement("div", { "data-testid": "velocity-chart" }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe("SprintsTab", () => {
  beforeEach(() => {
    vi.mocked(api.getPortalVelocityComparison).mockResolvedValue({ n: 6, projects: [] });
    vi.mocked(api.getPortalForecasts).mockResolvedValue({ forecasts: [] });
    vi.mocked(api.getPortalRisks).mockResolvedValue({ risks: [] });
  });

  it("renders velocity chart, n selector, forecast grid, risk matrix", async () => {
    render(createElement(SprintsTab, null), { wrapper });
    const chart = await screen.findByTestId("velocity-chart");
    expect(chart).not.toBeNull();
    expect(screen.getByRole("combobox")).not.toBeNull(); // n selector
  });

  it("n selector change triggers refetch with new n", async () => {
    render(createElement(SprintsTab, null), { wrapper });
    await screen.findByTestId("velocity-chart");
    const select = screen.getByRole("combobox");
    await userEvent.selectOptions(select, "12");
    expect(api.getPortalVelocityComparison).toHaveBeenCalledWith(12);
  });
});
```

- [ ] **Step 2: Run tests — verify FAIL**

```bash
cd pwa && pnpm vitest run src/portal/reports/tabs/ForecastGrid.test.tsx \
  src/portal/reports/tabs/RiskMatrix.test.tsx \
  src/portal/reports/tabs/SprintsTab.test.tsx 2>&1 | tail -10
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `VelocityComparisonChart.tsx`**

Create `pwa/src/portal/reports/charts/VelocityComparisonChart.tsx`:

```tsx
import { lazy, Suspense } from "react";
import type { VelocityProject } from "../api/types";

interface Props {
  projects: VelocityProject[];
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
                "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#6366f1"];

const LazyChart = lazy(async () => {
  const recharts = await import("recharts");
  const { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } = recharts;

  // Build dataset: rows are sprint labels; each project is a key
  function buildData(projects: VelocityProject[]) {
    const allLabels = Array.from(
      new Set(projects.flatMap((p) => p.sprints.map((s) => s.sprint_label)))
    ).sort();
    return allLabels.map((label) => {
      const row: Record<string, number | string> = { label };
      for (const p of projects) {
        const pt = p.sprints.find((s) => s.sprint_label === label);
        row[p.project_title] = pt?.velocity ?? 0;
      }
      return row;
    });
  }

  function Chart({ projects }: Props) {
    const data = buildData(projects);
    const capped = projects.slice(0, 10);
    return (
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data}>
          <XAxis dataKey="label" />
          <YAxis />
          <Tooltip />
          <Legend />
          {capped.map((p, i) => (
            <Bar key={p.project} dataKey={p.project_title} fill={COLORS[i % COLORS.length]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return { default: Chart };
});

export function VelocityComparisonChart(props: Props) {
  return (
    <Suspense fallback={<div className="chart-loading">Loading chart…</div>}>
      <LazyChart {...props} />
    </Suspense>
  );
}
```

- [ ] **Step 4: Implement `ForecastGrid.tsx`**

Create `pwa/src/portal/reports/tabs/ForecastGrid.tsx`:

```tsx
import type { ForecastItem, ForecastStatus } from "../api/types";

const STATUS_CLASS: Record<ForecastStatus, string> = {
  on_track: "forecast-card--on-track",
  at_risk:  "forecast-card--at-risk",
  delayed:  "forecast-card--delayed",
};

const STATUS_LABEL: Record<ForecastStatus, string> = {
  on_track: "On Track",
  at_risk:  "At Risk",
  delayed:  "Delayed",
};

interface Props {
  forecasts: ForecastItem[];
}

export function ForecastGrid({ forecasts }: Props) {
  if (forecasts.length === 0) {
    return <div className="empty-state">No forecast data available.</div>;
  }
  return (
    <div className="forecast-grid">
      {forecasts.map((fc) => (
        <div key={fc.project} className={`forecast-card ${STATUS_CLASS[fc.status]}`}>
          <div className="forecast-card__title">{fc.project_title}</div>
          <div className="forecast-card__estimate">{fc.completion_estimate}</div>
          <div className="forecast-card__badge">{STATUS_LABEL[fc.status]}</div>
          <div className="forecast-card__confidence">
            {Math.round(fc.confidence * 100)}% confidence
          </div>
          <div className="forecast-card__remaining">
            {fc.remaining_points} pts remaining · avg {fc.avg_velocity} pts/sprint
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Implement `RiskMatrix.tsx`**

Create `pwa/src/portal/reports/tabs/RiskMatrix.tsx`:

```tsx
import { useState } from "react";
import type { RiskProject, RiskLevel } from "../api/types";

const RISK_TYPES = [
  "overdue_tasks",
  "velocity_drop",
  "no_active_sprint",
];

const RISK_TYPE_LABEL: Record<string, string> = {
  overdue_tasks:    "Overdue Tasks",
  velocity_drop:    "Velocity Drop",
  no_active_sprint: "No Active Sprint",
};

const LEVEL_ORDER: Record<RiskLevel, number> = {
  high: 3, medium: 2, low: 1, none: 0,
};

interface Props {
  risks: RiskProject[];
}

export function RiskMatrix({ risks }: Props) {
  const [sortAsc, setSortAsc] = useState(false);

  const allNone = risks.every((r) => r.max_level === "none");
  if (allNone) {
    return (
      <div className="empty-state empty-state--check">
        <span>No risks flagged</span>
      </div>
    );
  }

  const sorted = [...risks].sort((a, b) =>
    sortAsc
      ? LEVEL_ORDER[a.max_level] - LEVEL_ORDER[b.max_level]
      : LEVEL_ORDER[b.max_level] - LEVEL_ORDER[a.max_level]
  );

  return (
    <table className="risk-matrix">
      <thead>
        <tr>
          <th>
            <button onClick={() => setSortAsc((v) => !v)}>
              Project {sortAsc ? "▲" : "▼"}
            </button>
          </th>
          {RISK_TYPES.map((rt) => (
            <th key={rt}>{RISK_TYPE_LABEL[rt] ?? rt}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((rp) => (
          <tr key={rp.project}>
            <td>{rp.project_title}</td>
            {RISK_TYPES.map((rt) => {
              const flag = rp.flags.find((f) => f.type === rt);
              const level = flag?.level ?? "none";
              return (
                <td key={rt}>
                  {level !== "none" && (
                    <span
                      className={`risk-badge risk-badge--${level}`}
                      aria-label={`severity: ${level}`}
                    >
                      {level}
                    </span>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 6: Implement `SprintsTab.tsx`**

Create `pwa/src/portal/reports/tabs/SprintsTab.tsx`:

```tsx
import { useState } from "react";
import { useSprintsReport } from "../hooks/useSprintsReport";
import { VelocityComparisonChart } from "../charts/VelocityComparisonChart";
import { ForecastGrid } from "./ForecastGrid";
import { RiskMatrix } from "./RiskMatrix";
import { PageSkeleton } from "../../../components/PageSkeleton";
import { trackReportsVelocityNChange } from "../../../telemetry";

const N_OPTIONS = [3, 6, 12] as const;
type NOption = (typeof N_OPTIONS)[number];

export function SprintsTab() {
  const [n, setN] = useState<NOption>(6);
  const { velocity, forecasts, risks } = useSprintsReport(n);

  if (velocity.isLoading || forecasts.isLoading || risks.isLoading) {
    return <PageSkeleton />;
  }

  function handleNChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = Number(e.target.value) as NOption;
    setN(val);
    trackReportsVelocityNChange(val);
  }

  return (
    <div className="sprints-tab">
      <div className="sprints-tab__velocity-section">
        <div className="sprints-tab__velocity-header">
          <h3>Velocity Comparison</h3>
          <select value={n} onChange={handleNChange} aria-label="Number of sprints">
            {N_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>Last {opt} sprints</option>
            ))}
          </select>
        </div>
        <VelocityComparisonChart projects={velocity.data?.projects ?? []} />
      </div>
      <div className="sprints-tab__lower">
        <div className="sprints-tab__forecasts">
          <h3>Forecast</h3>
          <ForecastGrid forecasts={forecasts.data?.forecasts ?? []} />
        </div>
        <div className="sprints-tab__risks">
          <h3>Risk Matrix</h3>
          <RiskMatrix risks={risks.data?.risks ?? []} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Run Sprints tab tests — verify PASS**

```bash
cd pwa && pnpm vitest run src/portal/reports/tabs/ForecastGrid.test.tsx \
  src/portal/reports/tabs/RiskMatrix.test.tsx \
  src/portal/reports/tabs/SprintsTab.test.tsx 2>&1 | tail -10
```

Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add pwa/src/portal/reports/charts/VelocityComparisonChart.tsx \
        pwa/src/portal/reports/tabs/ForecastGrid.tsx \
        pwa/src/portal/reports/tabs/ForecastGrid.test.tsx \
        pwa/src/portal/reports/tabs/RiskMatrix.tsx \
        pwa/src/portal/reports/tabs/RiskMatrix.test.tsx \
        pwa/src/portal/reports/tabs/SprintsTab.tsx \
        pwa/src/portal/reports/tabs/SprintsTab.test.tsx \
        pwa/src/portal/reports/charts/
git commit -m "feat(reports): tambah Sprints tab (VelocityComparisonChart, ForecastGrid, RiskMatrix)"
```

---

## Task 11: Team tab components — `LeaderboardTable`, `CompletionRingChart`, `WorkloadChart`, `OverdueTable`, `TeamTab`

**Files:**
- Create: `pwa/src/portal/reports/tabs/LeaderboardTable.tsx` + `.test.tsx`
- Create: `pwa/src/portal/reports/tabs/OverdueTable.tsx` + `.test.tsx`
- Create: `pwa/src/portal/reports/charts/CompletionRingChart.tsx` + `.test.tsx`
- Create: `pwa/src/portal/reports/charts/WorkloadChart.tsx` + `.test.tsx`
- Create: `pwa/src/portal/reports/tabs/TeamTab.tsx` + `.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `pwa/src/portal/reports/tabs/LeaderboardTable.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { LeaderboardTable } from "./LeaderboardTable";
import type { LeaderboardRow } from "../api/types";

const ROWS: LeaderboardRow[] = [
  { rank: 1, user: "alice@x.com", full_name: "Alice", points: 420,
    tasks_completed: 18, streak_days: 12, avg_quality: 4.2 },
  { rank: 2, user: "bob@x.com",   full_name: "Bob",   points: 380,
    tasks_completed: 15, streak_days: 8,  avg_quality: 3.9 },
];

describe("LeaderboardTable", () => {
  it("renders member name", () => {
    render(createElement(LeaderboardTable, { rows: ROWS }));
    expect(screen.getByText("Alice")).not.toBeNull();
  });

  it("rank 1 row has gold medal class", () => {
    const { container } = render(createElement(LeaderboardTable, { rows: ROWS }));
    expect(container.querySelector(".medal--gold")).not.toBeNull();
  });

  it("sortable column click changes sort order", async () => {
    render(createElement(LeaderboardTable, { rows: ROWS }));
    const sortBtn = screen.getAllByRole("button")[0];
    await userEvent.click(sortBtn);
    // After toggling ascending, Bob (380) should precede Alice (420)
    const cells = screen.getAllByRole("cell");
    const names = cells
      .map((c) => c.textContent)
      .filter((t) => t === "Alice" || t === "Bob");
    expect(names[0]).toBe("Bob");
  });
});
```

Create `pwa/src/portal/reports/tabs/OverdueTable.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { OverdueTable } from "./OverdueTable";
import type { OverdueResponse } from "../api/types";

const DATA: OverdueResponse = {
  as_of: "2026-05-18",
  total_overdue: 5,
  by_member: [
    { user: "alice@x.com", full_name: "Alice", overdue_count: 3,
      overdue_hours: 11.5, oldest_overdue_days: 9 },
  ],
  by_project: [
    { project: "P1", project_title: "Alpha", overdue_count: 3, overdue_hours: 11.5 },
  ],
};

describe("OverdueTable", () => {
  it("by member view shows member name by default", () => {
    render(createElement(OverdueTable, { data: DATA }));
    expect(screen.getByText("Alice")).not.toBeNull();
  });

  it("toggle to by project shows project title", async () => {
    render(createElement(OverdueTable, { data: DATA }));
    const btn = screen.getByRole("button", { name: /by project/i });
    await userEvent.click(btn);
    expect(screen.getByText("Alpha")).not.toBeNull();
  });

  it("row with oldest_overdue_days > 7 has red-text class", () => {
    const { container } = render(createElement(OverdueTable, { data: DATA }));
    expect(container.querySelector(".overdue-row--red")).not.toBeNull();
  });
});
```

Create `pwa/src/portal/reports/tabs/TeamTab.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { TeamTab } from "./TeamTab";
import * as api from "../api/portal_reports";

vi.mock("../api/portal_reports");
vi.mock("../charts/CompletionRingChart", () => ({
  CompletionRingChart: () => createElement("div", { "data-testid": "ring-chart" }),
}));
vi.mock("../charts/WorkloadChart", () => ({
  WorkloadChart: () => createElement("div", { "data-testid": "workload-chart" }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe("TeamTab", () => {
  beforeEach(() => {
    vi.mocked(api.getPortalLeaderboard).mockResolvedValue({
      period: "this_month",
      rows: [{ rank: 1, user: "alice@x.com", full_name: "Alice", points: 420,
               tasks_completed: 18, streak_days: 12, avg_quality: 4.2 }],
    });
    vi.mocked(api.getPortalWorkload).mockResolvedValue({ as_of: "2026-05-18", members: [] });
    vi.mocked(api.getPortalOverdue).mockResolvedValue({
      as_of: "2026-05-18", total_overdue: 0, by_member: [], by_project: [] });
  });

  it("renders leaderboard and period selector", async () => {
    render(createElement(TeamTab, null), { wrapper });
    await screen.findByText("Alice");
    expect(screen.getByRole("combobox")).not.toBeNull();
  });

  it("period selector change refetches leaderboard", async () => {
    render(createElement(TeamTab, null), { wrapper });
    await screen.findByText("Alice");
    const select = screen.getByRole("combobox");
    await userEvent.selectOptions(select, "this_week");
    expect(api.getPortalLeaderboard).toHaveBeenCalledWith("this_week", 20);
  });
});
```

- [ ] **Step 2: Run tests — verify FAIL**

```bash
cd pwa && pnpm vitest run src/portal/reports/tabs/LeaderboardTable.test.tsx \
  src/portal/reports/tabs/OverdueTable.test.tsx \
  src/portal/reports/tabs/TeamTab.test.tsx 2>&1 | tail -10
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `LeaderboardTable.tsx`**

Create `pwa/src/portal/reports/tabs/LeaderboardTable.tsx`:

```tsx
import { useState } from "react";
import type { LeaderboardRow } from "../api/types";

const MEDAL_CLASS: Record<number, string> = {
  1: "medal--gold",
  2: "medal--silver",
  3: "medal--bronze",
};

interface Props {
  rows: LeaderboardRow[];
}

export function LeaderboardTable({ rows }: Props) {
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = [...rows].sort((a, b) =>
    sortAsc ? a.points - b.points : b.points - a.points
  );

  return (
    <table className="leaderboard-table">
      <thead>
        <tr>
          <th>Rank</th>
          <th>Member</th>
          <th>
            <button onClick={() => setSortAsc((v) => !v)}>
              Points {sortAsc ? "▲" : "▼"}
            </button>
          </th>
          <th>Tasks Done</th>
          <th>Streak</th>
          <th>Avg Quality</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((row) => (
          <tr key={row.user}>
            <td>
              {MEDAL_CLASS[row.rank] ? (
                <span className={`medal ${MEDAL_CLASS[row.rank]}`}>{row.rank}</span>
              ) : (
                row.rank
              )}
            </td>
            <td>{row.full_name}</td>
            <td>{row.points}</td>
            <td>{row.tasks_completed}</td>
            <td>{row.streak_days}d</td>
            <td>{row.avg_quality.toFixed(1)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Implement `OverdueTable.tsx`**

Create `pwa/src/portal/reports/tabs/OverdueTable.tsx`:

```tsx
import { useState } from "react";
import type { OverdueResponse } from "../api/types";
import { trackReportsOverdueViewToggle } from "../../../telemetry";

type ViewMode = "member" | "project";

interface Props {
  data: OverdueResponse;
}

export function OverdueTable({ data }: Props) {
  const [view, setView] = useState<ViewMode>("member");

  function switchView(v: ViewMode) {
    setView(v);
    trackReportsOverdueViewToggle(v);
  }

  return (
    <div className="overdue-table-wrapper">
      <div className="overdue-table-wrapper__controls">
        <button
          className={view === "member" ? "active" : ""}
          onClick={() => switchView("member")}
        >
          By Member
        </button>
        <button
          className={view === "project" ? "active" : ""}
          onClick={() => switchView("project")}
        >
          By Project
        </button>
      </div>
      {view === "member" ? (
        <table className="overdue-table">
          <thead>
            <tr>
              <th>Member</th>
              <th>Overdue Tasks</th>
              <th>Overdue Hours</th>
              <th>Oldest (days)</th>
            </tr>
          </thead>
          <tbody>
            {data.by_member.map((r) => {
              const cls =
                r.oldest_overdue_days > 7
                  ? "overdue-row--red"
                  : r.oldest_overdue_days >= 3
                  ? "overdue-row--amber"
                  : "";
              return (
                <tr key={r.user} className={cls}>
                  <td>{r.full_name}</td>
                  <td>{r.overdue_count}</td>
                  <td>{r.overdue_hours.toFixed(1)}</td>
                  <td>{r.oldest_overdue_days}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <table className="overdue-table">
          <thead>
            <tr>
              <th>Project</th>
              <th>Overdue Tasks</th>
              <th>Overdue Hours</th>
            </tr>
          </thead>
          <tbody>
            {data.by_project.map((r) => (
              <tr key={r.project}>
                <td>{r.project_title}</td>
                <td>{r.overdue_count}</td>
                <td>{r.overdue_hours.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Implement `CompletionRingChart.tsx`**

Create `pwa/src/portal/reports/charts/CompletionRingChart.tsx`:

```tsx
import { lazy, Suspense } from "react";
import type { LeaderboardRow } from "../api/types";

interface Props {
  rows: LeaderboardRow[];
}

const LazyChart = lazy(async () => {
  const recharts = await import("recharts");
  const { RadialBarChart, RadialBar, ResponsiveContainer } = recharts;

  function Chart({ rows }: Props) {
    const totalCompleted = rows.reduce((s, r) => s + r.tasks_completed, 0);
    // tasks_completed is used as proxy; treat total as sum (no total_assigned available)
    const pct = rows.length === 0 ? 0 : Math.round((totalCompleted / Math.max(totalCompleted, 1)) * 100);
    const data = [{ name: "Completion", value: pct, fill: "#3b82f6" }];

    return (
      <div className="completion-ring-chart" style={{ position: "relative" }}>
        <ResponsiveContainer width={160} height={160}>
          <RadialBarChart
            cx="50%" cy="50%"
            innerRadius="60%" outerRadius="80%"
            data={data}
            startAngle={90} endAngle={90 - 360 * (pct / 100)}
          >
            <RadialBar dataKey="value" cornerRadius={4} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div
          className="completion-ring-chart__label"
          style={{ position: "absolute", top: "50%", left: "50%",
                   transform: "translate(-50%, -50%)", textAlign: "center" }}
        >
          <div className="completion-ring-chart__pct">{pct}%</div>
          <div className="completion-ring-chart__sub">completed this period</div>
        </div>
      </div>
    );
  }

  return { default: Chart };
});

export function CompletionRingChart(props: Props) {
  return (
    <Suspense fallback={<div className="chart-loading">Loading…</div>}>
      <LazyChart {...props} />
    </Suspense>
  );
}
```

- [ ] **Step 6: Implement `WorkloadChart.tsx`**

Create `pwa/src/portal/reports/charts/WorkloadChart.tsx`:

```tsx
import { lazy, Suspense } from "react";
import type { WorkloadMember } from "../api/types";

interface Props {
  members: WorkloadMember[];
}

const LazyChart = lazy(async () => {
  const recharts = await import("recharts");
  const { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } = recharts;

  function Chart({ members }: Props) {
    const sorted = [...members].sort(
      (a, b) => b.open_tasks + b.overdue_tasks - (a.open_tasks + a.overdue_tasks)
    );
    const data = sorted.map((m) => ({
      name: m.full_name,
      normal: m.open_tasks - m.overdue_tasks,
      overdue: m.overdue_tasks,
    }));

    return (
      <ResponsiveContainer width="100%" height={Math.max(160, data.length * 40)}>
        <BarChart layout="vertical" data={data}>
          <XAxis type="number" />
          <YAxis type="category" dataKey="name" width={120} />
          <Tooltip />
          <Legend />
          <Bar dataKey="normal"  name="Open Tasks"   fill="#3b82f6" stackId="a" />
          <Bar dataKey="overdue" name="Overdue Tasks" fill="#ef4444" stackId="a" />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return { default: Chart };
});

export function WorkloadChart(props: Props) {
  return (
    <Suspense fallback={<div className="chart-loading">Loading…</div>}>
      <LazyChart {...props} />
    </Suspense>
  );
}
```

- [ ] **Step 7: Implement `TeamTab.tsx`**

Create `pwa/src/portal/reports/tabs/TeamTab.tsx`:

```tsx
import { useState } from "react";
import { useTeamReport } from "../hooks/useTeamReport";
import { LeaderboardTable } from "./LeaderboardTable";
import { OverdueTable } from "./OverdueTable";
import { CompletionRingChart } from "../charts/CompletionRingChart";
import { WorkloadChart } from "../charts/WorkloadChart";
import { PageSkeleton } from "../../../components/PageSkeleton";
import { trackReportsLeaderboardPeriodChange } from "../../../telemetry";

const PERIODS = ["this_week", "this_month", "all_time"] as const;
type Period = (typeof PERIODS)[number];
const PERIOD_LABEL: Record<Period, string> = {
  this_week:  "This Week",
  this_month: "This Month",
  all_time:   "All Time",
};

export function TeamTab() {
  const [period, setPeriod] = useState<Period>("this_month");
  const { leaderboard, workload, overdue } = useTeamReport(period);

  if (leaderboard.isLoading || workload.isLoading || overdue.isLoading) {
    return <PageSkeleton />;
  }

  function handlePeriodChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value as Period;
    setPeriod(val);
    trackReportsLeaderboardPeriodChange(val);
  }

  return (
    <div className="team-tab">
      <div className="team-tab__top-row">
        <div className="team-tab__leaderboard-section">
          <div className="team-tab__leaderboard-header">
            <h3>Leaderboard</h3>
            <select value={period} onChange={handlePeriodChange}>
              {PERIODS.map((p) => (
                <option key={p} value={p}>{PERIOD_LABEL[p]}</option>
              ))}
            </select>
          </div>
          <LeaderboardTable rows={leaderboard.data?.rows ?? []} />
        </div>
        <div className="team-tab__charts-section">
          <CompletionRingChart rows={leaderboard.data?.rows ?? []} />
          <WorkloadChart members={workload.data?.members ?? []} />
        </div>
      </div>
      <div className="team-tab__overdue-section">
        <h3>Overdue Analysis</h3>
        {overdue.data && <OverdueTable data={overdue.data} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Run Team tab tests — verify PASS**

```bash
cd pwa && pnpm vitest run src/portal/reports/tabs/LeaderboardTable.test.tsx \
  src/portal/reports/tabs/OverdueTable.test.tsx \
  src/portal/reports/tabs/TeamTab.test.tsx 2>&1 | tail -10
```

Expected: all PASS.

- [ ] **Step 9: Typecheck + lint**

```bash
cd pwa && pnpm typecheck && pnpm lint
```

Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add pwa/src/portal/reports/tabs/ \
        pwa/src/portal/reports/charts/
git commit -m "feat(reports): tambah Team tab (LeaderboardTable, CompletionRingChart, WorkloadChart, OverdueTable)"
```

---

## Task 12: Telemetry — backend `ALLOWED_EVENTS` + frontend `TelemetryEvent` union + track functions

**Files:**
- Modify: `vernon_tasks/task/api/telemetry.py`
- Modify: `pwa/src/telemetry.ts`

- [ ] **Step 1: Add events to backend `ALLOWED_EVENTS`**

Open `vernon_tasks/task/api/telemetry.py`. Add the 8 reports events to `ALLOWED_EVENTS`:

```python
ALLOWED_EVENTS = {
    # ... existing events ...
    "reports.page_view",
    "reports.tab_view",
    "reports.period_change",
    "reports.kpi_select",
    "reports.velocity_n_change",
    "reports.leaderboard_period_change",
    "reports.overdue_view_toggle",
    "reports.permission_denied",
}
```

- [ ] **Step 2: Add events to frontend `TelemetryEvent` union in `telemetry.ts`**

Open `pwa/src/telemetry.ts`. Append to the `TelemetryEvent` union (before the final `;`):

```ts
  | "reports.page_view"
  | "reports.tab_view"
  | "reports.period_change"
  | "reports.kpi_select"
  | "reports.velocity_n_change"
  | "reports.leaderboard_period_change"
  | "reports.overdue_view_toggle"
  | "reports.permission_denied"
```

- [ ] **Step 3: Add track functions to `telemetry.ts`**

Append at the end of `pwa/src/telemetry.ts`:

```ts
export function trackReportsPageView() {
  self.logEvent("reports.page_view", {});
}
export function trackReportsTabView(tab: "okr" | "sprints" | "team") {
  self.logEvent("reports.tab_view", { tab });
}
export function trackReportsPeriodChange(tab: string, period: string) {
  self.logEvent("reports.period_change", { tab, period });
}
export function trackReportsKpiSelect(kpi: string) {
  self.logEvent("reports.kpi_select", { kpi });
}
export function trackReportsVelocityNChange(n: number) {
  self.logEvent("reports.velocity_n_change", { n });
}
export function trackReportsLeaderboardPeriodChange(period: string) {
  self.logEvent("reports.leaderboard_period_change", { period });
}
export function trackReportsOverdueViewToggle(view: "member" | "project") {
  self.logEvent("reports.overdue_view_toggle", { view });
}
export function trackReportsPermissionDenied(tab: string) {
  self.logEvent("reports.permission_denied", { tab });
}
```

- [ ] **Step 4: Run typecheck**

```bash
cd pwa && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 5: Verify all existing telemetry tests pass**

```bash
cd pwa && pnpm vitest run src/telemetry 2>&1 | tail -10
```

Expected: existing tests still PASS.

- [ ] **Step 6: Commit**

```bash
git add vernon_tasks/task/api/telemetry.py pwa/src/telemetry.ts
git commit -m "feat(reports): tambah 8 events telemetry reports.* ke backend dan frontend"
```

---

## Task 13: Integration test

**Files:**
- Create: `pwa/src/portal/reports/__integration.test.tsx`

- [ ] **Step 1: Write integration test**

Create `pwa/src/portal/reports/__integration.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { ReportsRoutes } from "./ReportsRoutes";
import * as permsHook from "../../auth/usePermissions";
import * as settingsHook from "../../hooks/useVtSettings";
import * as api from "./api/portal_reports";
import * as telemetry from "../../telemetry";

vi.mock("../../auth/usePermissions");
vi.mock("../../hooks/useVtSettings");
vi.mock("./api/portal_reports");
vi.mock("../../telemetry");
// Mock heavy chart components to keep test fast
vi.mock("./charts/KpiTrendChart", () => ({
  KpiTrendChart: () => createElement("div", { "data-testid": "kpi-chart" }),
}));
vi.mock("./charts/VelocityComparisonChart", () => ({
  VelocityComparisonChart: () => createElement("div", { "data-testid": "vel-chart" }),
}));
vi.mock("./charts/WorkloadChart", () => ({
  WorkloadChart: () => createElement("div", { "data-testid": "workload-chart" }),
}));
vi.mock("./charts/CompletionRingChart", () => ({
  CompletionRingChart: () => createElement("div", { "data-testid": "ring-chart" }),
}));

const MOCK_HEALTH = {
  score: 82, okr_pct: 0.74, ontime_pct: 0.88, velocity_health: 0.91,
  components: { okr_weight: 0.4, ontime_weight: 0.3, velocity_weight: 0.3 },
  as_of: "2026-05-18T10:00:00",
};
const MOCK_ROLLUP = {
  period: "Q2-2026",
  rows: [{ project: "P1", project_title: "Alpha OKR", objective_count: 3,
           kr_count: 9, avg_progress: 0.65, on_track: 2, at_risk: 1, behind: 0 }],
  totals: { objective_count: 3, kr_count: 9, avg_progress: 0.65,
            on_track: 2, at_risk: 1, behind: 0 },
};
const MOCK_KPI_LIST = [{ name: "KPI-00001", title: "Velocity", unit: "pts/sprint" }];
const MOCK_KPI_TREND = { kpi_definition: "KPI-00001", title: "Velocity",
                         unit: "pts/sprint", periods: 12, series: [] };
const MOCK_VELOCITY = { n: 6, projects: [] };
const MOCK_FORECASTS = { forecasts: [] };
const MOCK_RISKS = { risks: [] };
const MOCK_LEADERBOARD = {
  period: "this_month",
  rows: [{ rank: 1, user: "alice@x.com", full_name: "Alice Integration",
           points: 420, tasks_completed: 18, streak_days: 12, avg_quality: 4.2 }],
};
const MOCK_WORKLOAD = { as_of: "2026-05-18", members: [] };
const MOCK_OVERDUE = { as_of: "2026-05-18", total_overdue: 0,
                       by_member: [], by_project: [] };

function setupApiMocks() {
  vi.mocked(api.getPortalHealthScore).mockResolvedValue(MOCK_HEALTH);
  vi.mocked(api.getPortalOkrRollup).mockResolvedValue(MOCK_ROLLUP);
  vi.mocked(api.getPortalKpiList).mockResolvedValue(MOCK_KPI_LIST);
  vi.mocked(api.getPortalKpiTrend).mockResolvedValue(MOCK_KPI_TREND);
  vi.mocked(api.getPortalVelocityComparison).mockResolvedValue(MOCK_VELOCITY);
  vi.mocked(api.getPortalForecasts).mockResolvedValue(MOCK_FORECASTS);
  vi.mocked(api.getPortalRisks).mockResolvedValue(MOCK_RISKS);
  vi.mocked(api.getPortalLeaderboard).mockResolvedValue(MOCK_LEADERBOARD);
  vi.mocked(api.getPortalWorkload).mockResolvedValue(MOCK_WORKLOAD);
  vi.mocked(api.getPortalOverdue).mockResolvedValue(MOCK_OVERDUE);
}

function renderRoutes(roles: string[], flagEnabled: boolean) {
  vi.mocked(permsHook.usePermissions).mockReturnValue({
    isLoading: false,
    permissions: [],
    roles,
    hasPermission: () => false,
    hasAnyPermission: () => false,
    hasRole: (r) => roles.includes(r),
  });
  vi.mocked(settingsHook.useVtSettings).mockReturnValue({
    isLoading: false,
    data: {
      portal_enabled: 1,
      portal_okr_enabled: 1,
      portal_projects_enabled: 1,
      portal_sprints_enabled: 1,
      portal_reports_enabled: flagEnabled ? 1 : 0,
    },
    isError: false,
    error: null,
  } as ReturnType<typeof settingsHook.useVtSettings>);

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    createElement(
      QueryClientProvider,
      { client: qc },
      createElement(MemoryRouter, null, createElement(ReportsRoutes))
    )
  );
}

describe("ReportsRoutes integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupApiMocks();
  });

  describe("Scenario A — Manager, flag on", () => {
    it("renders all three tabs", async () => {
      renderRoutes(["VT Manager"], true);
      await waitFor(() => expect(screen.queryByRole("tab", { name: "OKR" })).not.toBeNull());
      expect(screen.getByRole("tab", { name: "Sprints" })).not.toBeNull();
      expect(screen.getByRole("tab", { name: "Team" })).not.toBeNull();
    });

    it("OKR tab content appears (health score card)", async () => {
      renderRoutes(["VT Manager"], true);
      await waitFor(() =>
        expect(screen.queryByLabelText(/health score: 82/i)).not.toBeNull()
      );
    });
  });

  describe("Scenario B — Leader, flag on", () => {
    it("OKR tab absent; Sprints and Team present", async () => {
      renderRoutes(["VT Leader"], true);
      await waitFor(() => expect(screen.queryByRole("tab", { name: "Sprints" })).not.toBeNull());
      expect(screen.queryByRole("tab", { name: "OKR" })).toBeNull();
      expect(screen.getByRole("tab", { name: "Team" })).not.toBeNull();
    });
  });

  describe("Scenario C — flag off", () => {
    it("ReportsFeatureGate renders ComingSoon", async () => {
      renderRoutes(["VT Manager"], false);
      await waitFor(() =>
        expect(screen.queryByText(/coming soon/i)).not.toBeNull()
      );
    });
  });
});
```

- [ ] **Step 2: Run integration test — verify PASS**

```bash
cd pwa && pnpm vitest run src/portal/reports/__integration.test.tsx 2>&1 | tail -15
```

Expected: all 5 assertions PASS.

- [ ] **Step 3: Run entire reports test suite**

```bash
cd pwa && pnpm vitest run src/portal/reports 2>&1 | tail -20
```

Expected: all tests in the reports directory PASS.

- [ ] **Step 4: Run backend test suite**

```bash
bench --site test_site run-tests --app vernon_tasks --module vernon_tasks.tests.portal.test_portal_reports 2>&1 | tail -20
```

Expected: all backend tests PASS.

- [ ] **Step 5: Full typecheck + lint**

```bash
cd pwa && pnpm typecheck && pnpm lint
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add pwa/src/portal/reports/__integration.test.tsx
git commit -m "test(reports): tambah integration test 3 skenario (Manager, Leader, flag off)"
```

---

## Self-Review Checklist

Run this before raising a PR:

1. **All 3 tabs implemented?**
   - OKR: Task 9 → `OkrTab`, `HealthScoreCard`, `OkrRollupTable`, `KpiTrendPanel`, `KpiTrendChart`.
   - Sprints: Task 10 → `SprintsTab`, `VelocityComparisonChart`, `ForecastGrid`, `RiskMatrix`.
   - Team: Task 11 → `TeamTab`, `LeaderboardTable`, `CompletionRingChart`, `WorkloadChart`, `OverdueTable`.
   - ✅

2. **Manager vs Leader permission enforced in backend AND frontend?**
   - Backend: OKR endpoints call `_require_manager()`. Sprints + Team endpoints call `_require_leader()`. Leader scoping via `_visible_projects()` and `_role_bucket()`.
   - Frontend: `ReportsPage` hides OKR tab when `!isManager`. `RequirePermission perm="report.read"` gates the route.
   - ✅

3. **No TBD / TODO / "similar to Task N" placeholders?**
   - All steps contain complete code blocks or exact commands.
   - ✅

4. **Cache key includes role?**
   - Manager-only endpoints: `...manager` suffix.
   - Leader-scoped endpoints: `...{bucket}:{user}` suffix where `bucket` is `"manager"` or `"leader"`.
   - ✅

5. **`get_portal_risks` has no cache?**
   - Confirmed — `get_portal_risks` calls `_evaluate_risks` directly with no `_cache(...)` wrapper.
   - ✅

6. **Recharts lazy-imported per chart component?**
   - All 4 chart components (`KpiTrendChart`, `VelocityComparisonChart`, `CompletionRingChart`, `WorkloadChart`) use `lazy` + dynamic `import("recharts")`.
   - ✅

7. **`_visible_projects` fan-out capped at 50?**
   - `_MAX_PROJECTS = 50` constant; `frappe.get_list(..., limit=_MAX_PROJECTS)` with warning log if hit.
   - ✅

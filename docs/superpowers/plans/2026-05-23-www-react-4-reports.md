# www-react Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reports hub `/portal/reports` + detail `/portal/reports/:slug`. Six reports (project-health, okr-pacing, team-throughput, my-points, project-burndown-archive, risk-log), CSV/PDF export, scheduled email subscriptions via new `VT Report Subscription` doctype.

**Architecture:** One generic `ReportShell` renders filters + viz panel + table + narrative side panel. Each slug plugs in its own filter spec, viz component, table columns, and narrative builder. Backend exposes 3 endpoints (`list_reports`, `run_report`, `export`) plus scheduling endpoints.

**Tech Stack:** Existing + papaparse (client CSV) + jspdf (optional client PDF fallback) — server-side PDF preferred via Frappe print format.

**Spec:** `docs/superpowers/specs/2026-05-23-www-react-dashboard-design.html` §5.

**Prereq:** Plans 0 + 1.

---

## File Structure

```
vernon_tasks/
  task/
    api/
      portal_reports.py
      test_portal_reports.py
    services/
      report_runner.py
      narrative_builder.py
      reports/                            # one file per slug
        project_health.py
        okr_pacing.py
        team_throughput.py
        my_points.py
        project_burndown_archive.py
        risk_log.py
        test_project_health.py
        test_okr_pacing.py
        ...
  vt_report_subscription/                # new doctype
    vt_report_subscription.json
    vt_report_subscription.py
    test_vt_report_subscription.py
www-react/src/
  features/reports/
    types.ts
    reportsApi.ts
    ReportHubPage.tsx
    ReportDetailPage.tsx
    ReportShell.tsx
    FilterPanel.tsx
    NarrativePanel.tsx
    ExportToolbar.tsx
    slugs/
      ProjectHealthHeatmap.tsx
      OkrPacingChart.tsx
      TeamThroughputChart.tsx
      MyPointsTimeline.tsx
      BurndownArchiveList.tsx
      RiskLogTable.tsx
    ScheduleModal.tsx
www-react/tests/unit/reports/
  ReportHubPage.test.tsx
  ReportShell.test.tsx
www-react/tests/e2e/
  reports.spec.ts
```

---

### Task 1: New doctype `VT Report Subscription`

**Files:**
- Create: `vernon_tasks/vt_report_subscription/vt_report_subscription.json`
- Create: `vernon_tasks/vt_report_subscription/vt_report_subscription.py`
- Create: `vernon_tasks/vt_report_subscription/test_vt_report_subscription.py`

- [ ] **Step 1: vt_report_subscription.json (Frappe doctype schema)**

```json
{
  "doctype": "DocType",
  "name": "VT Report Subscription",
  "module": "Task",
  "engine": "InnoDB",
  "naming_rule": "Random",
  "autoname": "hash",
  "track_changes": 1,
  "fields": [
    { "fieldname": "slug",        "label": "Report Slug", "fieldtype": "Data", "reqd": 1 },
    { "fieldname": "title",       "label": "Title",       "fieldtype": "Data", "reqd": 1 },
    { "fieldname": "cron",        "label": "Cron",        "fieldtype": "Data", "reqd": 1,
      "description": "Crontab format (e.g. 0 8 * * 1 = Mondays 08:00)" },
    { "fieldname": "format",      "label": "Format",      "fieldtype": "Select",
      "options": "csv\npdf", "default": "csv", "reqd": 1 },
    { "fieldname": "filters_json","label": "Filters (JSON)","fieldtype": "Code", "options": "JSON" },
    { "fieldname": "enabled",     "label": "Enabled",     "fieldtype": "Check", "default": 1 },
    { "fieldname": "recipients",  "label": "Recipients",  "fieldtype": "Table MultiSelect",
      "options": "VT Report Subscription Recipient", "reqd": 1 },
    { "fieldname": "last_run_at", "label": "Last run",    "fieldtype": "Datetime", "read_only": 1 },
    { "fieldname": "last_status", "label": "Last status", "fieldtype": "Data",     "read_only": 1 }
  ],
  "permissions": [
    { "role": "Vernon Leader", "read": 1, "write": 1, "create": 1, "delete": 1 },
    { "role": "System Manager", "read": 1, "write": 1, "create": 1, "delete": 1 }
  ]
}
```

Plus the child doctype `VT Report Subscription Recipient` (link to User):

```json
{
  "doctype": "DocType",
  "name": "VT Report Subscription Recipient",
  "module": "Task",
  "istable": 1,
  "engine": "InnoDB",
  "fields": [
    { "fieldname": "user", "label": "User", "fieldtype": "Link", "options": "User", "reqd": 1 }
  ],
  "permissions": []
}
```

- [ ] **Step 2: Controller**

`vt_report_subscription.py`:
```python
import frappe
from frappe.model.document import Document

ALLOWED_SLUGS = {
    "project-health", "okr-pacing", "team-throughput",
    "my-points", "project-burndown-archive", "risk-log",
}

class VTReportSubscription(Document):
    def validate(self):
        if self.slug not in ALLOWED_SLUGS:
            frappe.throw(f"Unknown report slug: {self.slug}")
        if not self.recipients:
            frappe.throw("At least one recipient is required")
```

- [ ] **Step 3: Test**

```python
import frappe
from frappe.tests.utils import FrappeTestCase

class TestVTReportSubscription(FrappeTestCase):
    def test_unknown_slug_rejected(self):
        frappe.set_user("Administrator")
        with self.assertRaises(frappe.ValidationError):
            frappe.get_doc({
                "doctype": "VT Report Subscription",
                "slug": "evil-slug",
                "title": "Bad",
                "cron": "0 8 * * 1",
                "format": "csv",
                "recipients": [{"user": "Administrator"}],
            }).insert()

    def test_requires_recipient(self):
        frappe.set_user("Administrator")
        with self.assertRaises(frappe.ValidationError):
            frappe.get_doc({
                "doctype": "VT Report Subscription",
                "slug": "project-health", "title": "OK",
                "cron": "0 8 * * 1", "format": "csv",
                "recipients": [],
            }).insert()
```

Run + PASS.

- [ ] **Step 4: Commit**

```bash
git add vernon_tasks/vt_report_subscription
git commit -m "feat(doctype): VT Report Subscription with cron + recipients"
```

---

### Task 2: Backend — per-slug runner modules + `run_report` dispatch

**Files:**
- Create: `vernon_tasks/task/services/reports/__init__.py`
- Create: `vernon_tasks/task/services/reports/project_health.py`
- Create: `vernon_tasks/task/services/reports/okr_pacing.py`
- Create: `vernon_tasks/task/services/reports/team_throughput.py`
- Create: `vernon_tasks/task/services/reports/my_points.py`
- Create: `vernon_tasks/task/services/reports/project_burndown_archive.py`
- Create: `vernon_tasks/task/services/reports/risk_log.py`
- Create: `vernon_tasks/task/services/report_runner.py`
- Create: `vernon_tasks/task/services/test_report_runner.py`

- [ ] **Step 1: Common runner contract — `__init__.py`**

```python
"""Each report module exposes:

  SLUG: str
  TITLE: str
  AUDIENCE: tuple[str, ...]   # roles allowed
  COLUMNS: list[dict]         # [{key, label, type}]
  def run(filters: dict) -> dict:
      return {"viz": {...}, "rows": [...], "narrative": [...]}
"""
```

- [ ] **Step 2: project_health.py**

```python
import frappe
SLUG = "project-health"
TITLE = "Project Health Heatmap"
AUDIENCE = ("Vernon Leader", "Vernon Exec")
COLUMNS = [
    {"key": "project_name", "label": "Project", "type": "string"},
    {"key": "trend",        "label": "Trend",   "type": "string"},
    *[{"key": f"w{n}", "label": f"W-{n}", "type": "number"} for n in range(8, 0, -1)],
]

def run(filters: dict) -> dict:
    rows = frappe.db.sql("""
        SELECT p.name AS project_id, p.title AS project_name,
               p.health_score AS w0,
               p.health_history_json
          FROM `tabVT Project` p
         WHERE p.status != 'Done'
    """, as_dict=True)
    out = []
    for r in rows:
        history = frappe.parse_json(r.health_history_json or "[]")
        weeks = history[-8:] if len(history) >= 8 else ([0] * (8 - len(history)) + history)
        row = {"project_id": r.project_id, "project_name": r.project_name}
        for i, score in enumerate(weeks):
            row[f"w{8 - i}"] = float(score or 0)
        row["trend"] = _trend_arrow(weeks)
        out.append(row)
    return {
        "viz": {"type": "heatmap", "x_keys": [f"w{n}" for n in range(8, 0, -1)]},
        "rows": out,
        "narrative": _narrative(out),
    }

def _trend_arrow(weeks: list[float]) -> str:
    if len(weeks) < 2: return "—"
    delta = (weeks[-1] or 0) - (weeks[0] or 0)
    if abs(delta) < 2: return "→"
    return "↑" if delta > 0 else "↓"

def _narrative(rows: list[dict]) -> list[str]:
    notes = []
    decliners = [r for r in rows if r["trend"] == "↓"]
    for r in decliners[:3]:
        delta = (r["w1"] or 0) - (r["w8"] or 0)
        notes.append(f"{r['project_name']} health changed {round(delta, 1)}pts over 8w")
    if not notes:
        notes.append("No declining projects in the last 8 weeks.")
    return notes
```

- [ ] **Step 3: okr_pacing.py**

```python
import frappe
SLUG = "okr-pacing"
TITLE = "OKR Progress vs Time-Elapsed"
AUDIENCE = ("Vernon Leader", "Vernon Exec")
COLUMNS = [
    {"key": "objective", "label": "Objective", "type": "string"},
    {"key": "kr",        "label": "Key Result", "type": "string"},
    {"key": "progress",  "label": "Progress %",  "type": "number"},
    {"key": "pace",      "label": "Pace %",       "type": "number"},
    {"key": "gap",       "label": "Gap (pp)",    "type": "number"},
]

def run(filters: dict) -> dict:
    rows = frappe.db.sql("""
        SELECT o.name AS objective_id, o.title AS objective,
               kr.name AS kr_id, kr.title AS kr,
               kr.target_value, kr.current_value,
               o.period_start, o.period_end
          FROM `tabVT Key Result` kr
          JOIN `tabVT Objective` o ON o.name = kr.objective
    """, as_dict=True)
    from datetime import date
    today = date.today()
    out = []
    for r in rows:
        progress = (float(r.current_value or 0) / float(r.target_value)) if r.target_value else 0
        if r.period_start and r.period_end and r.period_end != r.period_start:
            elapsed = (today - r.period_start).days / (r.period_end - r.period_start).days
            pace = max(0.0, min(1.0, elapsed))
        else:
            pace = 0.0
        gap = progress - pace
        out.append({
            "objective_id": r.objective_id, "objective": r.objective,
            "kr_id": r.kr_id, "kr": r.kr,
            "progress": round(progress * 100, 1),
            "pace":     round(pace * 100, 1),
            "gap":      round(gap * 100, 1),
        })
    out.sort(key=lambda x: x["gap"])
    return {
        "viz": {"type": "bar", "x": "kr", "y": "gap", "color_negative": True},
        "rows": out,
        "narrative": [
            f"{out[0]['kr']} is {abs(out[0]['gap']):.1f}pp behind pace"
            if out and out[0]["gap"] < 0 else "All KRs are on or ahead of pace.",
        ],
    }
```

- [ ] **Step 4: team_throughput.py, my_points.py, project_burndown_archive.py, risk_log.py**

Pattern is identical (each exports SLUG / TITLE / AUDIENCE / COLUMNS / `run(filters)`). Skeletons:

```python
# team_throughput.py
import frappe
SLUG = "team-throughput"; TITLE = "Team Throughput & Cycle Time"
AUDIENCE = ("Vernon Leader", "Vernon PM")
COLUMNS = [
    {"key": "week",         "label": "Week",         "type": "string"},
    {"key": "velocity",     "label": "Velocity (pt)","type": "number"},
    {"key": "cycle_hours",  "label": "Cycle (h)",    "type": "number"},
]
def run(filters: dict) -> dict:
    rows = frappe.db.sql("""
        SELECT DATE_FORMAT(t.completed_on, '%%x-W%%v') AS week,
               SUM(t.points) AS velocity,
               AVG(TIMESTAMPDIFF(HOUR, t.plan_started_on, t.completed_on)) AS cycle_hours
          FROM `tabVT Task` t
         WHERE t.status = 'DONE'
           AND t.completed_on >= DATE_SUB(CURDATE(), INTERVAL 12 WEEK)
         GROUP BY week
         ORDER BY week
    """, as_dict=True)
    out = [{"week": r.week, "velocity": int(r.velocity or 0), "cycle_hours": float(r.cycle_hours or 0)} for r in rows]
    return {
        "viz": {"type": "line", "x": "week", "series": ["velocity", "cycle_hours"]},
        "rows": out,
        "narrative": _summarise(out),
    }
def _summarise(rows):
    if not rows: return ["No completed tasks in last 12 weeks."]
    return [f"Latest velocity: {rows[-1]['velocity']}pt, cycle time {rows[-1]['cycle_hours']:.1f}h."]
```

```python
# my_points.py
import frappe
SLUG = "my-points"; TITLE = "My Points & Performance"
AUDIENCE = ()  # any logged-in user
COLUMNS = [
    {"key": "date",    "label": "Date",    "type": "date"},
    {"key": "points",  "label": "Points",  "type": "number"},
    {"key": "task",    "label": "Task",    "type": "string"},
]
def run(filters: dict) -> dict:
    user = frappe.session.user
    rows = frappe.db.sql("""
        SELECT logged_on AS date, points, task FROM `tabVT Task Point Log`
         WHERE recipient = %(u)s
         ORDER BY logged_on DESC LIMIT 200
    """, {"u": user}, as_dict=True)
    return {
        "viz": {"type": "line", "x": "date", "series": ["points"]},
        "rows": [{"date": str(r.date), "points": int(r.points or 0), "task": r.task} for r in rows],
        "narrative": [f"Total points (last 200 logs): {sum(int(r.points or 0) for r in rows)}"],
    }
```

```python
# project_burndown_archive.py
import frappe
SLUG = "project-burndown-archive"; TITLE = "Sprint Burndown Archive"
AUDIENCE = ("Vernon PM",)
COLUMNS = [
    {"key": "sprint",   "label": "Sprint",   "type": "string"},
    {"key": "project",  "label": "Project",  "type": "string"},
    {"key": "outcome",  "label": "Outcome",  "type": "string"},
    {"key": "velocity", "label": "Velocity", "type": "number"},
]
def run(filters: dict) -> dict:
    rows = frappe.db.sql("""
        SELECT s.name AS sprint, p.title AS project,
               s.outcome, s.actual_velocity AS velocity, s.burndown_actual_json
          FROM `tabVT Sprint` s JOIN `tabVT Project` p ON p.name = s.project
         WHERE s.status = 'Done' ORDER BY s.end_date DESC LIMIT 50
    """, as_dict=True)
    return {
        "viz": {"type": "small-multiples", "x": "sprint"},
        "rows": [{"sprint": r.sprint, "project": r.project, "outcome": r.outcome,
                  "velocity": int(r.velocity or 0)} for r in rows],
        "narrative": [f"{len(rows)} completed sprints in archive."],
    }
```

```python
# risk_log.py
import frappe
SLUG = "risk-log"; TITLE = "At-Risk Log (rolling 30d)"
AUDIENCE = ("Vernon Leader", "Vernon Exec")
COLUMNS = [
    {"key": "date",    "label": "Date",    "type": "datetime"},
    {"key": "project", "label": "Project", "type": "string"},
    {"key": "reason",  "label": "Reason",  "type": "string"},
    {"key": "severity","label": "Severity","type": "string"},
]
def run(filters: dict) -> dict:
    rows = frappe.db.sql("""
        SELECT r.detected_at AS date, p.title AS project,
               r.reason, r.severity
          FROM `tabVT Risk Event` r
          JOIN `tabVT Project` p ON p.name = r.project
         WHERE r.detected_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
         ORDER BY r.detected_at DESC
    """, as_dict=True)
    return {
        "viz": {"type": "table-only"},
        "rows": [{"date": str(r.date), "project": r.project, "reason": r.reason, "severity": r.severity} for r in rows],
        "narrative": [f"{len(rows)} risk events in the last 30 days."],
    }
```

- [ ] **Step 5: report_runner.py (dispatch)**

```python
import frappe
from vernon_tasks.task.services.reports import (
    project_health, okr_pacing, team_throughput,
    my_points, project_burndown_archive, risk_log,
)

MODULES = {m.SLUG: m for m in [
    project_health, okr_pacing, team_throughput,
    my_points, project_burndown_archive, risk_log,
]}


def list_for_role(roles: set[str]) -> list[dict]:
    out = []
    for m in MODULES.values():
        if not m.AUDIENCE or set(m.AUDIENCE) & roles:
            out.append({"slug": m.SLUG, "title": m.TITLE, "audience": list(m.AUDIENCE)})
    return out


def run(slug: str, filters: dict, user_roles: set[str]) -> dict:
    if slug not in MODULES:
        raise ValueError(f"Unknown slug: {slug}")
    m = MODULES[slug]
    if m.AUDIENCE and not (set(m.AUDIENCE) & user_roles):
        raise frappe.PermissionError(f"Role required for {slug}: {m.AUDIENCE}")
    payload = m.run(filters)
    payload["slug"] = slug
    payload["title"] = m.TITLE
    payload["columns"] = m.COLUMNS
    return payload
```

- [ ] **Step 6: test_report_runner.py**

```python
import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_tasks.task.services.report_runner import list_for_role, run, MODULES

class TestReportRunner(FrappeTestCase):
    def test_modules_loaded(self):
        for slug in {"project-health", "okr-pacing", "team-throughput",
                     "my-points", "project-burndown-archive", "risk-log"}:
            self.assertIn(slug, MODULES)

    def test_list_filters_by_role(self):
        ic = list_for_role({"Vernon IC"})
        leader = list_for_role({"Vernon Leader"})
        slugs_ic = {r["slug"] for r in ic}
        slugs_leader = {r["slug"] for r in leader}
        # my-points has no audience restriction → visible to IC
        self.assertIn("my-points", slugs_ic)
        # project-health requires Leader/Exec → not in IC
        self.assertNotIn("project-health", slugs_ic)
        self.assertIn("project-health", slugs_leader)

    def test_run_unknown_slug_raises(self):
        with self.assertRaises(ValueError):
            run("nope", {}, {"Vernon Leader"})

    def test_run_perm_denied(self):
        with self.assertRaises(frappe.PermissionError):
            run("project-health", {}, {"Vernon IC"})

    def test_run_my_points_for_logged_user(self):
        frappe.set_user("Administrator")
        out = run("my-points", {}, {"Vernon IC"})
        self.assertEqual(out["slug"], "my-points")
        self.assertIn("rows", out)
```

Run + PASS.

- [ ] **Step 7: Commit**

```bash
git add vernon_tasks/task/services/reports vernon_tasks/task/services/report_runner.py vernon_tasks/task/services/test_report_runner.py
git commit -m "feat(api): 6 report runner modules + dispatch service"
```

---

### Task 3: Backend — `portal_reports` whitelisted endpoints + export

**Files:**
- Create: `vernon_tasks/task/api/portal_reports.py`
- Create: `vernon_tasks/task/api/test_portal_reports.py`

- [ ] **Step 1: portal_reports.py**

```python
import csv
import io
import json
import frappe
from frappe.utils import now_datetime
from vernon_tasks.task.api.security import require_login, max_str, rate_limit
from vernon_tasks.task.services.report_runner import list_for_role, run, MODULES


@frappe.whitelist()
def list_reports() -> list[dict]:
    require_login()
    return list_for_role({r for r in frappe.get_roles()})


@frappe.whitelist()
def run_report(slug: str, filters: str = "{}") -> dict:
    require_login()
    slug = max_str(slug, 64)
    try:
        f = json.loads(filters or "{}")
    except json.JSONDecodeError:
        raise frappe.ValidationError("filters must be JSON")
    roles = set(frappe.get_roles())
    return run(slug, f, roles)


@frappe.whitelist()
def export(slug: str, filters: str = "{}", format: str = "csv"):
    require_login()
    rate_limit(f"report-export:{frappe.session.user}", max_calls=10, window_sec=60)
    slug = max_str(slug, 64)
    if format not in ("csv", "pdf"):
        raise frappe.ValidationError("format must be csv or pdf")
    payload = run_report(slug=slug, filters=filters)

    if format == "csv":
        return _csv_response(payload)
    return _pdf_response(payload)


def _csv_response(payload: dict):
    buf = io.StringIO()
    writer = csv.writer(buf)
    cols = [c["key"] for c in payload["columns"]]
    writer.writerow([c["label"] for c in payload["columns"]])
    for r in payload["rows"]:
        writer.writerow([r.get(k, "") for k in cols])
    frappe.local.response["type"] = "binary"
    frappe.local.response["filename"] = f"{payload['slug']}-{now_datetime().strftime('%Y%m%d-%H%M')}.csv"
    frappe.local.response["filecontent"] = buf.getvalue().encode("utf-8")


def _pdf_response(payload: dict):
    html = frappe.render_template(
        "templates/reports/generic_report.html", {"payload": payload},
    )
    from frappe.utils.pdf import get_pdf
    pdf_bytes = get_pdf(html)
    frappe.local.response["type"] = "binary"
    frappe.local.response["filename"] = f"{payload['slug']}-{now_datetime().strftime('%Y%m%d-%H%M')}.pdf"
    frappe.local.response["filecontent"] = pdf_bytes
```

Also create the generic Jinja template `vernon_tasks/templates/reports/generic_report.html`:

```html
<!doctype html><html><head><meta charset="utf-8" />
<title>{{ payload.title }}</title>
<style>
  body { font-family: sans-serif; padding: 24px; }
  h1 { font-size: 18px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #ccc; padding: 4px 8px; text-align: left; }
  th { background: #f3f4f6; }
</style></head><body>
  <h1>{{ payload.title }}</h1>
  <p>{{ frappe.utils.now() }}</p>
  <h2>Highlights</h2>
  <ul>{% for n in payload.narrative %}<li>{{ n }}</li>{% endfor %}</ul>
  <table>
    <thead><tr>{% for c in payload.columns %}<th>{{ c.label }}</th>{% endfor %}</tr></thead>
    <tbody>
      {% for row in payload.rows %}
        <tr>{% for c in payload.columns %}<td>{{ row.get(c.key, '') }}</td>{% endfor %}</tr>
      {% endfor %}
    </tbody>
  </table>
</body></html>
```

- [ ] **Step 2: test_portal_reports.py**

```python
import frappe
from frappe.tests.utils import FrappeTestCase

class TestPortalReportsApi(FrappeTestCase):
    def test_list_reports_returns_dicts(self):
        frappe.set_user("Administrator")
        out = frappe.get_attr("vernon_tasks.task.api.portal_reports.list_reports")()
        self.assertIsInstance(out, list)
        self.assertTrue(all("slug" in r for r in out))

    def test_run_report_my_points(self):
        frappe.set_user("Administrator")
        out = frappe.get_attr("vernon_tasks.task.api.portal_reports.run_report")(slug="my-points")
        self.assertEqual(out["slug"], "my-points")

    def test_export_bad_format(self):
        frappe.set_user("Administrator")
        with self.assertRaises(frappe.ValidationError):
            frappe.get_attr("vernon_tasks.task.api.portal_reports.export")(
                slug="my-points", format="xls",
            )
```

Run + PASS.

- [ ] **Step 3: Commit**

```bash
git add vernon_tasks/task/api/portal_reports.py vernon_tasks/task/api/test_portal_reports.py vernon_tasks/templates/reports/generic_report.html
git commit -m "feat(api): portal_reports.list/run/export + generic PDF template"
```

---

### Task 4: Frontend types + reportsApi

**Files:**
- Create: `www-react/src/features/reports/types.ts`
- Create: `www-react/src/features/reports/reportsApi.ts`

- [ ] **Step 1: types.ts**

```ts
export type ReportColumn = { key: string; label: string; type: 'string' | 'number' | 'date' | 'datetime' };

export type ReportListItem = {
  slug: string;
  title: string;
  audience: string[];
};

export type ReportPayload = {
  slug: string;
  title: string;
  columns: ReportColumn[];
  rows: Record<string, any>[];
  viz: Record<string, any>;
  narrative: string[];
};

export type ReportFilters = Record<string, any>;
```

- [ ] **Step 2: reportsApi.ts**

```ts
import { api } from '@/lib/api';
import type { ReportListItem, ReportPayload, ReportFilters } from './types';

const BASE = '/api/method/vernon_tasks.task.api.portal_reports';

export const REPORTS_KEY = {
  list: ['reports', 'list'] as const,
  run: (slug: string, filters: ReportFilters) => ['report', slug, filters] as const,
};

export async function listReports(): Promise<ReportListItem[]> {
  const res = await api.get<{ message: ReportListItem[] }>(`${BASE}.list_reports`);
  return res.data.message;
}

export async function runReport(slug: string, filters: ReportFilters): Promise<ReportPayload> {
  const res = await api.get<{ message: ReportPayload }>(`${BASE}.run_report`, {
    params: { slug, filters: JSON.stringify(filters) },
  });
  return res.data.message;
}

export async function exportReport(slug: string, filters: ReportFilters, format: 'csv' | 'pdf'): Promise<Blob> {
  const res = await api.get(`${BASE}.export`, {
    params: { slug, filters: JSON.stringify(filters), format },
    responseType: 'blob',
  });
  return res.data as Blob;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 3: Commit**

```bash
git add www-react/src/features/reports/types.ts www-react/src/features/reports/reportsApi.ts
git commit -m "feat(www-react): reports API client + types"
```

---

### Task 5: ReportHubPage

**Files:**
- Create: `www-react/src/features/reports/ReportHubPage.tsx`
- Create: `www-react/tests/unit/reports/ReportHubPage.test.tsx`
- Modify: `www-react/src/app/router.tsx`

- [ ] **Step 1: ReportHubPage.tsx**

```tsx
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { REPORTS_KEY, listReports } from './reportsApi';

export function ReportHubPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: REPORTS_KEY.list,
    queryFn: listReports,
  });
  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (isError || !data) return <p className="text-sm text-risk-red">Failed to load reports.</p>;

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Reports</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.map((r) => (
          <Link
            key={r.slug}
            to={`/portal/reports/${r.slug}`}
            className="block border border-slate-200 dark:border-slate-800 rounded p-4 hover:bg-slate-50 dark:hover:bg-slate-900"
          >
            <div className="font-medium">{r.title}</div>
            <div className="text-xs text-slate-500 mt-1">{r.audience.join(' · ') || 'All users'}</div>
            <div className="text-xs text-brand mt-2">Open →</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace router placeholder** with `<ReportHubPage />`.

- [ ] **Step 3: Test**

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MockAdapter from 'axios-mock-adapter';
import { api } from '@/lib/api';
import { ReportHubPage } from '@/features/reports/ReportHubPage';

describe('ReportHubPage', () => {
  it('renders cards from API', async () => {
    const mock = new MockAdapter(api);
    mock.onGet(/portal_reports\.list_reports/).reply(200, {
      message: [{ slug: 'my-points', title: 'My Points & Performance', audience: [] }],
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter><ReportHubPage /></MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/My Points & Performance/)).toBeInTheDocument();
  });
});
```

Run + PASS.

- [ ] **Step 4: Commit**

```bash
git add www-react/src/features/reports/ReportHubPage.tsx www-react/src/app/router.tsx www-react/tests/unit/reports/ReportHubPage.test.tsx
git commit -m "feat(www-react): Reports hub page with role-filtered cards"
```

---

### Task 6: ReportShell + ExportToolbar + NarrativePanel + ReportDetailPage

**Files:**
- Create: `www-react/src/features/reports/ReportShell.tsx`
- Create: `www-react/src/features/reports/FilterPanel.tsx`
- Create: `www-react/src/features/reports/NarrativePanel.tsx`
- Create: `www-react/src/features/reports/ExportToolbar.tsx`
- Create: `www-react/src/features/reports/ReportDetailPage.tsx`
- Modify: `www-react/src/app/router.tsx`

- [ ] **Step 1: FilterPanel.tsx (date range only — slug specs can override)**

```tsx
import { useState } from 'react';
import { format, subDays } from 'date-fns';
import type { ReportFilters } from './types';

export function FilterPanel({ value, onChange }: { value: ReportFilters; onChange: (f: ReportFilters) => void }) {
  const [from, setFrom] = useState<string>(value.from ?? format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [to, setTo] = useState<string>(value.to ?? format(new Date(), 'yyyy-MM-dd'));
  function apply() { onChange({ ...value, from, to }); }
  return (
    <div className="flex items-end gap-3 mb-4">
      <div>
        <label htmlFor="from" className="block text-xs text-slate-500">From</label>
        <input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)}
          className="text-sm border border-slate-300 dark:border-slate-700 rounded px-2 py-1 bg-transparent" />
      </div>
      <div>
        <label htmlFor="to" className="block text-xs text-slate-500">To</label>
        <input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)}
          className="text-sm border border-slate-300 dark:border-slate-700 rounded px-2 py-1 bg-transparent" />
      </div>
      <button onClick={apply} className="text-xs bg-brand text-white px-3 py-1.5 rounded">Apply</button>
    </div>
  );
}
```

- [ ] **Step 2: NarrativePanel.tsx**

```tsx
export function NarrativePanel({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <aside className="lg:w-64 border border-slate-200 dark:border-slate-800 rounded p-4">
      <h2 className="text-xs uppercase tracking-wider text-slate-500 mb-2">Highlights</h2>
      <ul className="space-y-2 text-sm">
        {items.map((it, i) => <li key={i}>• {it}</li>)}
      </ul>
    </aside>
  );
}
```

- [ ] **Step 3: ExportToolbar.tsx**

```tsx
import { useState } from 'react';
import { downloadBlob, exportReport } from './reportsApi';
import type { ReportFilters } from './types';

export function ExportToolbar({
  slug, filters, onSchedule, onRefresh,
}: {
  slug: string;
  filters: ReportFilters;
  onSchedule: () => void;
  onRefresh: () => void;
}) {
  const [busy, setBusy] = useState<null | 'csv' | 'pdf'>(null);
  async function exportAs(format: 'csv' | 'pdf') {
    setBusy(format);
    try {
      const blob = await exportReport(slug, filters, format);
      downloadBlob(blob, `${slug}.${format}`);
    } finally { setBusy(null); }
  }
  return (
    <div className="flex items-center gap-2 mb-4">
      <button onClick={onRefresh} className="text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-700">Refresh</button>
      <button onClick={() => exportAs('csv')} disabled={busy === 'csv'} className="text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-700">
        {busy === 'csv' ? 'Exporting…' : 'CSV'}
      </button>
      <button onClick={() => exportAs('pdf')} disabled={busy === 'pdf'} className="text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-700">
        {busy === 'pdf' ? 'Exporting…' : 'PDF'}
      </button>
      <button onClick={onSchedule} className="text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-700">Schedule</button>
    </div>
  );
}
```

- [ ] **Step 4: ReportShell.tsx**

```tsx
import { ReactNode } from 'react';
import { FilterPanel } from './FilterPanel';
import { ExportToolbar } from './ExportToolbar';
import { NarrativePanel } from './NarrativePanel';
import type { ReportFilters, ReportPayload } from './types';

export function ReportShell({
  payload, filters, onFiltersChange, onSchedule, onRefresh, vizSlot,
}: {
  payload: ReportPayload;
  filters: ReportFilters;
  onFiltersChange: (f: ReportFilters) => void;
  onSchedule: () => void;
  onRefresh: () => void;
  vizSlot: ReactNode;
}) {
  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">{payload.title}</h1>
      <FilterPanel value={filters} onChange={onFiltersChange} />
      <ExportToolbar slug={payload.slug} filters={filters} onSchedule={onSchedule} onRefresh={onRefresh} />
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1">
          {vizSlot}
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  {payload.columns.map((c) => <th key={c.key} className="py-2">{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {payload.rows.map((row, i) => (
                  <tr key={i} className="border-b border-slate-100 dark:border-slate-900">
                    {payload.columns.map((c) => <td key={c.key}>{String(row[c.key] ?? '')}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <NarrativePanel items={payload.narrative} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: ReportDetailPage.tsx (dispatches viz by slug)**

```tsx
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { REPORTS_KEY, runReport } from './reportsApi';
import { ReportShell } from './ReportShell';
import { ProjectHealthHeatmap } from './slugs/ProjectHealthHeatmap';
import { OkrPacingChart } from './slugs/OkrPacingChart';
import { TeamThroughputChart } from './slugs/TeamThroughputChart';
import { MyPointsTimeline } from './slugs/MyPointsTimeline';
import { BurndownArchiveList } from './slugs/BurndownArchiveList';
import { RiskLogTable } from './slugs/RiskLogTable';
import { ScheduleModal } from './ScheduleModal';
import type { ReportFilters, ReportPayload } from './types';

const VIZ: Record<string, (p: ReportPayload) => JSX.Element> = {
  'project-health':           (p) => <ProjectHealthHeatmap payload={p} />,
  'okr-pacing':               (p) => <OkrPacingChart payload={p} />,
  'team-throughput':          (p) => <TeamThroughputChart payload={p} />,
  'my-points':                (p) => <MyPointsTimeline payload={p} />,
  'project-burndown-archive': (p) => <BurndownArchiveList payload={p} />,
  'risk-log':                 (p) => <RiskLogTable payload={p} />,
};

export function ReportDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [filters, setFilters] = useState<ReportFilters>({});
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: slug ? REPORTS_KEY.run(slug, filters) : ['noop'],
    queryFn: () => runReport(slug!, filters),
    enabled: !!slug,
  });

  if (!slug) return <p className="text-sm text-risk-red">Missing slug.</p>;
  if (isLoading) return <p className="text-sm text-slate-500">Running report…</p>;
  if (isError || !data) return <p className="text-sm text-risk-red">Failed to run report.</p>;
  const vizFactory = VIZ[slug] ?? (() => <p className="text-sm text-slate-500">No visualization for {slug}.</p>);

  return (
    <>
      <ReportShell
        payload={data}
        filters={filters}
        onFiltersChange={setFilters}
        onSchedule={() => setScheduleOpen(true)}
        onRefresh={() => qc.invalidateQueries({ queryKey: REPORTS_KEY.run(slug, filters) })}
        vizSlot={vizFactory(data)}
      />
      <ScheduleModal open={scheduleOpen} onClose={() => setScheduleOpen(false)} slug={slug} title={data.title} filters={filters} />
    </>
  );
}
```

- [ ] **Step 6: Add detail route to router.tsx**

```tsx
{ path: 'reports', element: <ReportHubPage /> },
{ path: 'reports/:slug', element: <ReportDetailPage /> },
```

- [ ] **Step 7: Commit**

```bash
git add www-react/src/features/reports/ReportShell.tsx www-react/src/features/reports/FilterPanel.tsx www-react/src/features/reports/NarrativePanel.tsx www-react/src/features/reports/ExportToolbar.tsx www-react/src/features/reports/ReportDetailPage.tsx www-react/src/app/router.tsx
git commit -m "feat(www-react): generic report shell + detail page dispatcher"
```

---

### Task 7: Per-slug viz components

**Files:**
- Create: `www-react/src/features/reports/slugs/ProjectHealthHeatmap.tsx`
- Create: `www-react/src/features/reports/slugs/OkrPacingChart.tsx`
- Create: `www-react/src/features/reports/slugs/TeamThroughputChart.tsx`
- Create: `www-react/src/features/reports/slugs/MyPointsTimeline.tsx`
- Create: `www-react/src/features/reports/slugs/BurndownArchiveList.tsx`
- Create: `www-react/src/features/reports/slugs/RiskLogTable.tsx`

- [ ] **Step 1: ProjectHealthHeatmap.tsx**

```tsx
import type { ReportPayload } from '../types';
import clsx from 'clsx';

function bucket(v: number) {
  if (v >= 75) return 'bg-risk-green';
  if (v >= 50) return 'bg-risk-amber';
  return 'bg-risk-red';
}

export function ProjectHealthHeatmap({ payload }: { payload: ReportPayload }) {
  const weekKeys = payload.viz.x_keys as string[];
  return (
    <div className="overflow-x-auto">
      <table className="text-xs">
        <thead><tr><th className="text-left p-1">Project</th>{weekKeys.map((k) => <th key={k} className="p-1">{k}</th>)}</tr></thead>
        <tbody>
          {payload.rows.map((row) => (
            <tr key={row.project_id as string}>
              <td className="p-1">{row.project_name}</td>
              {weekKeys.map((k) => {
                const v = Number(row[k] ?? 0);
                return (
                  <td key={k} className="p-1">
                    <div className={clsx('w-8 h-6 rounded text-white text-[10px] flex items-center justify-center', bucket(v))}>
                      {Math.round(v)}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: OkrPacingChart.tsx**

```tsx
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { ReportPayload } from '../types';

export function OkrPacingChart({ payload }: { payload: ReportPayload }) {
  return (
    <div className="h-72">
      <ResponsiveContainer>
        <BarChart data={payload.rows}>
          <XAxis dataKey="kr" fontSize={10} interval={0} angle={-30} textAnchor="end" height={70} />
          <YAxis fontSize={10} />
          <Tooltip />
          <Bar dataKey="gap">
            {payload.rows.map((r, i) => (
              <Cell key={i} fill={Number(r.gap) >= 0 ? '#10b981' : '#ef4444'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 3: TeamThroughputChart.tsx**

```tsx
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { ReportPayload } from '../types';

export function TeamThroughputChart({ payload }: { payload: ReportPayload }) {
  return (
    <div className="h-72">
      <ResponsiveContainer>
        <LineChart data={payload.rows}>
          <XAxis dataKey="week" fontSize={10} />
          <YAxis fontSize={10} />
          <Tooltip />
          <Legend />
          <Line dataKey="velocity"    stroke="#6836a0" strokeWidth={2} />
          <Line dataKey="cycle_hours" stroke="#0ea5e9" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 4: MyPointsTimeline.tsx**

```tsx
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { ReportPayload } from '../types';

export function MyPointsTimeline({ payload }: { payload: ReportPayload }) {
  const data = [...payload.rows].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return (
    <div className="h-72">
      <ResponsiveContainer>
        <LineChart data={data}>
          <XAxis dataKey="date" fontSize={10} />
          <YAxis fontSize={10} />
          <Tooltip />
          <Line dataKey="points" stroke="#6836a0" strokeWidth={2} dot />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 5: BurndownArchiveList.tsx**

```tsx
import type { ReportPayload } from '../types';

export function BurndownArchiveList({ payload }: { payload: ReportPayload }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
      {payload.rows.map((r, i) => (
        <div key={i} className="border border-slate-200 dark:border-slate-800 rounded p-3 text-xs">
          <div className="font-medium">{r.sprint}</div>
          <div className="text-slate-500">{r.project}</div>
          <div className="mt-2">Velocity: <strong>{r.velocity}</strong></div>
          <div className="text-[11px] mt-1">{r.outcome}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: RiskLogTable.tsx**

```tsx
import type { ReportPayload } from '../types';

export function RiskLogTable({ payload }: { payload: ReportPayload }) {
  // Just renders viz-area summary; table is rendered by ReportShell itself.
  return (
    <div className="text-xs text-slate-500 mb-2">
      {payload.rows.length} risk events in the last 30 days.
    </div>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add www-react/src/features/reports/slugs
git commit -m "feat(www-react): per-slug viz components for 6 reports"
```

---

### Task 8: ScheduleModal — create VT Report Subscription

**Files:**
- Create: `www-react/src/features/reports/ScheduleModal.tsx`

- [ ] **Step 1: Add backend create endpoint to portal_reports.py**

```python
@frappe.whitelist()
def create_subscription(slug: str, title: str, cron: str, format: str, filters: str, recipients: list[str]) -> dict:
    require_login()
    if not (frappe.has_role("Vernon Leader") or frappe.has_role("System Manager")):
        raise frappe.PermissionError
    doc = frappe.get_doc({
        "doctype": "VT Report Subscription",
        "slug": slug, "title": title, "cron": cron, "format": format,
        "filters_json": filters, "enabled": 1,
        "recipients": [{"user": u} for u in recipients],
    }).insert()
    return {"name": doc.name}
```

- [ ] **Step 2: ScheduleModal.tsx**

```tsx
import { useState } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import type { ReportFilters } from './types';

export function ScheduleModal({
  open, onClose, slug, title, filters,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  title: string;
  filters: ReportFilters;
}) {
  const [cron, setCron] = useState('0 8 * * 1');
  const [format, setFormat] = useState<'csv' | 'pdf'>('csv');
  const [recipients, setRecipients] = useState<string>('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const users = recipients.split(',').map((s) => s.trim()).filter(Boolean);
      if (users.length === 0) { toast.error('Add at least one recipient email'); return; }
      await api.post(
        '/api/method/vernon_tasks.task.api.portal_reports.create_subscription',
        { slug, title, cron, format, filters: JSON.stringify(filters), recipients: users },
      );
      toast.success('Schedule created');
      onClose();
    } catch (e) {
      toast.error('Failed to create schedule');
    } finally { setBusy(false); }
  }

  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
      <div className="bg-white dark:bg-slate-900 p-6 rounded-lg w-[420px] space-y-3">
        <h2 className="font-semibold">Schedule report</h2>
        <div>
          <label className="block text-xs text-slate-500">Cron (UTC)</label>
          <input value={cron} onChange={(e) => setCron(e.target.value)}
            className="w-full text-sm border border-slate-300 dark:border-slate-700 rounded px-2 py-1 bg-transparent" />
          <p className="text-[11px] text-slate-500 mt-1">Default: Mondays 08:00</p>
        </div>
        <div>
          <label className="block text-xs text-slate-500">Format</label>
          <select value={format} onChange={(e) => setFormat(e.target.value as 'csv' | 'pdf')}
            className="w-full text-sm border border-slate-300 dark:border-slate-700 rounded px-2 py-1 bg-transparent">
            <option value="csv">CSV</option>
            <option value="pdf">PDF</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500">Recipients (comma-separated emails)</label>
          <input value={recipients} onChange={(e) => setRecipients(e.target.value)}
            placeholder="ada@vernon.id, leo@vernon.id"
            className="w-full text-sm border border-slate-300 dark:border-slate-700 rounded px-2 py-1 bg-transparent" />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-sm">Cancel</button>
          <button onClick={submit} disabled={busy}
            className="text-sm bg-brand text-white px-3 py-1.5 rounded disabled:opacity-60">
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add www-react/src/features/reports/ScheduleModal.tsx vernon_tasks/task/api/portal_reports.py
git commit -m "feat: ScheduleModal + create_subscription endpoint"
```

---

### Task 9: Scheduler hook — execute due subscriptions

**Files:**
- Modify: `vernon_tasks/hooks.py` (add scheduler entry)
- Create: `vernon_tasks/task/services/report_subscription_runner.py`
- Create: `vernon_tasks/task/services/test_report_subscription_runner.py`

- [ ] **Step 1: report_subscription_runner.py**

```python
"""Runs scheduled VT Report Subscriptions. Called by Frappe scheduler hourly."""
import frappe
from frappe.utils import now_datetime, format_datetime
from croniter import croniter
import json

from vernon_tasks.task.services.report_runner import run as run_report
from vernon_tasks.task.api.portal_reports import _csv_response, _pdf_response  # private import: acceptable


def run_due_subscriptions() -> int:
    subs = frappe.get_all(
        "VT Report Subscription",
        filters={"enabled": 1},
        fields=["name", "slug", "title", "cron", "format", "filters_json", "last_run_at", "owner"],
    )
    now = now_datetime()
    executed = 0
    for s in subs:
        if not _is_due(s.cron, s.last_run_at, now):
            continue
        try:
            roles = set(frappe.get_roles(s.owner))
            payload = run_report(s.slug, json.loads(s.filters_json or "{}"), roles)
            _send_email(s, payload)
            frappe.db.set_value("VT Report Subscription", s.name, {
                "last_run_at": now, "last_status": "ok",
            })
            executed += 1
        except Exception as e:
            frappe.db.set_value("VT Report Subscription", s.name, {
                "last_run_at": now, "last_status": f"error: {str(e)[:140]}",
            })
            frappe.log_error(message=str(e), title=f"Report sub {s.name} failed")
    return executed


def _is_due(cron: str, last_run_at, now) -> bool:
    base = last_run_at or now.replace(year=2000)
    return croniter(cron, base).get_next(type(now)) <= now


def _send_email(sub, payload: dict) -> None:
    recipients = frappe.get_all(
        "VT Report Subscription Recipient",
        filters={"parent": sub.name}, fields=["user"], pluck="user",
    )
    if not recipients: return
    rows_preview = payload["rows"][:10]
    body_lines = [f"<h3>{payload['title']}</h3>"]
    for n in payload["narrative"]:
        body_lines.append(f"<li>{frappe.utils.escape_html(n)}</li>")
    body_lines.append("<hr/><p>Rows preview ({} total):</p>".format(len(payload["rows"])))
    body_lines.append("<table border=1 cellpadding=4 cellspacing=0><tr>")
    body_lines += [f"<th>{c['label']}</th>" for c in payload["columns"]]
    body_lines.append("</tr>")
    for r in rows_preview:
        body_lines.append("<tr>" + "".join(f"<td>{frappe.utils.escape_html(str(r.get(c['key'], '')))}</td>" for c in payload["columns"]) + "</tr>")
    body_lines.append("</table>")

    # Attachment generation
    import io, csv
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([c["label"] for c in payload["columns"]])
    for r in payload["rows"]:
        w.writerow([r.get(c["key"], "") for c in payload["columns"]])

    frappe.sendmail(
        recipients=recipients,
        subject=f"[Vernon] {payload['title']} — {format_datetime(now_datetime(), 'yyyy-MM-dd')}",
        message="\n".join(body_lines),
        attachments=[{"fname": f"{payload['slug']}.csv", "fcontent": buf.getvalue().encode("utf-8")}],
        delayed=False,
    )
```

- [ ] **Step 2: Register scheduler in hooks.py**

Add to `scheduler_events`:
```python
"hourly": [
    "vernon_tasks.task.services.report_subscription_runner.run_due_subscriptions",
],
```

- [ ] **Step 3: Test**

```python
import frappe, json
from frappe.tests.utils import FrappeTestCase
from vernon_tasks.task.services.report_subscription_runner import _is_due

class TestReportSubscriptionRunner(FrappeTestCase):
    def test_is_due_runs_when_cron_elapsed(self):
        from datetime import datetime, timedelta
        now = datetime.now()
        last = now - timedelta(hours=2)
        self.assertTrue(_is_due("0 * * * *", last, now))

    def test_not_due_when_last_run_recent(self):
        from datetime import datetime, timedelta
        now = datetime.now()
        last = now - timedelta(minutes=1)
        self.assertFalse(_is_due("0 0 * * 0", last, now))
```

(Note: `croniter` must be added to `requirements.txt`.)

- [ ] **Step 4: Add croniter to setup**

Edit `setup.py` / `pyproject.toml` `install_requires` to include `croniter>=2.0`.

Run + PASS.

- [ ] **Step 5: Commit**

```bash
git add vernon_tasks/task/services/report_subscription_runner.py vernon_tasks/task/services/test_report_subscription_runner.py vernon_tasks/hooks.py setup.py pyproject.toml
git commit -m "feat(scheduler): hourly run_due_subscriptions for VT Report Subscription"
```

---

### Task 10: e2e — reports hub + run + export

**Files:**
- Create: `www-react/tests/e2e/reports.spec.ts`

- [ ] **Step 1: reports.spec.ts**

```ts
import { test, expect } from '@playwright/test';

test('reports hub → run → CSV export', async ({ page, context }) => {
  await context.route('**/api/method/login', (r) => r.fulfill({ status: 200, body: '{"message":"ok"}' }));
  await context.route('**/api/method/frappe.auth.get_logged_user', (r) => r.fulfill({ status: 200, body: '{"message":"u"}' }));
  await context.route('**/api/resource/User/**', (r) => r.fulfill({ status: 200, body: '{"data":{"name":"u","full_name":"U","roles":[]}}' }));
  await context.route('**/portal_reports.list_reports**', (r) => r.fulfill({
    status: 200,
    body: JSON.stringify({ message: [{ slug: 'my-points', title: 'My Points', audience: [] }] }),
  }));
  await context.route('**/portal_reports.run_report**', (r) => r.fulfill({
    status: 200,
    body: JSON.stringify({
      message: {
        slug: 'my-points', title: 'My Points',
        columns: [{ key: 'date', label: 'Date', type: 'date' }, { key: 'points', label: 'Points', type: 'number' }],
        rows: [{ date: '2026-05-22', points: 5 }],
        viz: { type: 'line' }, narrative: ['Total 5 points'],
      },
    }),
  }));
  let exportCalled = false;
  await context.route('**/portal_reports.export**', (r) => {
    exportCalled = true;
    return r.fulfill({ status: 200, contentType: 'text/csv', body: 'Date,Points\n2026-05-22,5\n' });
  });

  await page.goto('/login');
  await page.getByLabel(/email/i).fill('u@v.id');
  await page.getByLabel(/password/i).fill('x');
  await page.getByRole('button', { name: /sign in/i }).click();

  await page.goto('/portal/reports');
  await page.getByRole('link', { name: /my points/i }).click();
  await expect(page.getByText(/Total 5 points/i)).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /^csv$/i }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/my-points\.csv/);
  expect(exportCalled).toBe(true);
});
```

- [ ] **Step 2: Run e2e**

Run: `npm run e2e -- reports`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add www-react/tests/e2e/reports.spec.ts
git commit -m "test(www-react): e2e reports hub → run → CSV export"
```

---

## Definition of Done — Reports

- All 6 reports return shape `{slug, title, columns, rows, viz, narrative}` and pass per-slug backend tests
- `portal_reports.list/run/export` respect roles and rate limits
- Hub page renders role-filtered cards; detail page dispatches viz; CSV and PDF exports download
- Schedule modal creates `VT Report Subscription` with recipients
- `run_due_subscriptions` cron entry installed, executes, and emails CSV attachment
- E2E green
- No console errors in build

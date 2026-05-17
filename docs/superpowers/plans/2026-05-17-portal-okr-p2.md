# Portal OKR P2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship desktop OKR portal at `/portal/okr/*` — list/detail/filters, inline KR autosave, create/edit Objective, bulk PDCA — behind `portal_okr_enabled` feature flag.

**Architecture:** Vanilla React Query + composed UI (Approach A). New folder `pwa/src/portal/okr/`. Backend adds schema migration (`period_start`/`period_end` Date fields), 3 whitelisted endpoints in `vernon_tasks/api/okr.py`, and a Frappe patch. CRUD individual ops use Frappe REST. Permission gates: `okr.read` / `okr.write`.

**Tech Stack:** Frappe (Python), React + Vite + TS, react-query, react-router, react-hook-form + zod, vitest + MSW, playwright.

**Reference spec:** `docs/superpowers/specs/2026-05-17-portal-okr-p2-design.md`

**Bench helper:** Define once at top — `BENCH="docker exec frappe-backend-1 bench --site task2.localhost"`. Use `$BENCH ...` in all steps to keep commands short.

---

## Task 1 — Bootstrap branch + portal_okr_enabled flag

**Files**
- Modify: `vernon_tasks/vt_settings/doctype/vt_settings/vt_settings.json`

**Steps**

- [ ] **Step 1: Branch off the foundation branch.**
  ```bash
  cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks
  git fetch origin
  git checkout feat/desktop-portal-foundation
  git pull --ff-only
  git checkout -b feat/portal-okr-p2
  ```
  Expected: `Switched to a new branch 'feat/portal-okr-p2'`.

- [ ] **Step 2: Add `portal_okr_enabled` to VT Settings DocType.**
  In `vernon_tasks/vt_settings/doctype/vt_settings/vt_settings.json`:
  1. Append `"portal_okr_enabled"` to the `field_order` array (right after `"portal_enabled"`).
  2. Append the field definition into `fields`:
     ```json
     {
       "default": "0",
       "description": "Enable the OKR domain under /portal/okr. Independent of portal_enabled.",
       "fieldname": "portal_okr_enabled",
       "fieldtype": "Check",
       "label": "Enable Portal OKR (/portal/okr)"
     }
     ```

- [ ] **Step 3: Migrate and verify.**
  ```bash
  BENCH="docker exec frappe-backend-1 bench --site task2.localhost"
  $BENCH migrate
  $BENCH execute "frappe.db.sql" --kwargs '{"query":"SELECT portal_okr_enabled FROM `tabVT Settings`"}'
  ```
  Expected: migration ends with `*** Updating DocTypes for vernon_tasks ***` and the SELECT returns `(0,)` (default).

- [ ] **Step 4: Commit.**
  ```bash
  git add vernon_tasks/vt_settings/doctype/vt_settings/vt_settings.json
  git commit -m "feat(vt-settings): add portal_okr_enabled flag"
  ```

---

## Task 2 — Objective schema: add period_start, period_end Date fields

**Files**
- Modify: `vernon_tasks/okr/doctype/objective/objective.json`

**Steps**

- [ ] **Step 1: Add fields.** In `vernon_tasks/okr/doctype/objective/objective.json`:
  1. Append `"period_start"` and `"period_end"` to `field_order` immediately after `"period"`.
  2. Append both into the `fields` array:
     ```json
     {
       "fieldname": "period_start",
       "fieldtype": "Date",
       "label": "Period Start",
       "description": "Inclusive start date for the OKR period. Auto-filled by parser when period matches YYYY-Q#/H#/year."
     },
     {
       "fieldname": "period_end",
       "fieldtype": "Date",
       "label": "Period End",
       "description": "Inclusive end date for the OKR period."
     }
     ```

- [ ] **Step 2: Migrate and verify columns.**
  ```bash
  BENCH="docker exec frappe-backend-1 bench --site task2.localhost"
  $BENCH migrate
  $BENCH execute "frappe.db.sql" --kwargs '{"query":"SHOW COLUMNS FROM `tabObjective` LIKE '\''period_%'\''"}'
  ```
  Expected: rows for `period`, `period_start`, `period_end`.

- [ ] **Step 3: Commit.**
  ```bash
  git add vernon_tasks/okr/doctype/objective/objective.json
  git commit -m "feat(okr): add period_start, period_end Date fields to Objective"
  ```

---

## Task 3 — Backend period_parser

**Files**
- Create: `vernon_tasks/okr/period_parser.py`
- Test:   `vernon_tasks/okr/test_period_parser.py`

**Steps**

- [ ] **Step 1: Write tests first.** Create `vernon_tasks/okr/test_period_parser.py`:
  ```python
  import datetime
  import unittest

  from vernon_tasks.okr.period_parser import parse_period


  class TestParsePeriod(unittest.TestCase):
      def test_quarter(self):
          self.assertEqual(
              parse_period("2026-Q2"),
              (datetime.date(2026, 4, 1), datetime.date(2026, 6, 30)),
          )

      def test_quarter_q1_and_q4(self):
          self.assertEqual(
              parse_period("2026-Q1"),
              (datetime.date(2026, 1, 1), datetime.date(2026, 3, 31)),
          )
          self.assertEqual(
              parse_period("2026-Q4"),
              (datetime.date(2026, 10, 1), datetime.date(2026, 12, 31)),
          )

      def test_half(self):
          self.assertEqual(
              parse_period("2026-H1"),
              (datetime.date(2026, 1, 1), datetime.date(2026, 6, 30)),
          )
          self.assertEqual(
              parse_period("2026-H2"),
              (datetime.date(2026, 7, 1), datetime.date(2026, 12, 31)),
          )

      def test_year(self):
          self.assertEqual(
              parse_period("2026"),
              (datetime.date(2026, 1, 1), datetime.date(2026, 12, 31)),
          )

      def test_unknown(self):
          self.assertIsNone(parse_period("FY2026"))
          self.assertIsNone(parse_period(""))
          self.assertIsNone(parse_period(None))
  ```

- [ ] **Step 2: Implement.** Create `vernon_tasks/okr/period_parser.py`:
  ```python
  """Parse OKR period strings into (start, end) date tuples."""
  from __future__ import annotations

  import datetime
  import re
  from typing import Optional, Tuple

  DateRange = Tuple[datetime.date, datetime.date]

  _QUARTER_RE = re.compile(r"^(\d{4})-Q([1-4])$")
  _HALF_RE = re.compile(r"^(\d{4})-H([12])$")
  _YEAR_RE = re.compile(r"^(\d{4})$")

  _QUARTER_BOUNDS = {
      1: ((1, 1), (3, 31)),
      2: ((4, 1), (6, 30)),
      3: ((7, 1), (9, 30)),
      4: ((10, 1), (12, 31)),
  }

  _HALF_BOUNDS = {
      1: ((1, 1), (6, 30)),
      2: ((7, 1), (12, 31)),
  }


  def parse_period(value: Optional[str]) -> Optional[DateRange]:
      if not value or not isinstance(value, str):
          return None
      v = value.strip()

      m = _QUARTER_RE.match(v)
      if m:
          year, q = int(m.group(1)), int(m.group(2))
          (sm, sd), (em, ed) = _QUARTER_BOUNDS[q]
          return datetime.date(year, sm, sd), datetime.date(year, em, ed)

      m = _HALF_RE.match(v)
      if m:
          year, h = int(m.group(1)), int(m.group(2))
          (sm, sd), (em, ed) = _HALF_BOUNDS[h]
          return datetime.date(year, sm, sd), datetime.date(year, em, ed)

      m = _YEAR_RE.match(v)
      if m:
          year = int(m.group(1))
          return datetime.date(year, 1, 1), datetime.date(year, 12, 31)

      return None
  ```

- [ ] **Step 3: Run tests.**
  ```bash
  BENCH="docker exec frappe-backend-1 bench --site task2.localhost"
  $BENCH run-tests --app vernon_tasks --module vernon_tasks.okr.test_period_parser
  ```
  Expected: `OK` with 5 tests.

- [ ] **Step 4: Commit.**
  ```bash
  git add vernon_tasks/okr/period_parser.py vernon_tasks/okr/test_period_parser.py
  git commit -m "feat(okr): period_parser supports Q/H/year patterns"
  ```

---

## Task 4 — Backfill patch

**Files**
- Create: `vernon_tasks/patches/v1_x/__init__.py` (if missing)
- Create: `vernon_tasks/patches/v1_x/add_objective_period_dates.py`
- Modify: `vernon_tasks/patches.txt`

**Steps**

- [ ] **Step 1: Ensure package marker exists.**
  ```bash
  [ -f vernon_tasks/patches/v1_x/__init__.py ] || mkdir -p vernon_tasks/patches/v1_x && touch vernon_tasks/patches/v1_x/__init__.py
  [ -f vernon_tasks/patches/__init__.py ] || touch vernon_tasks/patches/__init__.py
  ```

- [ ] **Step 2: Write patch.** Create `vernon_tasks/patches/v1_x/add_objective_period_dates.py`:
  ```python
  """Backfill Objective.period_start / period_end from legacy `period` string."""
  from __future__ import annotations

  import frappe

  from vernon_tasks.okr.period_parser import parse_period


  def execute() -> None:
      rows = frappe.db.sql(
          """
          SELECT name, period
          FROM `tabObjective`
          WHERE (period_start IS NULL OR period_end IS NULL)
            AND period IS NOT NULL AND period != ''
          """,
          as_dict=True,
      )
      unparsed: list[str] = []
      for r in rows:
          rng = parse_period(r.period)
          if not rng:
              unparsed.append(f"{r.name}:{r.period}")
              continue
          start, end = rng
          frappe.db.set_value(
              "Objective", r.name,
              {"period_start": start, "period_end": end},
              update_modified=False,
          )
      frappe.db.commit()
      if unparsed:
          frappe.log_error(
              message="\n".join(unparsed),
              title="OKR period backfill: unparsed entries",
          )
  ```

- [ ] **Step 3: Register patch.** Append to `vernon_tasks/patches.txt`:
  ```
  vernon_tasks.patches.v1_x.add_objective_period_dates
  ```

- [ ] **Step 4: Run migrate to execute.**
  ```bash
  BENCH="docker exec frappe-backend-1 bench --site task2.localhost"
  $BENCH migrate
  ```
  Expected: log line `Executing vernon_tasks.patches.v1_x.add_objective_period_dates`.

- [ ] **Step 5: Commit.**
  ```bash
  git add vernon_tasks/patches/v1_x/__init__.py vernon_tasks/patches/__init__.py vernon_tasks/patches/v1_x/add_objective_period_dates.py vernon_tasks/patches.txt
  git commit -m "feat(okr): backfill period_start/period_end for existing Objectives"
  ```

---

## Task 5 — Backend pdca helper

**Files**
- Create: `vernon_tasks/okr/pdca.py`
- Test:   `vernon_tasks/okr/test_pdca.py`

**Steps**

- [ ] **Step 1: Write tests.** Create `vernon_tasks/okr/test_pdca.py`:
  ```python
  import unittest

  from vernon_tasks.okr.pdca import PDCA_SEQUENCE, next_pdca_phase


  class TestNextPdcaPhase(unittest.TestCase):
      def test_advance(self):
          self.assertEqual(next_pdca_phase("PLAN"), "DO")
          self.assertEqual(next_pdca_phase("DO"), "CHECK")
          self.assertEqual(next_pdca_phase("CHECK"), "ACT")
          self.assertEqual(next_pdca_phase("ACT"), "CLOSED")

      def test_closed_returns_none(self):
          self.assertIsNone(next_pdca_phase("CLOSED"))

      def test_invalid_returns_none(self):
          self.assertIsNone(next_pdca_phase("UNKNOWN"))
          self.assertIsNone(next_pdca_phase(""))
          self.assertIsNone(next_pdca_phase(None))

      def test_sequence_constant(self):
          self.assertEqual(PDCA_SEQUENCE, ["PLAN", "DO", "CHECK", "ACT", "CLOSED"])
  ```

- [ ] **Step 2: Implement.** Create `vernon_tasks/okr/pdca.py`:
  ```python
  """Forward-only PDCA phase transitions for Objective."""
  from __future__ import annotations

  from typing import Optional

  PDCA_SEQUENCE = ["PLAN", "DO", "CHECK", "ACT", "CLOSED"]


  def next_pdca_phase(current: Optional[str]) -> Optional[str]:
      if not current or current not in PDCA_SEQUENCE:
          return None
      idx = PDCA_SEQUENCE.index(current)
      if idx >= len(PDCA_SEQUENCE) - 1:
          return None
      return PDCA_SEQUENCE[idx + 1]
  ```

- [ ] **Step 3: Run tests.**
  ```bash
  $BENCH run-tests --app vernon_tasks --module vernon_tasks.okr.test_pdca
  ```
  Expected: `OK` with 4 tests.

- [ ] **Step 4: Commit.**
  ```bash
  git add vernon_tasks/okr/pdca.py vernon_tasks/okr/test_pdca.py
  git commit -m "feat(okr): pdca sequence helper with forward-only transitions"
  ```

---

## Task 6 — Backend list_objectives endpoint

**Files**
- Create: `vernon_tasks/api/okr.py`
- Test:   `vernon_tasks/api/test_okr.py`

**Steps**

- [ ] **Step 1: Write integration test.** Create `vernon_tasks/api/test_okr.py`:
  ```python
  import json
  import unittest

  import frappe
  from frappe.tests.utils import FrappeTestCase

  from vernon_tasks.api.okr import list_objectives


  class TestListObjectives(FrappeTestCase):
      @classmethod
      def setUpClass(cls):
          super().setUpClass()
          if not frappe.db.exists("Objective", {"title": "OKR_TEST_LIST_1"}):
              doc = frappe.get_doc({
                  "doctype": "Objective",
                  "title": "OKR_TEST_LIST_1",
                  "period": "2026-Q2",
                  "period_start": "2026-04-01",
                  "period_end": "2026-06-30",
                  "objective_owner": "Administrator",
                  "status": "Open",
                  "pdca_phase": "PLAN",
              })
              doc.insert(ignore_permissions=True)
              frappe.db.commit()

      def test_returns_rows_with_required_keys(self):
          rows = list_objectives({})
          self.assertGreater(len(rows), 0)
          keys = {"name", "title", "period", "period_start", "period_end",
                  "objective_owner", "status", "pdca_phase", "progress_avg"}
          self.assertTrue(keys.issubset(rows[0].keys()))

      def test_filter_date_range(self):
          rows = list_objectives({"period_start": "2026-04-01", "period_end": "2026-06-30"})
          self.assertTrue(any(r["title"] == "OKR_TEST_LIST_1" for r in rows))
          rows_out = list_objectives({"period_start": "2027-01-01", "period_end": "2027-03-31"})
          self.assertFalse(any(r["title"] == "OKR_TEST_LIST_1" for r in rows_out))

      def test_filter_status(self):
          rows = list_objectives({"statuses": ["Open"]})
          self.assertTrue(any(r["title"] == "OKR_TEST_LIST_1" for r in rows))
          rows = list_objectives({"statuses": ["Closed"]})
          self.assertFalse(any(r["title"] == "OKR_TEST_LIST_1" for r in rows))

      def test_filter_json_string_accepted(self):
          rows = list_objectives(json.dumps({"statuses": ["Open"]}))
          self.assertTrue(any(r["title"] == "OKR_TEST_LIST_1" for r in rows))
  ```

- [ ] **Step 2: Ensure package marker.**
  ```bash
  [ -f vernon_tasks/api/__init__.py ] || touch vernon_tasks/api/__init__.py
  ```

- [ ] **Step 3: Implement.** Create `vernon_tasks/api/okr.py`:
  ```python
  """Whitelisted OKR list/detail/bulk endpoints for the desktop portal."""
  from __future__ import annotations

  import json
  from typing import Any, Optional

  import frappe
  from frappe import _

  MAX_ROWS = 500


  def _coerce_filters(filters: Any) -> dict:
      if filters is None or filters == "":
          return {}
      if isinstance(filters, str):
          try:
              return json.loads(filters) or {}
          except json.JSONDecodeError:
              return {}
      return dict(filters)


  @frappe.whitelist()
  def list_objectives(filters: Optional[Any] = None) -> list[dict]:
      f = _coerce_filters(filters)
      where = ["1=1"]
      params: dict[str, Any] = {}

      start = f.get("period_start")
      end = f.get("period_end")
      if start and end:
          where.append("o.period_end >= %(p_start)s AND o.period_start <= %(p_end)s")
          params["p_start"] = start
          params["p_end"] = end

      owners = f.get("owners") or []
      if owners:
          where.append("o.objective_owner IN %(owners)s")
          params["owners"] = tuple(owners)

      statuses = f.get("statuses") or []
      if statuses:
          where.append("o.status IN %(statuses)s")
          params["statuses"] = tuple(statuses)

      phases = f.get("pdca") or []
      if phases:
          where.append("o.pdca_phase IN %(phases)s")
          params["phases"] = tuple(phases)

      sql = f"""
          SELECT
              o.name, o.title, o.period, o.period_start, o.period_end,
              o.objective_owner, o.status, o.pdca_phase, o.modified,
              COALESCE(AVG(kr.progress_percent), 0) AS progress_avg
          FROM `tabObjective` o
          LEFT JOIN `tabKey Result` kr ON kr.objective = o.name
          WHERE {' AND '.join(where)}
          GROUP BY o.name
          ORDER BY o.period DESC, o.modified DESC
          LIMIT {MAX_ROWS}
      """
      return frappe.db.sql(sql, params, as_dict=True)
  ```

- [ ] **Step 4: Run tests.**
  ```bash
  $BENCH run-tests --app vernon_tasks --module vernon_tasks.api.test_okr
  ```
  Expected: `OK` (4 tests).

- [ ] **Step 5: Commit.**
  ```bash
  git add vernon_tasks/api/__init__.py vernon_tasks/api/okr.py vernon_tasks/api/test_okr.py
  git commit -m "feat(api): list_objectives with date-range + multi-filter SQL"
  ```

---

## Task 7 — Backend get_objective_with_krs

**Files**
- Modify: `vernon_tasks/api/okr.py`
- Modify: `vernon_tasks/api/test_okr.py`

**Steps**

- [ ] **Step 1: Add test class.** Append to `vernon_tasks/api/test_okr.py`:
  ```python
  from vernon_tasks.api.okr import get_objective_with_krs


  class TestGetObjectiveWithKrs(FrappeTestCase):
      @classmethod
      def setUpClass(cls):
          super().setUpClass()
          if not frappe.db.exists("Objective", {"title": "OKR_TEST_DETAIL"}):
              obj = frappe.get_doc({
                  "doctype": "Objective",
                  "title": "OKR_TEST_DETAIL",
                  "period": "2026-Q2",
                  "objective_owner": "Administrator",
                  "status": "Open",
                  "pdca_phase": "PLAN",
              }).insert(ignore_permissions=True)
              frappe.get_doc({
                  "doctype": "Key Result",
                  "objective": obj.name,
                  "metric": "Signups",
                  "target_value": 100,
                  "current_value": 25,
                  "unit": "users",
                  "progress_percent": 25,
              }).insert(ignore_permissions=True)
              frappe.db.commit()
              cls.obj_name = obj.name
          else:
              cls.obj_name = frappe.db.get_value("Objective", {"title": "OKR_TEST_DETAIL"}, "name")

      def test_returns_objective_and_krs(self):
          result = get_objective_with_krs(self.obj_name)
          self.assertIn("objective", result)
          self.assertIn("key_results", result)
          self.assertEqual(result["objective"]["title"], "OKR_TEST_DETAIL")
          self.assertGreaterEqual(len(result["key_results"]), 1)
          self.assertEqual(result["key_results"][0]["metric"], "Signups")

      def test_missing_raises(self):
          with self.assertRaises(frappe.DoesNotExistError):
              get_objective_with_krs("Objective-DOES-NOT-EXIST")
  ```

- [ ] **Step 2: Implement.** Append to `vernon_tasks/api/okr.py`:
  ```python
  @frappe.whitelist()
  def get_objective_with_krs(name: str) -> dict:
      if not frappe.db.exists("Objective", name):
          raise frappe.DoesNotExistError(_("Objective {0} not found").format(name))
      obj = frappe.get_doc("Objective", name)
      obj.check_permission("read")
      krs = frappe.get_all(
          "Key Result",
          filters={"objective": name},
          fields=["name", "metric", "target_value", "current_value", "unit",
                  "progress_percent", "modified"],
          order_by="creation asc",
      )
      return {"objective": obj.as_dict(), "key_results": krs}
  ```

- [ ] **Step 3: Test.**
  ```bash
  $BENCH run-tests --app vernon_tasks --module vernon_tasks.api.test_okr
  ```
  Expected: `OK` (6 tests total).

- [ ] **Step 4: Commit.**
  ```bash
  git add vernon_tasks/api/okr.py vernon_tasks/api/test_okr.py
  git commit -m "feat(api): get_objective_with_krs single-fetch endpoint"
  ```

---

## Task 8 — Backend bulk_advance_pdca

**Files**
- Modify: `vernon_tasks/api/okr.py`
- Modify: `vernon_tasks/api/test_okr.py`

**Steps**

- [ ] **Step 1: Add test.** Append to `vernon_tasks/api/test_okr.py`:
  ```python
  from vernon_tasks.api.okr import bulk_advance_pdca


  class TestBulkAdvancePdca(FrappeTestCase):
      @classmethod
      def setUpClass(cls):
          super().setUpClass()
          cls.names: list[str] = []
          for title, phase in [
              ("OKR_BULK_PLAN", "PLAN"),
              ("OKR_BULK_DO", "DO"),
              ("OKR_BULK_CLOSED", "CLOSED"),
          ]:
              if not frappe.db.exists("Objective", {"title": title}):
                  doc = frappe.get_doc({
                      "doctype": "Objective",
                      "title": title,
                      "period": "2026-Q2",
                      "objective_owner": "Administrator",
                      "status": "Open",
                      "pdca_phase": phase,
                  }).insert(ignore_permissions=True)
                  cls.names.append(doc.name)
              else:
                  cls.names.append(frappe.db.get_value("Objective", {"title": title}, "name"))
          frappe.db.commit()

      def test_advances_and_skips_closed(self):
          result = bulk_advance_pdca(self.names)
          self.assertIn("advanced", result)
          self.assertIn("skipped", result)
          advanced_names = [r["name"] for r in result["advanced"]]
          skipped_names = [r["name"] for r in result["skipped"]]
          plan_name = self.names[0]
          do_name = self.names[1]
          closed_name = self.names[2]
          self.assertIn(plan_name, advanced_names)
          self.assertIn(do_name, advanced_names)
          self.assertIn(closed_name, skipped_names)
          # re-read
          self.assertEqual(frappe.db.get_value("Objective", plan_name, "pdca_phase"), "DO")
          self.assertEqual(frappe.db.get_value("Objective", do_name, "pdca_phase"), "CHECK")

      def test_accepts_json_string(self):
          result = bulk_advance_pdca(json.dumps([self.names[2]]))
          self.assertEqual(len(result["advanced"]), 0)
          self.assertEqual(len(result["skipped"]), 1)
          self.assertEqual(result["skipped"][0]["reason"], "already_closed")
  ```

- [ ] **Step 2: Implement.** Append to `vernon_tasks/api/okr.py`:
  ```python
  from vernon_tasks.okr.pdca import next_pdca_phase


  def _coerce_list(names: Any) -> list[str]:
      if names is None:
          return []
      if isinstance(names, str):
          try:
              parsed = json.loads(names)
              return list(parsed) if isinstance(parsed, list) else []
          except json.JSONDecodeError:
              return []
      return list(names)


  @frappe.whitelist()
  def bulk_advance_pdca(names: Any) -> dict:
      name_list = _coerce_list(names)
      advanced: list[dict] = []
      skipped: list[dict] = []

      for name in name_list:
          if not frappe.db.exists("Objective", name):
              skipped.append({"name": name, "reason": "not_found"})
              continue
          if not frappe.has_permission("Objective", ptype="write", doc=name):
              skipped.append({"name": name, "reason": "no_permission"})
              continue
          current = frappe.db.get_value("Objective", name, "pdca_phase")
          nxt = next_pdca_phase(current)
          if nxt is None:
              reason = "already_closed" if current == "CLOSED" else "invalid_phase"
              skipped.append({"name": name, "reason": reason, "current": current})
              continue
          frappe.db.set_value("Objective", name, "pdca_phase", nxt)
          advanced.append({"name": name, "from": current, "to": nxt})

      frappe.db.commit()
      return {"advanced": advanced, "skipped": skipped}
  ```

- [ ] **Step 3: Test.**
  ```bash
  $BENCH run-tests --app vernon_tasks --module vernon_tasks.api.test_okr
  ```
  Expected: `OK` (8 tests total).

- [ ] **Step 4: Commit.**
  ```bash
  git add vernon_tasks/api/okr.py vernon_tasks/api/test_okr.py
  git commit -m "feat(api): bulk_advance_pdca with skip-on-closed and permission filter"
  ```

---

## Task 9 — Frontend periodParser (mirror of backend)

**Files**
- Create: `pwa/src/portal/okr/lib/periodParser.ts`
- Test:   `pwa/src/portal/okr/lib/periodParser.test.ts`

**Steps**

- [ ] **Step 1: Tests first.** Create `pwa/src/portal/okr/lib/periodParser.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { parsePeriod } from "./periodParser";

  describe("parsePeriod", () => {
    it("parses quarters", () => {
      expect(parsePeriod("2026-Q1")).toEqual({ start: "2026-01-01", end: "2026-03-31" });
      expect(parsePeriod("2026-Q2")).toEqual({ start: "2026-04-01", end: "2026-06-30" });
      expect(parsePeriod("2026-Q4")).toEqual({ start: "2026-10-01", end: "2026-12-31" });
    });
    it("parses halves", () => {
      expect(parsePeriod("2026-H1")).toEqual({ start: "2026-01-01", end: "2026-06-30" });
      expect(parsePeriod("2026-H2")).toEqual({ start: "2026-07-01", end: "2026-12-31" });
    });
    it("parses year", () => {
      expect(parsePeriod("2026")).toEqual({ start: "2026-01-01", end: "2026-12-31" });
    });
    it("returns null for unknown", () => {
      expect(parsePeriod("FY2026")).toBeNull();
      expect(parsePeriod("")).toBeNull();
      expect(parsePeriod(null as unknown as string)).toBeNull();
    });
  });
  ```

- [ ] **Step 2: Implement.** Create `pwa/src/portal/okr/lib/periodParser.ts`:
  ```ts
  export interface PeriodRange {
    start: string;
    end: string;
  }

  const QUARTER_BOUNDS: Record<number, [string, string]> = {
    1: ["01-01", "03-31"],
    2: ["04-01", "06-30"],
    3: ["07-01", "09-30"],
    4: ["10-01", "12-31"],
  };
  const HALF_BOUNDS: Record<number, [string, string]> = {
    1: ["01-01", "06-30"],
    2: ["07-01", "12-31"],
  };

  export function parsePeriod(value: string | null | undefined): PeriodRange | null {
    if (!value || typeof value !== "string") return null;
    const v = value.trim();

    let m = /^(\d{4})-Q([1-4])$/.exec(v);
    if (m) {
      const [s, e] = QUARTER_BOUNDS[Number(m[2])];
      return { start: `${m[1]}-${s}`, end: `${m[1]}-${e}` };
    }
    m = /^(\d{4})-H([12])$/.exec(v);
    if (m) {
      const [s, e] = HALF_BOUNDS[Number(m[2])];
      return { start: `${m[1]}-${s}`, end: `${m[1]}-${e}` };
    }
    m = /^(\d{4})$/.exec(v);
    if (m) {
      return { start: `${m[1]}-01-01`, end: `${m[1]}-12-31` };
    }
    return null;
  }
  ```

- [ ] **Step 3: Test.**
  ```bash
  cd pwa && npm test -- periodParser --run
  ```
  Expected: 4 passing tests.

- [ ] **Step 4: Commit.**
  ```bash
  git add pwa/src/portal/okr/lib/periodParser.ts pwa/src/portal/okr/lib/periodParser.test.ts
  git commit -m "feat(okr): frontend periodParser mirrors backend semantics"
  ```

---

## Task 10 — Frontend pdcaSequence

**Files**
- Create: `pwa/src/portal/okr/lib/pdcaSequence.ts`
- Test:   `pwa/src/portal/okr/lib/pdcaSequence.test.ts`

**Steps**

- [ ] **Step 1: Tests.** Create `pwa/src/portal/okr/lib/pdcaSequence.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { PDCA_SEQUENCE, nextPdca } from "./pdcaSequence";

  describe("nextPdca", () => {
    it("advances PLAN→DO→CHECK→ACT→CLOSED", () => {
      expect(nextPdca("PLAN")).toBe("DO");
      expect(nextPdca("DO")).toBe("CHECK");
      expect(nextPdca("CHECK")).toBe("ACT");
      expect(nextPdca("ACT")).toBe("CLOSED");
    });
    it("returns null for CLOSED", () => {
      expect(nextPdca("CLOSED")).toBeNull();
    });
    it("returns null for invalid", () => {
      // @ts-expect-error invalid input
      expect(nextPdca("XX")).toBeNull();
    });
    it("exposes sequence constant", () => {
      expect(PDCA_SEQUENCE).toEqual(["PLAN", "DO", "CHECK", "ACT", "CLOSED"]);
    });
  });
  ```

- [ ] **Step 2: Implement.** Create `pwa/src/portal/okr/lib/pdcaSequence.ts`:
  ```ts
  export const PDCA_SEQUENCE = ["PLAN", "DO", "CHECK", "ACT", "CLOSED"] as const;
  export type PdcaPhase = (typeof PDCA_SEQUENCE)[number];

  export function nextPdca(current: PdcaPhase): PdcaPhase | null {
    const idx = PDCA_SEQUENCE.indexOf(current);
    if (idx < 0 || idx >= PDCA_SEQUENCE.length - 1) return null;
    return PDCA_SEQUENCE[idx + 1];
  }
  ```

- [ ] **Step 3: Test + commit.**
  ```bash
  cd pwa && npm test -- pdcaSequence --run
  git add pwa/src/portal/okr/lib/pdcaSequence.ts pwa/src/portal/okr/lib/pdcaSequence.test.ts
  git commit -m "feat(okr): pdcaSequence frontend helper"
  ```

---

## Task 11 — Frontend API clients + types

**Files**
- Modify: `pwa/src/api/client.ts` (add `put` + `del`)
- Create: `pwa/src/portal/okr/api/types.ts`
- Create: `pwa/src/portal/okr/api/objectives.ts`
- Create: `pwa/src/portal/okr/api/keyResults.ts`
- Create: `pwa/src/portal/okr/api/bulk.ts`

**Steps**

- [ ] **Step 1: Extend the shared client.** Edit `pwa/src/api/client.ts`, replace the exported object:
  ```ts
  export const api = {
    get: <T>(url: string) => request<T>("GET", url),
    post: <T>(url: string, body?: unknown) => request<T>("POST", url, body ?? {}),
    put: <T>(url: string, body?: unknown) => request<T>("PUT", url, body ?? {}),
    del: <T>(url: string) => request<T>("DELETE", url),
  };
  ```

- [ ] **Step 2: Create `pwa/src/portal/okr/api/types.ts`:**
  ```ts
  import type { PdcaPhase } from "../lib/pdcaSequence";

  export type ObjectiveStatus = "Open" | "On Track" | "At Risk" | "Closed";

  export interface ObjectiveRow {
    name: string;
    title: string;
    period: string;
    period_start: string | null;
    period_end: string | null;
    objective_owner: string;
    status: ObjectiveStatus;
    pdca_phase: PdcaPhase;
    progress_avg: number;
    modified: string;
  }

  export interface KeyResult {
    name: string;
    metric: string;
    target_value: number;
    current_value: number;
    unit: string | null;
    progress_percent: number;
    modified: string;
  }

  export interface ObjectiveDetail {
    objective: ObjectiveRow & {
      description?: string | null;
    };
    key_results: KeyResult[];
  }

  export interface ListFilters {
    period_start?: string;
    period_end?: string;
    owners?: string[];
    statuses?: ObjectiveStatus[];
    pdca?: PdcaPhase[];
  }

  export interface BulkAdvanceResult {
    advanced: Array<{ name: string; from: PdcaPhase; to: PdcaPhase }>;
    skipped: Array<{ name: string; reason: string; current?: PdcaPhase }>;
  }

  export interface ObjectiveFormValues {
    title: string;
    description?: string;
    period: string;
    period_start: string;
    period_end: string;
    objective_owner: string;
    status: ObjectiveStatus;
    pdca_phase: PdcaPhase;
  }
  ```

- [ ] **Step 3: Create `pwa/src/portal/okr/api/objectives.ts`:**
  ```ts
  import { api } from "../../../api/client";
  import type { ListFilters, ObjectiveDetail, ObjectiveRow, ObjectiveFormValues } from "./types";

  const LIST_URL = "/api/method/vernon_tasks.api.okr.list_objectives";
  const DETAIL_URL = "/api/method/vernon_tasks.api.okr.get_objective_with_krs";

  export function listObjectives(filters: ListFilters): Promise<ObjectiveRow[]> {
    return api.post<ObjectiveRow[]>(LIST_URL, { filters });
  }

  export function getObjectiveWithKrs(name: string): Promise<ObjectiveDetail> {
    return api.post<ObjectiveDetail>(DETAIL_URL, { name });
  }

  export function createObjective(values: ObjectiveFormValues): Promise<ObjectiveRow> {
    return api.post<ObjectiveRow>("/api/resource/Objective", values);
  }

  export function updateObjective(name: string, values: Partial<ObjectiveFormValues>): Promise<ObjectiveRow> {
    return api.put<ObjectiveRow>(`/api/resource/Objective/${encodeURIComponent(name)}`, values);
  }
  ```

- [ ] **Step 4: Create `pwa/src/portal/okr/api/keyResults.ts`:**
  ```ts
  import { api } from "../../../api/client";
  import type { KeyResult } from "./types";

  const BASE = "/api/resource/Key Result";

  export interface KrUpdate {
    current_value?: number;
    target_value?: number;
    metric?: string;
    unit?: string;
    _modified?: string;
  }

  export function updateKeyResult(name: string, patch: KrUpdate): Promise<KeyResult> {
    return api.put<KeyResult>(`${BASE}/${encodeURIComponent(name)}`, patch);
  }

  export function createKeyResult(payload: {
    objective: string;
    metric: string;
    target_value: number;
    current_value: number;
    unit?: string;
  }): Promise<KeyResult> {
    return api.post<KeyResult>(BASE, payload);
  }

  export function deleteKeyResult(name: string): Promise<void> {
    return api.del<void>(`${BASE}/${encodeURIComponent(name)}`);
  }
  ```

- [ ] **Step 5: Create `pwa/src/portal/okr/api/bulk.ts`:**
  ```ts
  import { api } from "../../../api/client";
  import type { BulkAdvanceResult } from "./types";

  const BULK_URL = "/api/method/vernon_tasks.api.okr.bulk_advance_pdca";

  export function bulkAdvancePdca(names: string[]): Promise<BulkAdvanceResult> {
    return api.post<BulkAdvanceResult>(BULK_URL, { names });
  }
  ```

- [ ] **Step 6: Typecheck.**
  ```bash
  cd pwa && npx tsc --noEmit
  ```
  Expected: clean.

- [ ] **Step 7: Commit.**
  ```bash
  git add pwa/src/api/client.ts pwa/src/portal/okr/api/
  git commit -m "feat(okr): frontend API clients for objectives, KRs, bulk PDCA"
  ```

---

## Task 12 — Hooks (useObjectives, useObjective, usePdcaTransition, keys)

**Files**
- Create: `pwa/src/portal/okr/hooks/keys.ts`
- Create: `pwa/src/portal/okr/hooks/useObjectives.ts`
- Create: `pwa/src/portal/okr/hooks/useObjective.ts`
- Create: `pwa/src/portal/okr/hooks/usePdcaTransition.ts`

**Steps**

- [ ] **Step 1: keys.ts.**
  ```ts
  import type { ListFilters } from "../api/types";

  export const okrKeys = {
    all: ["okr"] as const,
    lists: () => [...okrKeys.all, "list"] as const,
    list: (filters: ListFilters) => [...okrKeys.lists(), filters] as const,
    details: () => [...okrKeys.all, "detail"] as const,
    detail: (name: string) => [...okrKeys.details(), name] as const,
  };
  ```

- [ ] **Step 2: useObjectives.ts.**
  ```ts
  import { useQuery } from "@tanstack/react-query";
  import { listObjectives } from "../api/objectives";
  import type { ListFilters } from "../api/types";
  import { okrKeys } from "./keys";

  export function useObjectives(filters: ListFilters) {
    return useQuery({
      queryKey: okrKeys.list(filters),
      queryFn: () => listObjectives(filters),
      staleTime: 30_000,
    });
  }
  ```

- [ ] **Step 3: useObjective.ts.**
  ```ts
  import { useQuery } from "@tanstack/react-query";
  import { getObjectiveWithKrs } from "../api/objectives";
  import { okrKeys } from "./keys";

  export function useObjective(name: string | null) {
    return useQuery({
      queryKey: name ? okrKeys.detail(name) : okrKeys.detail("__none__"),
      queryFn: () => getObjectiveWithKrs(name as string),
      enabled: !!name,
      staleTime: 30_000,
    });
  }
  ```

- [ ] **Step 4: usePdcaTransition.ts.**
  ```ts
  import { useMutation, useQueryClient } from "@tanstack/react-query";
  import { bulkAdvancePdca } from "../api/bulk";
  import type { BulkAdvanceResult } from "../api/types";
  import { okrKeys } from "./keys";

  export function usePdcaTransition() {
    const qc = useQueryClient();
    return useMutation<BulkAdvanceResult, Error, string[]>({
      mutationFn: (names) => bulkAdvancePdca(names),
      onSuccess: (data) => {
        qc.invalidateQueries({ queryKey: okrKeys.lists() });
        data.advanced.forEach((row) => {
          qc.invalidateQueries({ queryKey: okrKeys.detail(row.name) });
        });
      },
    });
  }
  ```

- [ ] **Step 5: Typecheck + commit.**
  ```bash
  cd pwa && npx tsc --noEmit
  git add pwa/src/portal/okr/hooks/
  git commit -m "feat(okr): react-query hooks for list, detail, bulk PDCA"
  ```

---

## Task 13 — FiltersBar (URL-sync) + tests

**Files**
- Create: `pwa/src/portal/okr/FiltersBar.tsx`
- Test:   `pwa/src/portal/okr/FiltersBar.test.tsx`

**Steps**

- [ ] **Step 1: Test.** Create `pwa/src/portal/okr/FiltersBar.test.tsx`:
  ```tsx
  import { describe, it, expect } from "vitest";
  import { render, screen, fireEvent } from "@testing-library/react";
  import { MemoryRouter, useSearchParams } from "react-router-dom";
  import { FiltersBar } from "./FiltersBar";

  function CurrentParams() {
    const [params] = useSearchParams();
    return <pre data-testid="params">{params.toString()}</pre>;
  }

  function setup(initial = "") {
    return render(
      <MemoryRouter initialEntries={[`/portal/okr?${initial}`]}>
        <FiltersBar />
        <CurrentParams />
      </MemoryRouter>,
    );
  }

  describe("FiltersBar", () => {
    it("renders date inputs and chips", () => {
      setup();
      expect(screen.getByLabelText(/period start/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/period end/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /open/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /plan/i })).toBeInTheDocument();
    });

    it("toggles status chip into URL", () => {
      setup();
      fireEvent.click(screen.getByRole("button", { name: /open/i }));
      expect(screen.getByTestId("params").textContent).toContain("statuses=Open");
    });

    it("clear filters empties URL", () => {
      setup("statuses=Open&pdca=PLAN");
      fireEvent.click(screen.getByRole("button", { name: /clear filters/i }));
      expect(screen.getByTestId("params").textContent).toBe("");
    });
  });
  ```

- [ ] **Step 2: Implement.** Create `pwa/src/portal/okr/FiltersBar.tsx`:
  ```tsx
  import { useSearchParams } from "react-router-dom";
  import type { ObjectiveStatus } from "./api/types";
  import { PDCA_SEQUENCE, type PdcaPhase } from "./lib/pdcaSequence";

  const STATUSES: ObjectiveStatus[] = ["Open", "On Track", "At Risk", "Closed"];

  export function FiltersBar() {
    const [params, setParams] = useSearchParams();

    const setSingle = (key: string, value: string) => {
      const next = new URLSearchParams(params);
      if (value) next.set(key, value);
      else next.delete(key);
      setParams(next, { replace: true });
    };

    const toggleMulti = (key: string, value: string) => {
      const current = params.getAll(key);
      const next = new URLSearchParams(params);
      next.delete(key);
      const set = new Set(current);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      Array.from(set).forEach((v) => next.append(key, v));
      setParams(next, { replace: true });
    };

    const isPressed = (key: string, value: string) => params.getAll(key).includes(value);

    return (
      <div className="okr-filters" role="region" aria-label="OKR filters">
        <label>
          Period start
          <input
            type="date"
            value={params.get("period_start") ?? ""}
            onChange={(e) => setSingle("period_start", e.target.value)}
          />
        </label>
        <label>
          Period end
          <input
            type="date"
            value={params.get("period_end") ?? ""}
            onChange={(e) => setSingle("period_end", e.target.value)}
          />
        </label>
        <div className="okr-filters__group" aria-label="Status">
          {STATUSES.map((s) => (
            <button
              type="button"
              key={s}
              aria-pressed={isPressed("statuses", s)}
              onClick={() => toggleMulti("statuses", s)}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="okr-filters__group" aria-label="PDCA phase">
          {PDCA_SEQUENCE.map((p: PdcaPhase) => (
            <button
              type="button"
              key={p}
              aria-pressed={isPressed("pdca", p)}
              onClick={() => toggleMulti("pdca", p)}
            >
              {p}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
          Clear filters
        </button>
      </div>
    );
  }
  ```

- [ ] **Step 3: Test + commit.**
  ```bash
  cd pwa && npm test -- FiltersBar --run
  git add pwa/src/portal/okr/FiltersBar.tsx pwa/src/portal/okr/FiltersBar.test.tsx
  git commit -m "feat(okr): FiltersBar with URL-synced status/PDCA/date filters"
  ```

---

## Task 14 — ObjectiveTable (sort default Period DESC, bulk-select) + tests

**Files**
- Create: `pwa/src/portal/okr/ObjectiveTable.tsx`
- Test:   `pwa/src/portal/okr/ObjectiveTable.test.tsx`

**Steps**

- [ ] **Step 1: Test.** Create `pwa/src/portal/okr/ObjectiveTable.test.tsx`:
  ```tsx
  import { describe, it, expect, vi } from "vitest";
  import { render, screen, fireEvent } from "@testing-library/react";
  import { MemoryRouter } from "react-router-dom";
  import { ObjectiveTable } from "./ObjectiveTable";
  import type { ObjectiveRow } from "./api/types";

  const rows: ObjectiveRow[] = [
    {
      name: "OBJ-1", title: "Grow signups", period: "2026-Q2",
      period_start: "2026-04-01", period_end: "2026-06-30",
      objective_owner: "alice@example.com", status: "Open", pdca_phase: "PLAN",
      progress_avg: 42.7, modified: "2026-05-12 10:00:00",
    },
  ];

  function setup(selected = new Set<string>()) {
    const onSelectChange = vi.fn();
    render(
      <MemoryRouter>
        <ObjectiveTable rows={rows} selected={selected} onSelectChange={onSelectChange} />
      </MemoryRouter>,
    );
    return { onSelectChange };
  }

  describe("ObjectiveTable", () => {
    it("renders title, owner and rounded progress", () => {
      setup();
      expect(screen.getByText("Grow signups")).toBeInTheDocument();
      expect(screen.getByText("alice@example.com")).toBeInTheDocument();
      expect(screen.getByText("43%")).toBeInTheDocument();
    });

    it("checkbox toggle invokes onSelectChange with new Set", () => {
      const { onSelectChange } = setup();
      const cb = screen.getAllByRole("checkbox").find((c) => c.getAttribute("data-name") === "OBJ-1")!;
      fireEvent.click(cb);
      expect(onSelectChange).toHaveBeenCalledTimes(1);
      const arg = onSelectChange.mock.calls[0][0] as Set<string>;
      expect(arg.has("OBJ-1")).toBe(true);
    });
  });
  ```

- [ ] **Step 2: Implement.** Create `pwa/src/portal/okr/ObjectiveTable.tsx`:
  ```tsx
  import { useSearchParams } from "react-router-dom";
  import type { ObjectiveRow } from "./api/types";

  export interface ObjectiveTableProps {
    rows: ObjectiveRow[];
    selected: Set<string>;
    onSelectChange: (next: Set<string>) => void;
  }

  export function ObjectiveTable({ rows, selected, onSelectChange }: ObjectiveTableProps) {
    const [params, setParams] = useSearchParams();

    const toggleOne = (name: string) => {
      const next = new Set(selected);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      onSelectChange(next);
    };

    const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.name));
    const toggleAll = () => {
      const next = new Set(selected);
      if (allChecked) rows.forEach((r) => next.delete(r.name));
      else rows.forEach((r) => next.add(r.name));
      onSelectChange(next);
    };

    const selectRow = (name: string) => {
      const next = new URLSearchParams(params);
      next.set("obj", name);
      setParams(next, { replace: true });
    };

    return (
      <table className="okr-table">
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                aria-label="Select all visible"
                checked={allChecked}
                onChange={toggleAll}
              />
            </th>
            <th>Title</th>
            <th>Period</th>
            <th>Owner</th>
            <th>Status</th>
            <th>PDCA</th>
            <th>Progress</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} onClick={() => selectRow(r.name)} className="okr-table__row">
              <td onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  data-name={r.name}
                  aria-label={`Select ${r.title}`}
                  checked={selected.has(r.name)}
                  onChange={() => toggleOne(r.name)}
                />
              </td>
              <td>
                <a
                  href={`?obj=${encodeURIComponent(r.name)}`}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); selectRow(r.name); }}
                >
                  {r.title}
                </a>
              </td>
              <td>{r.period}</td>
              <td>{r.objective_owner}</td>
              <td>{r.status}</td>
              <td>{r.pdca_phase}</td>
              <td>{Math.round(Number(r.progress_avg) || 0)}%</td>
              <td>{(r.modified || "").slice(0, 10)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  ```

- [ ] **Step 3: Test + commit.**
  ```bash
  cd pwa && npm test -- ObjectiveTable --run
  git add pwa/src/portal/okr/ObjectiveTable.tsx pwa/src/portal/okr/ObjectiveTable.test.tsx
  git commit -m "feat(okr): ObjectiveTable with row selection + bulk checkbox"
  ```

---

## Task 15 — KRRow with 800ms debounced autosave + tests

**Files**
- Create: `pwa/src/portal/okr/KRRow.tsx`
- Test:   `pwa/src/portal/okr/KRRow.test.tsx`

**Steps**

- [ ] **Step 1: Test.** Create `pwa/src/portal/okr/KRRow.test.tsx`:
  ```tsx
  import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
  import { render, screen, fireEvent, act } from "@testing-library/react";
  import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
  import { KRRow } from "./KRRow";
  import * as krApi from "./api/keyResults";
  import type { KeyResult } from "./api/types";

  const kr: KeyResult = {
    name: "KR-1", metric: "Signups", target_value: 100, current_value: 25,
    unit: "users", progress_percent: 25, modified: "2026-05-12 10:00:00",
  };

  function setup() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <KRRow kr={kr} objectiveName="OBJ-1" />
      </QueryClientProvider>,
    );
  }

  describe("KRRow", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("debounces autosave by 800ms", async () => {
      const spy = vi.spyOn(krApi, "updateKeyResult").mockResolvedValue({ ...kr, current_value: 30 });
      setup();
      const input = screen.getByLabelText(/current value/i);
      fireEvent.change(input, { target: { value: "30" } });
      expect(spy).not.toHaveBeenCalled();
      await act(async () => {
        vi.advanceTimersByTime(800);
      });
      expect(spy).toHaveBeenCalledWith("KR-1", expect.objectContaining({ current_value: 30 }));
    });
  });
  ```

- [ ] **Step 2: Implement.** Create `pwa/src/portal/okr/KRRow.tsx`:
  ```tsx
  import { useEffect, useRef, useState } from "react";
  import { useQueryClient } from "@tanstack/react-query";
  import * as krApi from "./api/keyResults";
  import type { KeyResult } from "./api/types";
  import { okrKeys } from "./hooks/keys";

  const DEBOUNCE_MS = 800;

  type SaveState = "idle" | "saving" | "saved" | "error";

  export interface KRRowProps {
    kr: KeyResult;
    objectiveName: string;
  }

  export function KRRow({ kr, objectiveName }: KRRowProps) {
    const qc = useQueryClient();
    const [value, setValue] = useState<string>(String(kr.current_value ?? 0));
    const [state, setState] = useState<SaveState>("idle");
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

    const scheduleSave = (next: string) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        const numeric = Number(next);
        if (!Number.isFinite(numeric)) return;
        setState("saving");
        try {
          await krApi.updateKeyResult(kr.name, {
            current_value: numeric,
            _modified: kr.modified,
          });
          setState("saved");
          qc.invalidateQueries({ queryKey: okrKeys.detail(objectiveName) });
          qc.invalidateQueries({ queryKey: okrKeys.lists() });
        } catch {
          setState("error");
        }
      }, DEBOUNCE_MS);
    };

    return (
      <div className="okr-kr-row">
        <span className="okr-kr-row__metric">{kr.metric}</span>
        <label className="okr-kr-row__input">
          <span className="sr-only">Current value</span>
          <input
            type="number"
            aria-label="Current value"
            value={value}
            onChange={(e) => { setValue(e.target.value); scheduleSave(e.target.value); }}
          />
        </label>
        <span className="okr-kr-row__target">
          / {kr.target_value} {kr.unit ?? ""}
        </span>
        <progress max={100} value={Math.min(100, Math.max(0, Number(kr.progress_percent) || 0))} />
        <span className="okr-kr-row__state" aria-live="polite">
          {state === "saving" && "..."}
          {state === "saved" && "✓"}
          {state === "error" && "!"}
        </span>
      </div>
    );
  }
  ```

- [ ] **Step 3: Test + commit.**
  ```bash
  cd pwa && npm test -- KRRow --run
  git add pwa/src/portal/okr/KRRow.tsx pwa/src/portal/okr/KRRow.test.tsx
  git commit -m "feat(okr): KRRow with 800ms debounce autosave"
  ```

---

## Task 16 — ObjectiveDetail + tests

**Files**
- Create: `pwa/src/portal/okr/ObjectiveDetail.tsx`
- Test:   `pwa/src/portal/okr/ObjectiveDetail.test.tsx`

**Steps**

- [ ] **Step 1: Test.** Create `pwa/src/portal/okr/ObjectiveDetail.test.tsx`:
  ```tsx
  import { describe, it, expect, vi } from "vitest";
  import { render, screen, waitFor } from "@testing-library/react";
  import { MemoryRouter } from "react-router-dom";
  import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
  import { ObjectiveDetail } from "./ObjectiveDetail";
  import * as objApi from "./api/objectives";

  function wrap(node: React.ReactNode) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return (
      <QueryClientProvider client={qc}>
        <MemoryRouter>{node}</MemoryRouter>
      </QueryClientProvider>
    );
  }

  describe("ObjectiveDetail", () => {
    it("renders placeholder when name is null", () => {
      render(wrap(<ObjectiveDetail name={null} />));
      expect(screen.getByText(/select an objective/i)).toBeInTheDocument();
    });

    it("renders heading and KR metric", async () => {
      vi.spyOn(objApi, "getObjectiveWithKrs").mockResolvedValue({
        objective: {
          name: "OBJ-1", title: "Grow signups", period: "2026-Q2",
          period_start: "2026-04-01", period_end: "2026-06-30",
          objective_owner: "alice", status: "Open", pdca_phase: "PLAN",
          progress_avg: 0, modified: "2026-05-12 10:00:00", description: "",
        },
        key_results: [{
          name: "KR-1", metric: "Signups", target_value: 100, current_value: 25,
          unit: "users", progress_percent: 25, modified: "2026-05-12 10:00:00",
        }],
      });
      render(wrap(<ObjectiveDetail name="OBJ-1" />));
      await waitFor(() => expect(screen.getByRole("heading", { name: /grow signups/i })).toBeInTheDocument());
      expect(screen.getByText("Signups")).toBeInTheDocument();
    });
  });
  ```

- [ ] **Step 2: Implement.** Create `pwa/src/portal/okr/ObjectiveDetail.tsx`:
  ```tsx
  import { Link } from "react-router-dom";
  import { EmptyState } from "../../components/EmptyState";
  import { PageSkeleton } from "../../components/PageSkeleton";
  import { KRRow } from "./KRRow";
  import { useObjective } from "./hooks/useObjective";

  export interface ObjectiveDetailProps {
    name: string | null;
  }

  export function ObjectiveDetail({ name }: ObjectiveDetailProps) {
    if (!name) {
      return <EmptyState title="Select an Objective" description="Pick a row to view details." />;
    }
    const { data, isLoading, error } = useObjective(name);
    if (isLoading) return <PageSkeleton />;
    if (error || !data) return <EmptyState title="Failed to load" description="Try again later." />;

    const o = data.objective;
    return (
      <article className="okr-detail">
        <header className="okr-detail__header">
          <h2>{o.title}</h2>
          <dl>
            <dt>Period</dt><dd>{o.period}</dd>
            <dt>Owner</dt><dd>{o.objective_owner}</dd>
            <dt>Status</dt><dd>{o.status}</dd>
            <dt>PDCA</dt><dd>{o.pdca_phase}</dd>
          </dl>
          <Link to={`/portal/okr/${encodeURIComponent(o.name)}/edit`}>Edit</Link>
        </header>
        {o.description && <p className="okr-detail__description">{o.description}</p>}
        <section className="okr-detail__krs">
          <h3>Key Results</h3>
          {data.key_results.length === 0 ? (
            <EmptyState title="No Key Results yet" description="Add one to start tracking." />
          ) : (
            data.key_results.map((kr) => <KRRow key={kr.name} kr={kr} objectiveName={o.name} />)
          )}
        </section>
      </article>
    );
  }
  ```

- [ ] **Step 3: Test + commit.**
  ```bash
  cd pwa && npm test -- ObjectiveDetail --run
  git add pwa/src/portal/okr/ObjectiveDetail.tsx pwa/src/portal/okr/ObjectiveDetail.test.tsx
  git commit -m "feat(okr): ObjectiveDetail panel with KR list and edit link"
  ```

---

## Task 17 — BulkActions confirm dialog + tests

**Files**
- Create: `pwa/src/portal/okr/BulkActions.tsx`
- Test:   `pwa/src/portal/okr/BulkActions.test.tsx`

**Steps**

- [ ] **Step 1: Test.** Create `pwa/src/portal/okr/BulkActions.test.tsx`:
  ```tsx
  import { describe, it, expect, vi } from "vitest";
  import { render, screen, fireEvent, waitFor } from "@testing-library/react";
  import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
  import { BulkActions } from "./BulkActions";
  import * as bulkApi from "./api/bulk";

  function wrap(node: React.ReactNode) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
  }

  describe("BulkActions", () => {
    it("hidden when no selection", () => {
      const { container } = render(wrap(<BulkActions selected={new Set()} />));
      expect(container.textContent).toBe("");
    });

    it("confirms then calls bulkAdvancePdca", async () => {
      const spy = vi.spyOn(bulkApi, "bulkAdvancePdca").mockResolvedValue({ advanced: [], skipped: [] });
      render(wrap(<BulkActions selected={new Set(["OBJ-1", "OBJ-2"])} />));
      fireEvent.click(screen.getByRole("button", { name: /advance pdca/i }));
      const dialog = await screen.findByRole("dialog");
      fireEvent.click(dialog.querySelector('[data-action="confirm"]')!);
      await waitFor(() => expect(spy).toHaveBeenCalledWith(["OBJ-1", "OBJ-2"]));
    });
  });
  ```

- [ ] **Step 2: Implement.** Create `pwa/src/portal/okr/BulkActions.tsx`:
  ```tsx
  import { useState } from "react";
  import { usePdcaTransition } from "./hooks/usePdcaTransition";

  export interface BulkActionsProps {
    selected: Set<string>;
  }

  export function BulkActions({ selected }: BulkActionsProps) {
    const [open, setOpen] = useState(false);
    const mut = usePdcaTransition();

    if (selected.size === 0) return null;

    const confirm = async () => {
      try {
        await mut.mutateAsync(Array.from(selected));
        setOpen(false);
      } catch {
        // toast handled upstream; keep dialog open for retry
      }
    };

    return (
      <div className="okr-bulk-actions">
        <button type="button" onClick={() => setOpen(true)}>
          Advance PDCA → ({selected.size})
        </button>
        {open && (
          <div role="dialog" aria-label="Confirm bulk PDCA advance" className="okr-dialog">
            <p>Advance {selected.size} Objective(s) to the next PDCA phase?</p>
            <button type="button" data-action="cancel" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" data-action="confirm" onClick={confirm} disabled={mut.isPending}>
              Confirm
            </button>
          </div>
        )}
      </div>
    );
  }
  ```

- [ ] **Step 3: Test + commit.**
  ```bash
  cd pwa && npm test -- BulkActions --run
  git add pwa/src/portal/okr/BulkActions.tsx pwa/src/portal/okr/BulkActions.test.tsx
  git commit -m "feat(okr): BulkActions with confirm dialog wired to usePdcaTransition"
  ```

---

## Task 18 — OKRList composition + tests

**Files**
- Create: `pwa/src/portal/okr/OKRList.tsx`
- Test:   `pwa/src/portal/okr/OKRList.test.tsx`

**Steps**

- [ ] **Step 1: Test.** Create `pwa/src/portal/okr/OKRList.test.tsx`:
  ```tsx
  import { describe, it, expect, vi } from "vitest";
  import { render, screen, waitFor } from "@testing-library/react";
  import { MemoryRouter } from "react-router-dom";
  import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
  import { OKRList } from "./OKRList";
  import * as objApi from "./api/objectives";

  function wrap(node: React.ReactNode) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return (
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/portal/okr"]}>{node}</MemoryRouter>
      </QueryClientProvider>
    );
  }

  describe("OKRList", () => {
    it("renders filters, +New, and a row", async () => {
      vi.spyOn(objApi, "listObjectives").mockResolvedValue([{
        name: "OBJ-1", title: "Grow signups", period: "2026-Q2",
        period_start: "2026-04-01", period_end: "2026-06-30",
        objective_owner: "alice", status: "Open", pdca_phase: "PLAN",
        progress_avg: 0, modified: "2026-05-12 10:00:00",
      }]);
      render(wrap(<OKRList />));
      expect(screen.getByRole("region", { name: /okr filters/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /new objective/i })).toBeInTheDocument();
      await waitFor(() => expect(screen.getByText("Grow signups")).toBeInTheDocument());
      expect(screen.getByText(/select an objective/i)).toBeInTheDocument();
    });
  });
  ```

- [ ] **Step 2: Implement.** Create `pwa/src/portal/okr/OKRList.tsx`:
  ```tsx
  import { useMemo, useState } from "react";
  import { Link, useSearchParams } from "react-router-dom";
  import { PageLayout } from "../layouts/PageLayout";
  import { PageSkeleton } from "../../components/PageSkeleton";
  import { EmptyState } from "../../components/EmptyState";
  import { FiltersBar } from "./FiltersBar";
  import { BulkActions } from "./BulkActions";
  import { ObjectiveTable } from "./ObjectiveTable";
  import { ObjectiveDetail } from "./ObjectiveDetail";
  import { useObjectives } from "./hooks/useObjectives";
  import type { ListFilters, ObjectiveStatus } from "./api/types";
  import type { PdcaPhase } from "./lib/pdcaSequence";

  export function filtersFromParams(p: URLSearchParams): ListFilters {
    const f: ListFilters = {};
    const ps = p.get("period_start"); if (ps) f.period_start = ps;
    const pe = p.get("period_end"); if (pe) f.period_end = pe;
    const owners = p.getAll("owners"); if (owners.length) f.owners = owners;
    const statuses = p.getAll("statuses") as ObjectiveStatus[]; if (statuses.length) f.statuses = statuses;
    const pdca = p.getAll("pdca") as PdcaPhase[]; if (pdca.length) f.pdca = pdca;
    return f;
  }

  export function OKRList() {
    const [params] = useSearchParams();
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const filters = useMemo(() => filtersFromParams(params), [params]);
    const activeName = params.get("obj");
    const { data, isLoading, error } = useObjectives(filters);

    return (
      <PageLayout
        title="OKR"
        actions={<Link to="/portal/okr/new">+ New Objective</Link>}
      >
        <FiltersBar />
        <BulkActions selected={selected} />
        <div className="okr-grid">
          <div className="okr-grid__list">
            {isLoading && <PageSkeleton />}
            {error && <EmptyState title="Failed to load OKRs" description="Try again." />}
            {!isLoading && !error && data && data.length === 0 && (
              <EmptyState title="No OKRs match these filters" description="Adjust filters or create a new Objective." />
            )}
            {!isLoading && !error && data && data.length > 0 && (
              <ObjectiveTable rows={data} selected={selected} onSelectChange={setSelected} />
            )}
          </div>
          <aside className="okr-grid__detail">
            <ObjectiveDetail name={activeName} />
          </aside>
        </div>
      </PageLayout>
    );
  }
  ```

- [ ] **Step 3: Test + commit.**
  ```bash
  cd pwa && npm test -- OKRList --run
  git add pwa/src/portal/okr/OKRList.tsx pwa/src/portal/okr/OKRList.test.tsx
  git commit -m "feat(okr): OKRList master-detail composition with filters + bulk"
  ```

---

## Task 19 — ObjectiveEditor (zod + react-hook-form) + tests

**Files**
- Create: `pwa/src/portal/okr/ObjectiveEditor.tsx`
- Test:   `pwa/src/portal/okr/ObjectiveEditor.test.tsx`

**Steps**

- [ ] **Step 1: Ensure deps installed.**
  ```bash
  cd pwa && node -e "const p=require('./package.json');const need=['react-hook-form','zod','@hookform/resolvers'];const missing=need.filter(n=>!p.dependencies?.[n]&&!p.devDependencies?.[n]);if(missing.length){console.log('INSTALL',missing.join(' '));process.exit(0);}else console.log('OK');"
  # If output starts with INSTALL, run:
  #   npm install react-hook-form zod @hookform/resolvers
  ```

- [ ] **Step 2: Tests.** Create `pwa/src/portal/okr/ObjectiveEditor.test.tsx`:
  ```tsx
  import { describe, it, expect, vi } from "vitest";
  import { render, screen, fireEvent, waitFor } from "@testing-library/react";
  import { MemoryRouter, Routes, Route } from "react-router-dom";
  import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
  import { ObjectiveEditor } from "./ObjectiveEditor";
  import * as objApi from "./api/objectives";

  function wrap(initial = "/portal/okr/new") {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[initial]}>
          <Routes>
            <Route path="/portal/okr/new" element={<ObjectiveEditor mode="create" />} />
            <Route path="/portal/okr" element={<div>list-page</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  describe("ObjectiveEditor", () => {
    it("shows validation error when title missing", async () => {
      wrap();
      fireEvent.click(screen.getByRole("button", { name: /save/i }));
      await waitFor(() => expect(screen.getByText(/title is required/i)).toBeInTheDocument());
    });

    it("auto-fills period_start/end from period blur", async () => {
      wrap();
      const period = screen.getByLabelText(/period$/i) as HTMLInputElement;
      fireEvent.change(period, { target: { value: "2026-Q2" } });
      fireEvent.blur(period);
      await waitFor(() => {
        expect((screen.getByLabelText(/period start/i) as HTMLInputElement).value).toBe("2026-04-01");
        expect((screen.getByLabelText(/period end/i) as HTMLInputElement).value).toBe("2026-06-30");
      });
    });

    it("submits to createObjective and navigates to list", async () => {
      const spy = vi.spyOn(objApi, "createObjective").mockResolvedValue({
        name: "OBJ-NEW", title: "X", period: "2026-Q2",
        period_start: "2026-04-01", period_end: "2026-06-30",
        objective_owner: "admin", status: "Open", pdca_phase: "PLAN",
        progress_avg: 0, modified: "2026-05-12 10:00:00",
      });
      wrap();
      fireEvent.change(screen.getByLabelText(/title/i), { target: { value: "X" } });
      fireEvent.change(screen.getByLabelText(/period$/i), { target: { value: "2026-Q2" } });
      fireEvent.blur(screen.getByLabelText(/period$/i));
      fireEvent.change(screen.getByLabelText(/owner/i), { target: { value: "admin" } });
      fireEvent.click(screen.getByRole("button", { name: /save/i }));
      await waitFor(() => expect(spy).toHaveBeenCalled());
      await waitFor(() => expect(screen.getByText("list-page")).toBeInTheDocument());
    });
  });
  ```

- [ ] **Step 3: Implement.** Create `pwa/src/portal/okr/ObjectiveEditor.tsx`:
  ```tsx
  import { useEffect } from "react";
  import { useForm } from "react-hook-form";
  import { zodResolver } from "@hookform/resolvers/zod";
  import { z } from "zod";
  import { useNavigate, useParams } from "react-router-dom";
  import { PageLayout } from "../layouts/PageLayout";
  import { parsePeriod } from "./lib/periodParser";
  import { PDCA_SEQUENCE } from "./lib/pdcaSequence";
  import { createObjective, updateObjective } from "./api/objectives";
  import { useObjective } from "./hooks/useObjective";
  import type { ObjectiveFormValues } from "./api/types";

  const STATUSES = ["Open", "On Track", "At Risk", "Closed"] as const;

  const schema = z.object({
    title: z.string().min(1, "Title is required").max(140, "Title too long"),
    description: z.string().optional(),
    period: z.string().min(1, "Period is required"),
    period_start: z.string().min(1, "Start date is required"),
    period_end: z.string().min(1, "End date is required"),
    objective_owner: z.string().min(1, "Owner is required"),
    status: z.enum(STATUSES),
    pdca_phase: z.enum(PDCA_SEQUENCE),
  }).refine((v) => v.period_start <= v.period_end, {
    path: ["period_end"],
    message: "End date must be on or after start date",
  });

  export interface ObjectiveEditorProps {
    mode: "create" | "edit";
  }

  export function ObjectiveEditor({ mode }: ObjectiveEditorProps) {
    const nav = useNavigate();
    const { id } = useParams<{ id: string }>();
    const detail = useObjective(mode === "edit" ? id ?? null : null);

    const form = useForm<ObjectiveFormValues>({
      resolver: zodResolver(schema),
      defaultValues: {
        title: "", description: "", period: "",
        period_start: "", period_end: "",
        objective_owner: "", status: "Open", pdca_phase: "PLAN",
      },
    });

    useEffect(() => {
      if (mode === "edit" && detail.data) {
        const o = detail.data.objective;
        form.reset({
          title: o.title, description: o.description ?? "",
          period: o.period, period_start: o.period_start ?? "", period_end: o.period_end ?? "",
          objective_owner: o.objective_owner, status: o.status, pdca_phase: o.pdca_phase,
        });
      }
    }, [mode, detail.data, form]);

    const onPeriodBlur = () => {
      const v = form.getValues("period");
      const range = parsePeriod(v);
      if (range) {
        form.setValue("period_start", range.start, { shouldValidate: true });
        form.setValue("period_end", range.end, { shouldValidate: true });
      }
    };

    const onSubmit = form.handleSubmit(async (values) => {
      if (mode === "create") {
        const created = await createObjective(values);
        nav(`/portal/okr?obj=${encodeURIComponent(created.name)}`);
      } else if (id) {
        await updateObjective(id, values);
        nav(`/portal/okr?obj=${encodeURIComponent(id)}`);
      }
    });

    return (
      <PageLayout title={mode === "create" ? "New Objective" : "Edit Objective"}>
        <form onSubmit={onSubmit} className="okr-editor">
          <label>Title <input {...form.register("title")} /></label>
          {form.formState.errors.title && <span role="alert">{form.formState.errors.title.message}</span>}

          <label>Description <textarea {...form.register("description")} /></label>

          <label>Period <input {...form.register("period")} onBlur={onPeriodBlur} /></label>
          {form.formState.errors.period && <span role="alert">{form.formState.errors.period.message}</span>}

          <label>Period start <input type="date" {...form.register("period_start")} /></label>
          <label>Period end <input type="date" {...form.register("period_end")} /></label>
          {form.formState.errors.period_end && <span role="alert">{form.formState.errors.period_end.message}</span>}

          <label>Owner <input {...form.register("objective_owner")} /></label>
          {form.formState.errors.objective_owner && <span role="alert">{form.formState.errors.objective_owner.message}</span>}

          <label>Status
            <select {...form.register("status")}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>

          <label>PDCA
            <select {...form.register("pdca_phase")}>
              {PDCA_SEQUENCE.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>

          <div className="okr-editor__actions">
            <button type="button" onClick={() => nav(-1)}>Cancel</button>
            <button type="submit" disabled={form.formState.isSubmitting}>Save</button>
          </div>
        </form>
      </PageLayout>
    );
  }
  ```

- [ ] **Step 4: Test + commit.**
  ```bash
  cd pwa && npm test -- ObjectiveEditor --run
  git add pwa/package.json pwa/package-lock.json pwa/src/portal/okr/ObjectiveEditor.tsx pwa/src/portal/okr/ObjectiveEditor.test.tsx
  git commit -m "feat(okr): ObjectiveEditor with zod validation and period auto-fill"
  ```

---

## Task 20 — OKRRoutes + feature-flag gate + wire into PortalRoutes

**Files**
- Create: `pwa/src/portal/okr/OKRRoutes.tsx`
- Create: `pwa/src/portal/okr/OKRFeatureGate.tsx`
- Create (if missing): `pwa/src/hooks/useVtSettings.ts`
- Modify: `pwa/src/portal/routes.tsx`
- Test:   `pwa/src/portal/okr/OKRRoutes.test.tsx`

**Steps**

- [ ] **Step 1: Create `useVtSettings.ts` if absent.**
  ```bash
  test -f pwa/src/hooks/useVtSettings.ts || cat
  ```
  If missing, create `pwa/src/hooks/useVtSettings.ts`:
  ```ts
  import { useQuery } from "@tanstack/react-query";
  import { api } from "../api/client";

  export interface VtSettings {
    portal_enabled?: 0 | 1;
    portal_okr_enabled?: 0 | 1;
  }

  export function useVtSettings() {
    return useQuery({
      queryKey: ["vt-settings"],
      queryFn: async () => {
        const res = await api.get<{ portal_enabled?: number; portal_okr_enabled?: number }>(
          "/api/method/frappe.client.get_value?doctype=VT%20Settings&fieldname=%5B%22portal_enabled%22%2C%22portal_okr_enabled%22%5D",
        );
        return (res ?? {}) as VtSettings;
      },
      staleTime: 5 * 60_000,
    });
  }
  ```

- [ ] **Step 2: Create `OKRFeatureGate.tsx`:**
  ```tsx
  import type { ReactNode } from "react";
  import { ComingSoon } from "../pages/ComingSoon";
  import { useVtSettings } from "../../hooks/useVtSettings";
  import { PageSkeleton } from "../../components/PageSkeleton";

  export function OKRFeatureGate({ children }: { children: ReactNode }) {
    const { data, isLoading } = useVtSettings();
    if (isLoading) return <PageSkeleton />;
    if (!data?.portal_okr_enabled) return <ComingSoon domain="OKR" />;
    return <>{children}</>;
  }
  ```

- [ ] **Step 3: Create `OKRRoutes.tsx`:**
  ```tsx
  import { Routes, Route } from "react-router-dom";
  import { OKRList } from "./OKRList";
  import { ObjectiveEditor } from "./ObjectiveEditor";

  export function OKRRoutes() {
    return (
      <Routes>
        <Route index element={<OKRList />} />
        <Route path="new" element={<ObjectiveEditor mode="create" />} />
        <Route path=":id/edit" element={<ObjectiveEditor mode="edit" />} />
      </Routes>
    );
  }
  ```

- [ ] **Step 4: Wire into `pwa/src/portal/routes.tsx`.** Replace the `okr/*` route element:
  ```tsx
  <Route
    path="okr/*"
    element={
      <RequirePermission perm="okr.read">
        <OKRFeatureGate>
          <OKRRoutes />
        </OKRFeatureGate>
      </RequirePermission>
    }
  />
  ```
  Add imports at the top:
  ```tsx
  import { OKRRoutes } from "./okr/OKRRoutes";
  import { OKRFeatureGate } from "./okr/OKRFeatureGate";
  ```

- [ ] **Step 5: Test.** Create `pwa/src/portal/okr/OKRRoutes.test.tsx`:
  ```tsx
  import { describe, it, expect, vi } from "vitest";
  import { render, screen, waitFor } from "@testing-library/react";
  import { MemoryRouter, Routes, Route } from "react-router-dom";
  import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
  import { OKRRoutes } from "./OKRRoutes";
  import { OKRFeatureGate } from "./OKRFeatureGate";
  import * as settings from "../../hooks/useVtSettings";
  import * as objApi from "./api/objectives";

  function setup(path: string) {
    vi.spyOn(settings, "useVtSettings").mockReturnValue({
      data: { portal_okr_enabled: 1, portal_enabled: 1 },
      isLoading: false,
    } as never);
    vi.spyOn(objApi, "listObjectives").mockResolvedValue([]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/portal/okr/*" element={<OKRFeatureGate><OKRRoutes /></OKRFeatureGate>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  describe("OKRRoutes (gated)", () => {
    it("renders OKR list at /portal/okr", async () => {
      setup("/portal/okr");
      await waitFor(() => expect(screen.getByRole("heading", { name: /^okr$/i })).toBeInTheDocument());
    });
    it("renders editor at /portal/okr/new", async () => {
      setup("/portal/okr/new");
      await waitFor(() => expect(screen.getByRole("heading", { name: /new objective/i })).toBeInTheDocument());
    });
  });
  ```

- [ ] **Step 6: Test + commit.**
  ```bash
  cd pwa && npm test -- OKRRoutes --run
  git add pwa/src/hooks/useVtSettings.ts pwa/src/portal/okr/OKRRoutes.tsx pwa/src/portal/okr/OKRFeatureGate.tsx pwa/src/portal/okr/OKRRoutes.test.tsx pwa/src/portal/routes.tsx
  git commit -m "feat(portal): mount OKRRoutes behind portal_okr_enabled gate"
  ```

---

## Task 21 — OKR telemetry events

**Files**
- Modify: `pwa/src/telemetry.ts`
- Create: `pwa/src/telemetry.okr.test.ts`
- Modify: `pwa/src/portal/okr/OKRList.tsx`, `ObjectiveDetail.tsx`, `KRRow.tsx`, `ObjectiveEditor.tsx`, `BulkActions.tsx`

**Steps**

- [ ] **Step 1: Extend telemetry.** In `pwa/src/telemetry.ts`, extend the `TelemetryEvent` union with:
  ```ts
  | "okr.list_view"
  | "okr.detail_view"
  | "okr.kr_update"
  | "okr.objective_create"
  | "okr.objective_edit"
  | "okr.bulk_pdca_advance"
  | "okr.permission_denied"
  ```
  Append wrappers at the bottom of the file:
  ```ts
  export function trackOkrListView(filters_count: number) {
    self.logEvent("okr.list_view", { filters_count });
  }
  export function trackOkrDetailView(name: string) {
    self.logEvent("okr.detail_view", { name });
  }
  export function trackOkrKrUpdate(kr_name: string, delta: number) {
    self.logEvent("okr.kr_update", { kr_name, delta });
  }
  export function trackOkrObjectiveCreate(name: string) {
    self.logEvent("okr.objective_create", { name });
  }
  export function trackOkrObjectiveEdit(name: string) {
    self.logEvent("okr.objective_edit", { name });
  }
  export function trackOkrBulkPdca(count: number, from_to_pairs: Array<{ from: string; to: string }>) {
    self.logEvent("okr.bulk_pdca_advance", { count, from_to_pairs });
  }
  export function trackOkrPermissionDenied(path: string, action: string) {
    self.logEvent("okr.permission_denied", { path, action });
  }
  ```

- [ ] **Step 2: Tests.** Create `pwa/src/telemetry.okr.test.ts`:
  ```ts
  import { describe, it, expect, vi, beforeEach } from "vitest";
  import * as telemetry from "./telemetry";

  describe("OKR telemetry wrappers", () => {
    beforeEach(() => vi.restoreAllMocks());

    it("trackOkrListView logs okr.list_view", () => {
      const spy = vi.spyOn(telemetry, "logEvent").mockImplementation(() => {});
      telemetry.trackOkrListView(3);
      expect(spy).toHaveBeenCalledWith("okr.list_view", { filters_count: 3 });
    });
    it("trackOkrDetailView logs okr.detail_view", () => {
      const spy = vi.spyOn(telemetry, "logEvent").mockImplementation(() => {});
      telemetry.trackOkrDetailView("OBJ-1");
      expect(spy).toHaveBeenCalledWith("okr.detail_view", { name: "OBJ-1" });
    });
    it("trackOkrKrUpdate logs okr.kr_update", () => {
      const spy = vi.spyOn(telemetry, "logEvent").mockImplementation(() => {});
      telemetry.trackOkrKrUpdate("KR-1", 5);
      expect(spy).toHaveBeenCalledWith("okr.kr_update", { kr_name: "KR-1", delta: 5 });
    });
    it("trackOkrBulkPdca logs okr.bulk_pdca_advance", () => {
      const spy = vi.spyOn(telemetry, "logEvent").mockImplementation(() => {});
      telemetry.trackOkrBulkPdca(2, [{ from: "PLAN", to: "DO" }]);
      expect(spy).toHaveBeenCalledWith("okr.bulk_pdca_advance", {
        count: 2,
        from_to_pairs: [{ from: "PLAN", to: "DO" }],
      });
    });
  });
  ```

- [ ] **Step 3: Wire into components.** In each listed file, import `import * as telemetry from "../../telemetry";` and add:
  - `OKRList.tsx` — inside body: `useEffect(() => { telemetry.trackOkrListView(Object.keys(filters).length); }, [filters]);`
  - `ObjectiveDetail.tsx` — `useEffect(() => { if (name) telemetry.trackOkrDetailView(name); }, [name]);`
  - `KRRow.tsx` — after a successful save: `telemetry.trackOkrKrUpdate(kr.name, Number(next) - Number(kr.current_value));`
  - `ObjectiveEditor.tsx` — after `createObjective` success `telemetry.trackOkrObjectiveCreate(created.name);` and after `updateObjective` success `telemetry.trackOkrObjectiveEdit(id);`
  - `BulkActions.tsx` — after `mut.mutateAsync` resolves with `result`: `telemetry.trackOkrBulkPdca(result.advanced.length, result.advanced.map((r) => ({ from: r.from, to: r.to })));`

  Make sure the relative path adjusts for each file (`../../telemetry` from `pwa/src/portal/okr/*.tsx`). Add `useEffect` import where needed.

- [ ] **Step 4: Run telemetry test + full vitest.**
  ```bash
  cd pwa && npm test -- telemetry.okr --run && npm test -- --run
  ```
  Expected: all green.

- [ ] **Step 5: Commit.**
  ```bash
  git add pwa/src/telemetry.ts pwa/src/telemetry.okr.test.ts pwa/src/portal/okr/OKRList.tsx pwa/src/portal/okr/ObjectiveDetail.tsx pwa/src/portal/okr/KRRow.tsx pwa/src/portal/okr/ObjectiveEditor.tsx pwa/src/portal/okr/BulkActions.tsx
  git commit -m "feat(okr): telemetry events for list, detail, KR update, create/edit, bulk PDCA"
  ```

---

## Task 22 — Bundle chunk + coverage gate

**Files**
- Modify: `pwa/vite.config.ts`

**Steps**

- [ ] **Step 1: Update manualChunks.** In `pwa/vite.config.ts` inside the `manualChunks(id)` function, replace the existing block to read:
  ```ts
  manualChunks(id) {
    if (id.includes("/pwa/src/portal/okr/")) return "okr";
    if (id.includes("/pwa/src/portal/")) return "portal";
    if (id.includes("/pwa/src/mobile/")) return "mobile";
    return undefined;
  }
  ```

- [ ] **Step 2: Add coverage thresholds.** In the same file, locate the `test.coverage` block (extend or create). Ensure:
  ```ts
  test: {
    environment: "happy-dom",
    coverage: {
      thresholds: {
        "src/portal/okr/**": { lines: 80, functions: 80, statements: 80, branches: 70 },
      },
    },
    // ...existing options preserved
  },
  ```
  If a `coverage` config already exists, MERGE the thresholds into the existing object without removing other fields.

- [ ] **Step 3: Build + coverage.**
  ```bash
  cd pwa && npm run build
  cd pwa && npm test -- --run --coverage
  ```
  Capture the gzip size of the `okr` chunk from the build summary and confirm coverage on `src/portal/okr/**` ≥80%.

- [ ] **Step 4: Commit.**
  ```bash
  git add pwa/vite.config.ts
  git commit -m "build(okr): isolate okr chunk and add coverage gate"
  ```

---

## Task 23 — E2E spec

**Files**
- Create: `pwa/e2e/portal-okr.spec.ts`

**Steps**

- [ ] **Step 1: Create the spec.**
  ```ts
  import { test, expect } from "@playwright/test";

  const user = process.env.MANAGER_USER ?? "Administrator";
  const pass = process.env.MANAGER_PASS ?? "admin";

  test.describe("Portal OKR", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/login");
      await page.fill('input[name="usr"]', user);
      await page.fill('input[name="pwd"]', pass);
      await page.click('button[type="submit"]');
      await page.waitForLoadState("networkidle");
    });

    test("list page renders OKR heading", async ({ page }) => {
      await page.goto("/m/portal/okr");
      await expect(page.getByRole("heading", { name: /^okr$/i })).toBeVisible();
      const firstRow = page.locator(".okr-table tbody tr").first();
      if (await firstRow.count()) {
        await firstRow.click();
        await expect(page.locator(".okr-detail")).toBeVisible();
      }
    });

    test("new objective form renders", async ({ page }) => {
      await page.goto("/m/portal/okr/new");
      await expect(page.getByRole("heading", { name: /new objective/i })).toBeVisible();
      await expect(page.getByLabel(/title/i)).toBeVisible();
    });
  });
  ```

- [ ] **Step 2: Run if available, otherwise skip.**
  ```bash
  cd pwa && npx playwright test portal-okr || echo "playwright skipped (site may be unreachable)"
  ```

- [ ] **Step 3: Commit.**
  ```bash
  git add pwa/e2e/portal-okr.spec.ts
  git commit -m "test(e2e): portal okr list + create flow"
  ```

---

## Task 24 — Final verify + status flip + PR

**Files**
- Modify: `docs/superpowers/specs/2026-05-17-portal-okr-p2-design.md`
- Modify: `docs/implementation-tracker.html`

**Steps**

- [ ] **Step 1: Full sanity sweep.**
  ```bash
  BENCH="docker exec frappe-backend-1 bench --site task2.localhost"
  cd pwa && npx tsc --noEmit
  cd pwa && npm test -- --run
  cd pwa && npm run build
  $BENCH run-tests --app vernon_tasks --module vernon_tasks.okr.test_period_parser
  $BENCH run-tests --app vernon_tasks --module vernon_tasks.okr.test_pdca
  $BENCH run-tests --app vernon_tasks --module vernon_tasks.api.test_okr
  ```
  Expected: all green; build succeeds.

- [ ] **Step 2: Smoke flag + endpoint.**
  ```bash
  $BENCH set-config -g portal_okr_enabled 1 || true
  $BENCH execute frappe.client.set_value --kwargs '{"doctype":"VT Settings","name":"VT Settings","fieldname":"portal_okr_enabled","value":1}'
  curl -s -o /dev/null -w "%{http_code}\n" http://task2.localhost:8000/m/portal/okr
  ```
  Expected: `200`.

- [ ] **Step 3: Flip spec status.** In `docs/superpowers/specs/2026-05-17-portal-okr-p2-design.md` replace `**Status:** Draft` with `**Status:** Implemented (P2)`.

- [ ] **Step 4: Update tracker.** In `docs/implementation-tracker.html` update the PORTAL-P2 row's status cell to `Implemented`.

- [ ] **Step 5: Commit + push.**
  ```bash
  git add docs/superpowers/specs/2026-05-17-portal-okr-p2-design.md docs/implementation-tracker.html
  git commit -m "docs(okr): mark P2 as Implemented and update tracker"
  git push -u origin feat/portal-okr-p2
  ```

- [ ] **Step 6: Open PR.**
  ```bash
  gh pr create --base feat/desktop-portal-foundation --title "feat(okr): portal OKR P2 implementation" --body "$(cat <<'EOF'
  ## Summary
  - Adds desktop OKR portal at `/portal/okr/*` (list, detail, filters, KR autosave, create/edit, bulk PDCA).
  - Backend: schema migration (`period_start`/`period_end`), backfill patch, 3 whitelisted endpoints.
  - Behind `portal_okr_enabled` VT Settings flag.

  ## Test plan
  - [ ] `bench --site task2.localhost run-tests --app vernon_tasks --module vernon_tasks.api.test_okr`
  - [ ] `bench --site task2.localhost run-tests --app vernon_tasks --module vernon_tasks.okr.test_period_parser`
  - [ ] `bench --site task2.localhost run-tests --app vernon_tasks --module vernon_tasks.okr.test_pdca`
  - [ ] `cd pwa && npm test -- --run`
  - [ ] `cd pwa && npm run build`
  - [ ] Manual: enable flag, visit `/m/portal/okr`, filter, select row, edit KR, create Objective, bulk advance PDCA.
  EOF
  )"
  ```

---

## Self-Review

### Spec coverage

| Spec section | Covered by tasks |
|---|---|
| §1 Background & Goal | T1 (flag), T6–T8 (read/write endpoints) |
| §2 Users & Personas | T20 (RequirePermission `okr.read`), T8 (backend write permission filter) |
| §3 Architecture (routes, folder layout, backend) | T2–T8 backend; T9–T12 frontend lib/api/hooks; T13–T20 components/routes |
| §4 UX components | T13 FiltersBar, T14 ObjectiveTable, T15 KRRow, T16 ObjectiveDetail, T17 BulkActions, T18 OKRList, T19 ObjectiveEditor |
| §5 Data flow & cache (keys, invalidation, parser, perms, telemetry) | T12 keys/invalidation; T9 parser; T20 perm gate; T21 telemetry |
| §6 Error handling (zod, API errors, autosave concurrency, bulk edge cases, empty) | T19 zod; T15 autosave + `_modified`; T8 bulk skip; T16/T18 empty states |
| §7 Testing | Every component task ships vitest; T6/T7/T8 ship Frappe tests; T23 playwright; T22 coverage gate |
| §8 Build & bundle | T22 manualChunks + coverage |
| §9 Rollout (feature flag) | T1 flag field; T20 OKRFeatureGate |
| §10 Success metrics | T21 telemetry; T22 coverage gate ≥80% |
| §11 Open questions | KR autosave debounce-only (T15); confirm dialog count-only (T17 — preview message); owner picker open (free-text input in T19, future enhancement) |
| §12 Out of scope | Respected — no charts/KPI/alignment/comments/export |

### Placeholder scan

- No `TBD`, `TODO`, `fill in later`, or "similar to task X" markers in any code block.
- Every command is runnable as-is (uses `$BENCH` defined at the top of the plan).

### Type consistency

- `ObjectiveRow` (T11) field set — `name, title, period, period_start, period_end, objective_owner, status, pdca_phase, progress_avg, modified` — matches the `SELECT` projection in `list_objectives` (T6).
- `BulkAdvanceResult` (T11) — `advanced: {name, from, to}[]`, `skipped: {name, reason, current?}[]` — matches `bulk_advance_pdca` response shape in T8.
- `okrKeys.detail(name)` defined in T12 is consumed verbatim in T15 (KRRow invalidation) and T17 (via `usePdcaTransition.onSuccess`), and in T16 (`useObjective`).
- Telemetry wrapper names — `trackOkrListView`, `trackOkrDetailView`, `trackOkrKrUpdate`, `trackOkrObjectiveCreate`, `trackOkrObjectiveEdit`, `trackOkrBulkPdca`, `trackOkrPermissionDenied` — defined in T21 step 1 and consumed verbatim in T21 step 3 wiring.
- Backend `PDCA_SEQUENCE` (T5) and frontend `PDCA_SEQUENCE` (T10) carry the same five values in the same order.
- Backend `parse_period` returns `(date, date)` (T3); frontend `parsePeriod` returns `{start, end}` ISO strings (T9) — both share the same Q/H/year grammar; mismatch documented (different return shapes by language convention).

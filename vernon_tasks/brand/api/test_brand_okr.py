import datetime

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, today

from vernon_tasks.brand.api import brand_okr

TEST_BRAND = "TestBrandOKR-Z"
EMPTY_BRAND = "TestBrandOKR-Empty"
FLOW_BRAND = "TestBrandFlow-Z"


def _current_quarter_label() -> str:
    """Return the period label for the quarter that contains today, e.g. '2026-Q2'."""
    d = datetime.date.fromisoformat(today())
    q = (d.month - 1) // 3 + 1
    return f"{d.year}-Q{q}"


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
        # zero-target KR ignored -> mean over {50.0} = 50.0
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
        self._current_quarter = _current_quarter_label()
        frappe.get_doc({"doctype": "VT Brand", "brand_name": TEST_BRAND}).insert(
            ignore_permissions=True)
        self.obj_current = frappe.get_doc({
            "doctype": "Objective", "title": "Current Obj", "brand": TEST_BRAND,
            "period": self._current_quarter,
            "period_start": today(), "period_end": today(),
            "objective_owner": "Administrator",
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
        self.assertEqual([p["period"] for p in res["periods"]], [self._current_quarter, "2025-Q1"])

    def test_key_results_attached(self):
        res = brand_okr.get_brand_okr(TEST_BRAND)
        current = next(p for p in res["periods"] if p["period"] == self._current_quarter)
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
        current = next((p for p in res["periods"] if p.get("is_current")), None)
        self.assertIsNotNone(current, "seeded current-quarter objective should be the current period")
        self.assertEqual(summary["active_period"]["period"], current["period"])
        self.assertEqual(summary["active_period"]["progress"], current["progress"])

        execution = res["execution"]
        for key in ("project_count", "active_sprint_count", "remaining_tasks",
                    "remaining_minutes", "total_minutes", "progress_pct", "projects"):
            self.assertIn(key, execution)

    def test_get_brand_okr_attaches_owner_display(self):
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


class TestKpiHelpers(FrappeTestCase):
    """Pure-function tests for KPI progress + trend (no DB).

    spec: 2026-06-07-brand-detail-flow-zones
    """

    def test_kpi_progress_none_when_target_not_positive(self):
        # Float defaults to 0 (never None) for untouched rows -> target>0 is the
        # only safe "has target" discriminator.
        self.assertIsNone(brand_okr._kpi_progress(50, 0))
        self.assertIsNone(brand_okr._kpi_progress(50, None))
        self.assertIsNone(brand_okr._kpi_progress(50, -5))

    def test_kpi_progress_ratio_unclamped(self):
        self.assertEqual(brand_okr._kpi_progress(50, 100), 50.0)
        # over-performance is meaningful for a single KPI -> not clamped at 100
        self.assertEqual(brand_okr._kpi_progress(150, 100), 150.0)

    def test_kpi_progress_handles_none_value(self):
        self.assertEqual(brand_okr._kpi_progress(None, 100), 0.0)

    def test_kpi_trend(self):
        self.assertEqual(brand_okr._kpi_trend(10, 5), "up")
        self.assertEqual(brand_okr._kpi_trend(5, 10), "down")
        self.assertEqual(brand_okr._kpi_trend(5, 5), "flat")
        self.assertEqual(brand_okr._kpi_trend(5, None), "none")
        self.assertEqual(brand_okr._kpi_trend(None, None), "none")


class TestBrandOkrProjectsBridge(FrappeTestCase):
    """_group_by_period attaches linked projects per objective (the OKR↔Project bridge)."""

    def _obj(self):
        return [{"name": "O1", "title": "A", "status": "Open", "pdca_phase": "PLAN",
                 "objective_owner": None, "period": "2026-Q1",
                 "period_start": "2026-01-01", "period_end": "2026-03-31"}]

    def test_projects_attached_from_map(self):
        projects = {"O1": [{"id": "P1", "title": "Proj", "progress": 30, "status": "Open"}]}
        periods = brand_okr._group_by_period(self._obj(), {}, projects)
        self.assertEqual(periods[0]["objectives"][0]["projects"], projects["O1"])

    def test_objective_without_projects_has_empty_list(self):
        periods = brand_okr._group_by_period(self._obj(), {}, None)
        self.assertEqual(periods[0]["objectives"][0]["projects"], [])


class TestBrandOkrFlowZones(FrappeTestCase):
    """End-to-end: KPI block + project bridge + execution objective_title.

    spec: 2026-06-07-brand-detail-flow-zones
    """

    def setUp(self):
        frappe.set_user("Administrator")
        self._cleanup()
        frappe.get_doc({"doctype": "VT Brand", "brand_name": FLOW_BRAND}).insert(
            ignore_permissions=True)
        self.obj = frappe.get_doc({
            "doctype": "Objective", "title": "Flow Obj", "brand": FLOW_BRAND,
            "period": "2026-Q2", "objective_owner": "Administrator",
            "status": "Open", "pdca_phase": "PLAN"}).insert(ignore_permissions=True)
        self.project = frappe.get_doc({
            "doctype": "VT Project", "title": "Flow Project", "brand": FLOW_BRAND,
            "project_owner": "Administrator", "objective": self.obj.name,
            "start_date": today(), "end_date": add_days(today(), 7)}).insert(ignore_permissions=True)
        self.kpi = frappe.get_doc({
            "doctype": "KPI Definition", "kpi_name": "Flow KPI Z", "brand": FLOW_BRAND,
            "frequency": "Daily", "unit": "%", "target_value": 100,
            "objective": self.obj.name}).insert(ignore_permissions=True)
        frappe.get_doc({"doctype": "KPI Entry", "kpi_definition": self.kpi.name,
            "date": add_days(today(), -1), "value": 40}).insert(ignore_permissions=True)
        frappe.get_doc({"doctype": "KPI Entry", "kpi_definition": self.kpi.name,
            "date": today(), "value": 60}).insert(ignore_permissions=True)

    def tearDown(self):
        self._cleanup()

    def _cleanup(self):
        for d in frappe.get_all("KPI Definition", filters={"brand": FLOW_BRAND}, pluck="name"):
            for e in frappe.get_all("KPI Entry", filters={"kpi_definition": d}, pluck="name"):
                frappe.delete_doc("KPI Entry", e, force=True, ignore_permissions=True)
            frappe.delete_doc("KPI Definition", d, force=True, ignore_permissions=True)
        for p in frappe.get_all("VT Project", filters={"brand": FLOW_BRAND}, pluck="name"):
            frappe.delete_doc("VT Project", p, force=True, ignore_permissions=True)
        for o in frappe.get_all("Objective", filters={"brand": FLOW_BRAND}, pluck="name"):
            frappe.delete_doc("Objective", o, force=True, ignore_permissions=True)
        if frappe.db.exists("VT Brand", FLOW_BRAND):
            frappe.delete_doc("VT Brand", FLOW_BRAND, force=True, ignore_permissions=True)

    def test_kpis_block_shape(self):
        res = brand_okr.get_brand_okr(FLOW_BRAND)
        self.assertEqual(res["summary"]["kpi_count"], 1)
        kpi = res["kpis"][0]
        self.assertEqual(kpi["title"], "Flow KPI Z")
        self.assertEqual(kpi["target"], 100.0)
        self.assertEqual(kpi["value"], 60.0)
        self.assertEqual(kpi["prev_value"], 40.0)
        self.assertEqual(kpi["progress"], 60.0)
        self.assertEqual(kpi["trend"], "up")
        self.assertEqual(kpi["objective_title"], "Flow Obj")

    def test_project_bridge_on_objective(self):
        res = brand_okr.get_brand_okr(FLOW_BRAND)
        obj = res["periods"][0]["objectives"][0]
        self.assertEqual(len(obj["projects"]), 1)
        self.assertEqual(obj["projects"][0]["id"], self.project.name)

    def test_execution_projects_have_objective_title(self):
        res = brand_okr.get_brand_okr(FLOW_BRAND)
        proj = next(p for p in res["execution"]["projects"] if p["id"] == self.project.name)
        self.assertEqual(proj["objective_title"], "Flow Obj")

    def test_kpi_without_target_has_none_progress(self):
        k2 = frappe.get_doc({"doctype": "KPI Definition", "kpi_name": "Flow KPI NoTarget",
            "brand": FLOW_BRAND, "frequency": "Daily"}).insert(ignore_permissions=True)
        frappe.get_doc({"doctype": "KPI Entry", "kpi_definition": k2.name,
            "date": today(), "value": 5}).insert(ignore_permissions=True)
        res = brand_okr.get_brand_okr(FLOW_BRAND)
        nt = next(k for k in res["kpis"] if k["title"] == "Flow KPI NoTarget")
        self.assertIsNone(nt["progress"])
        self.assertEqual(nt["value"], 5.0)

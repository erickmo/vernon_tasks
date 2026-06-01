import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, today
from vernon_tasks.task.services.kpi_trend_service import get_kpi_trend, list_kpis

_FIXTURE_BRAND = "TEST-KPI-TREND-BRAND"


def _ensure_brand():
    if not frappe.db.exists("VT Brand", _FIXTURE_BRAND):
        frappe.get_doc({
            "doctype": "VT Brand",
            "brand_name": _FIXTURE_BRAND,
        }).insert(ignore_permissions=True)
    return _FIXTURE_BRAND


def _make_kpi(name, unit="%"):
    for n in frappe.get_all("KPI Definition", {"kpi_name": name}, ["name"]):
        # Delete child KPI Entries first; on_trash blocks delete while entries exist.
        for entry in frappe.get_all("KPI Entry", {"kpi_definition": n["name"]}, ["name"]):
            frappe.delete_doc("KPI Entry", entry["name"], force=True)
        frappe.delete_doc("KPI Definition", n["name"], force=True)
    return frappe.get_doc({
        "doctype": "KPI Definition",
        "kpi_name": name,
        "brand": _ensure_brand(),
        "frequency": "Monthly",
        "unit": unit,
    }).insert(ignore_permissions=True)


def _make_entry(kpi_name, value, days_ago):
    return frappe.get_doc({
        "doctype": "KPI Entry",
        "kpi_definition": kpi_name,
        "date": add_days(today(), -days_ago),
        "value": value,
    }).insert(ignore_permissions=True)


class TestKPITrend(FrappeTestCase):
    def setUp(self):
        self.kpi = _make_kpi("KPI-Trend-Test", unit="%")
        # Clean up any leftover entries from previous runs
        for entry in frappe.get_all("KPI Entry", {"kpi_definition": self.kpi.name}, ["name"]):
            frappe.delete_doc("KPI Entry", entry["name"], force=True)
        _make_entry(self.kpi.name, 10, 90)
        _make_entry(self.kpi.name, 20, 60)
        _make_entry(self.kpi.name, 30, 30)

    def test_trend_ordered_asc_by_date(self):
        r = get_kpi_trend(self.kpi.name, periods=12)
        self.assertEqual(r["values"], [10.0, 20.0, 30.0])
        self.assertEqual(r["unit"], "%")
        self.assertEqual(r["kpi_name"], "KPI-Trend-Test")
        self.assertEqual(len(r["labels"]), 3)

    def test_limits_to_periods(self):
        _make_entry(self.kpi.name, 40, 15)
        r = get_kpi_trend(self.kpi.name, periods=2)
        # Last 2 entries by date: 30 (30d ago), 40 (15d ago)
        self.assertEqual(r["values"], [30.0, 40.0])

    def test_unknown_kpi_raises(self):
        with self.assertRaises(frappe.DoesNotExistError):
            get_kpi_trend("nonexistent-kpi-name")

    def test_list_kpis_includes_test(self):
        kpis = list_kpis()
        names = [k["kpi_name"] for k in kpis]
        self.assertIn("KPI-Trend-Test", names)

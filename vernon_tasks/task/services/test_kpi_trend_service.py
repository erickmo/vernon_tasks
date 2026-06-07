import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, today
from vernon_tasks.task.services.kpi_trend_service import get_kpi_trend, list_kpis

_KPI_TITLE = "KPI-Trend-Test"


def _delete_kpi_nodes(title):
	# KPI nodes are VT Item rows (node_type="KPI"); entries live in the
	# child table, so deleting the node removes them too.
	for n in frappe.get_all(
		"VT Item", {"node_type": "KPI", "title": title}, ["name"]
	):
		frappe.delete_doc("VT Item", n["name"], force=True)


def _make_kpi(title, unit="%", entries=None):
	_delete_kpi_nodes(title)
	doc = frappe.get_doc({
		"doctype": "VT Item",
		"node_type": "KPI",
		"title": title,
		"frequency": "Monthly",
		"unit": unit,
		"kpi_entries": entries or [],
	})
	doc.insert(ignore_permissions=True)
	return doc


def _entry(value, days_ago):
	return {"date": add_days(today(), -days_ago), "value": value}


class TestKPITrend(FrappeTestCase):
	def setUp(self):
		self.kpi = _make_kpi("KPI-Trend-Test", unit="%", entries=[
			_entry(10, 90),
			_entry(20, 60),
			_entry(30, 30),
		])

	def test_trend_ordered_asc_by_date(self):
		r = get_kpi_trend(self.kpi.name, periods=12)
		self.assertEqual(r["values"], [10.0, 20.0, 30.0])
		self.assertEqual(r["unit"], "%")
		self.assertEqual(r["kpi_name"], "KPI-Trend-Test")
		self.assertEqual(len(r["labels"]), 3)

	def test_limits_to_periods(self):
		self.kpi.append("kpi_entries", _entry(40, 15))
		self.kpi.save(ignore_permissions=True)
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

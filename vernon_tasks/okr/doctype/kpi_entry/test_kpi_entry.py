import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import today

KPI_NAME = "Sales Revenue Unique Test 002"


def create_kpi():
    if not frappe.db.exists("KPI Definition", KPI_NAME):
        frappe.get_doc({
            "doctype": "KPI Definition",
            "kpi_name": KPI_NAME,
            "frequency": "Daily",
            "unit": "IDR",
        }).insert(ignore_permissions=True)


class TestKPIEntry(FrappeTestCase):
    def setUp(self):
        create_kpi()

    def test_create_kpi_entry(self):
        doc = frappe.get_doc({
            "doctype": "KPI Entry",
            "kpi_definition": KPI_NAME,
            "date": today(),
            "value": 5000000.0,
        })
        doc.insert(ignore_permissions=True)
        self.assertEqual(doc.value, 5000000.0)
        doc.delete()

    def test_value_required(self):
        doc = frappe.get_doc({
            "doctype": "KPI Entry",
            "kpi_definition": KPI_NAME,
            "date": today(),
        })
        with self.assertRaises(Exception):
            doc.insert(ignore_permissions=True)

    def tearDown(self):
        frappe.db.delete("KPI Entry", {"kpi_definition": KPI_NAME})

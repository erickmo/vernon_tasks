import frappe
from frappe.tests.utils import FrappeTestCase


class TestKPIDefinition(FrappeTestCase):
    def test_create_kpi_definition(self):
        doc = frappe.get_doc({
            "doctype": "KPI Definition",
            "kpi_name": "Test KPI Unique 001",
            "frequency": "Daily",
            "unit": "%",
        })
        doc.insert(ignore_permissions=True)
        self.assertEqual(doc.name, "Test KPI Unique 001")
        doc.delete()

    def test_invalid_frequency_raises(self):
        doc = frappe.get_doc({
            "doctype": "KPI Definition",
            "kpi_name": "Bad Freq KPI",
            "frequency": "Quarterly",
        })
        with self.assertRaises(Exception):
            doc.insert(ignore_permissions=True)

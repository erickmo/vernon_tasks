import frappe
from frappe.tests.utils import FrappeTestCase


class TestRiskEvent(FrappeTestCase):
    def test_invalid_severity_rejected(self):
        with self.assertRaises(frappe.ValidationError):
            frappe.get_doc({
                "doctype": "Risk Event",
                "project": "_dummy_",
                "reason": "x",
                "severity": "EVIL",
            }).insert(ignore_permissions=True, ignore_links=True)

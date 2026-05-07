import frappe
from frappe.tests.utils import FrappeTestCase

TEST_USER = "test_okr@example.com"


def make_objective():
    if not frappe.db.exists("User", TEST_USER):
        frappe.get_doc({
            "doctype": "User", "email": TEST_USER,
            "first_name": "OKR", "last_name": "Test",
            "enabled": 1, "roles": [{"role": "VT Manager"}]
        }).insert(ignore_permissions=True)
    obj = frappe.get_doc({
        "doctype": "Objective",
        "title": "Test KR Objective",
        "period": "2026-Q2",
        "objective_owner": TEST_USER,
        "pdca_phase": "PLAN",
        "status": "Open",
    })
    obj.insert(ignore_permissions=True)
    return obj


class TestKeyResult(FrappeTestCase):
    def setUp(self):
        self.obj = make_objective()

    def test_create_key_result(self):
        kr = frappe.get_doc({
            "doctype": "Key Result",
            "objective": self.obj.name,
            "metric": "Active Users",
            "target_value": 1000,
            "current_value": 0,
            "unit": "users",
        })
        kr.insert(ignore_permissions=True)
        self.assertTrue(kr.name.startswith("KR-"))
        kr.delete()

    def test_progress_percent_computed(self):
        kr = frappe.get_doc({
            "doctype": "Key Result",
            "objective": self.obj.name,
            "metric": "Revenue",
            "target_value": 100,
            "current_value": 75,
            "unit": "%",
        })
        kr.insert(ignore_permissions=True)
        self.assertEqual(kr.progress_percent, 75.0)
        kr.delete()

    def test_target_zero_raises(self):
        kr = frappe.get_doc({
            "doctype": "Key Result",
            "objective": self.obj.name,
            "metric": "Bad Metric",
            "target_value": 0,
            "current_value": 0,
        })
        with self.assertRaises(frappe.ValidationError):
            kr.insert(ignore_permissions=True)

    def test_current_exceeds_target_capped_at_100(self):
        kr = frappe.get_doc({
            "doctype": "Key Result",
            "objective": self.obj.name,
            "metric": "Overperform",
            "target_value": 100,
            "current_value": 150,
            "unit": "units",
        })
        kr.insert(ignore_permissions=True)
        self.assertEqual(kr.progress_percent, 100.0)
        kr.delete()

    def tearDown(self):
        self.obj.delete()

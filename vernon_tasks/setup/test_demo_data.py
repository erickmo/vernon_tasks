# Tests for optional demo data load/clear.
import json
import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_tasks.setup.demo_data import load, clear

_USER = "demo_onboard@test.local"


def _ensure_user(email):
    if not frappe.db.exists("User", email):
        frappe.get_doc({
            "doctype": "User", "email": email, "first_name": "Demo",
            "send_welcome_email": 0, "enabled": 1,
        }).insert(ignore_permissions=True)
    return email


class TestDemoData(FrappeTestCase):
    def setUp(self):
        self.user = _ensure_user(_USER)
        clear()  # start clean

    def tearDown(self):
        clear()
        frappe.set_user("Administrator")

    def test_load_creates_refs_and_records(self):
        result = load(self.user)
        refs = json.loads(frappe.db.get_single_value("VT Settings", "demo_data_refs") or "[]")
        self.assertGreaterEqual(len(refs), 5)  # brand + project + sprint + 3 tasks (team_members are child rows, not separate docs)
        self.assertEqual(result["tasks"], 3)
        self.assertTrue(frappe.db.exists("VT Project", {"project_owner": self.user}))

    def test_load_twice_is_noop(self):
        load(self.user)
        first = json.loads(frappe.db.get_single_value("VT Settings", "demo_data_refs") or "[]")
        load(self.user)
        second = json.loads(frappe.db.get_single_value("VT Settings", "demo_data_refs") or "[]")
        self.assertEqual(len(first), len(second))

    def test_clear_removes_everything(self):
        load(self.user)
        clear()
        refs = frappe.db.get_single_value("VT Settings", "demo_data_refs")
        self.assertIn(refs, (None, "", "[]"))
        self.assertFalse(frappe.db.exists("VT Task", {"assigned_to": self.user, "title": "Demo: Siapkan brief"}))

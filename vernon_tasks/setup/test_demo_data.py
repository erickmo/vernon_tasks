# Tests for optional demo data load/clear.
import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_tasks.setup.demo_data import load, clear, _get_refs

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
        clear(self.user)  # start clean

    def tearDown(self):
        clear(self.user)
        frappe.set_user("Administrator")

    def test_load_creates_refs_and_records(self):
        result = load(self.user)
        refs = _get_refs(self.user)
        self.assertGreaterEqual(len(refs), 5)  # brand + project + sprint + 3 tasks (team_members are child rows, not separate docs)
        self.assertEqual(result["tasks"], 3)
        self.assertTrue(frappe.db.exists(
            "VT Item", {"node_type": "Project", "owner_user": self.user}))

    def test_load_twice_is_noop(self):
        load(self.user)
        first = _get_refs(self.user)
        load(self.user)
        second = _get_refs(self.user)
        self.assertEqual(len(first), len(second))

    def test_clear_removes_everything(self):
        load(self.user)
        clear(self.user)
        self.assertEqual(_get_refs(self.user), [])
        self.assertFalse(frappe.db.exists(
            "VT Item",
            {"node_type": "Task", "owner_user": self.user, "title": "Demo: Siapkan brief"}))

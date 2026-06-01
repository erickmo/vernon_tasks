# Tests for idempotent navbar seeding.
import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_tasks.setup_website import ensure_navbar_seeded, _NAVBAR_ITEMS

_CHILD = "VT Navbar Item"


class TestEnsureNavbarSeeded(FrappeTestCase):
    def tearDown(self):
        frappe.db.rollback()

    def test_seeds_when_empty(self):
        frappe.db.delete(_CHILD, {"parenttype": "VT Settings"})
        frappe.db.commit()
        ensure_navbar_seeded()
        count = frappe.db.count(_CHILD, {"parenttype": "VT Settings"})
        self.assertEqual(count, len(_NAVBAR_ITEMS))

    def test_noop_when_rows_exist(self):
        frappe.db.delete(_CHILD, {"parenttype": "VT Settings"})
        doc = frappe.get_single("VT Settings")
        doc.append("navbar_items", {"label": "Custom", "route": "/app/x"})
        doc.save(ignore_permissions=True)
        frappe.db.commit()
        ensure_navbar_seeded()
        labels = frappe.db.get_all(_CHILD, filters={"parenttype": "VT Settings"}, pluck="label")
        self.assertEqual(labels, ["Custom"])  # preserved, not overwritten

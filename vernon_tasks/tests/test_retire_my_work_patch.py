"""Patch test: retire_my_work_page removes the orphaned Page + navbar row,
leaves vt-home intact, and is idempotent. PRD: merge-my-work-into-vt-home.
"""
import frappe
import unittest

_PATCH = "vernon_tasks.patches.v1_x.retire_my_work_page"
_PAGE = "my-work"
_ROUTE = "/app/my-work"
_VT_SETTINGS = "VT Settings"


def _run_patch():
    frappe.get_attr(_PATCH + ".execute")()


def _navbar_routes():
    doc = frappe.get_single(_VT_SETTINGS)
    return [(r.route or "") for r in doc.get("navbar_items") or []]


def _seed_old_install():
    """Recreate the pre-merge state: a my-work Page doc + a navbar row."""
    if not frappe.db.exists("Page", _PAGE):
        frappe.get_doc({
            "doctype": "Page",
            "name": _PAGE,
            "page_name": _PAGE,
            "title": "My Work",
            "module": "Task",
        }).insert(ignore_permissions=True)
    if _ROUTE not in _navbar_routes():
        settings = frappe.get_single(_VT_SETTINGS)
        settings.append("navbar_items", {
            "label": "My Work",
            "route": _ROUTE,
            "icon": "check-circle",
            "is_group": 0,
            "parent_group": "",
            "enabled": 1,
        })
        settings.save(ignore_permissions=True)


class TestRetireMyWorkPatch(unittest.TestCase):
    def test_removes_page_and_navbar_idempotently(self):  # PRD: merge-my-work-into-vt-home
        _seed_old_install()
        self.assertTrue(frappe.db.exists("Page", _PAGE))
        self.assertIn(_ROUTE, _navbar_routes())

        _run_patch()

        # Page + navbar row gone; vt-home untouched.
        self.assertFalse(frappe.db.exists("Page", _PAGE))
        self.assertNotIn(_ROUTE, _navbar_routes())
        self.assertTrue(frappe.db.exists("Page", "vt-home"))

        # Re-run: no error, still gone.
        _run_patch()
        self.assertFalse(frappe.db.exists("Page", _PAGE))
        self.assertNotIn(_ROUTE, _navbar_routes())

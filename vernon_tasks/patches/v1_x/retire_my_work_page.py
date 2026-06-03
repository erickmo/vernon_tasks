"""Retire the standalone "my-work" desk Page (merged into vt-home).

The My Work page (My Day / What To Do Today / My Blocked Tasks + Start /
Submit-for-Review actions) became the "Tugas Saya" tab inside vt-home, and the
standalone /app/my-work route is removed. Two records outlive a code/dir delete
on an existing install and must be migrated once on `bench migrate`:

  1. The `Page` doc named "my-work" — standard pages are NOT auto-deleted when
     their app directory is removed.
  2. The VT Settings.navbar_items child row routing to /app/my-work — the seed
     (_NAVBAR_ITEMS) only governs fresh installs (ensure_navbar_seeded runs only
     when the navbar is empty).

Idempotent: a re-run finds the Page already gone and no /app/my-work navbar row,
so nothing changes and no save is issued.
"""
import frappe

_MY_WORK_PAGE = "my-work"
_MY_WORK_ROUTE = "/app/my-work"
_VT_SETTINGS = "VT Settings"
_NAVBAR_FIELD = "navbar_items"


def _drop_page() -> None:
    """Delete the orphaned standard Page doc if it still exists."""
    if frappe.db.exists("Page", _MY_WORK_PAGE):
        frappe.delete_doc("Page", _MY_WORK_PAGE, ignore_permissions=True, force=True)


def _drop_navbar_row() -> None:
    """Remove the VT Settings navbar row pointing at /app/my-work, preserving order."""
    doc = frappe.get_single(_VT_SETTINGS)
    survivors = []
    changed = False
    for row in doc.get(_NAVBAR_FIELD) or []:
        if (row.route or "") == _MY_WORK_ROUTE:
            changed = True
            continue
        survivors.append(row)
    if changed:
        doc.set(_NAVBAR_FIELD, survivors)
        doc.save(ignore_permissions=True)


def execute():
    _drop_page()
    _drop_navbar_row()
    frappe.db.commit()

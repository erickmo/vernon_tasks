# extend_bootinfo hook: inject the editable navbar2 menu so desk JS can read
# frappe.boot.vt_navbar_items without an extra HTTP round-trip.
import frappe

# Shown out-of-box when VT Settings.navbar_items is empty.
DEFAULT_NAVBAR = [
    {"label": "Home", "route": "/app/vt-home", "icon": "home"},
    {"label": "Project", "route": "/app/vt-projects", "icon": "folder-normal"},
]


def extend_bootinfo(bootinfo):
    rows = frappe.get_all(
        "VT Navbar Item",
        filters={"parenttype": "VT Settings", "enabled": 1},
        fields=["label", "route", "icon"],
        order_by="idx asc",
    )
    bootinfo.vt_navbar_items = rows or DEFAULT_NAVBAR

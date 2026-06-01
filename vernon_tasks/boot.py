"""extend_bootinfo hook: inject role-filtered navbar2 menu into frappe.boot.

Desk JS reads frappe.boot.vt_navbar_items without an extra HTTP round-trip.
Items with role_restriction set are filtered server-side so the client never
receives nav entries for roles the user does not hold.
"""
import frappe

DEFAULT_NAVBAR = [
    {"label": "Beranda", "route": "/app/vt-home", "icon": "home",
     "is_group": 0, "parent_group": "", "role_restriction": ""},
    {"label": "Proyek", "route": "/app/vt-projects", "icon": "folder-normal",
     "is_group": 0, "parent_group": "", "role_restriction": ""},
]


def _filter_by_roles(items: list, user_roles: set) -> list:
    """Return only items whose role_restriction is satisfied by user_roles.

    An empty role_restriction means the item is visible to all roles.
    """
    return [
        item for item in items
        if not item.get("role_restriction") or item["role_restriction"] in user_roles
    ]


def extend_bootinfo(bootinfo) -> None:
    """Inject filtered navbar items into frappe.boot."""
    rows = frappe.get_all(
        "VT Navbar Item",
        filters={"parenttype": "VT Settings", "enabled": 1},
        fields=["label", "route", "icon", "is_group", "parent_group", "role_restriction"],
        order_by="idx asc",
    )
    if not rows:
        bootinfo.vt_navbar_items = DEFAULT_NAVBAR
        return

    user_roles = set(frappe.get_roles())
    bootinfo.vt_navbar_items = _filter_by_roles(rows, user_roles)

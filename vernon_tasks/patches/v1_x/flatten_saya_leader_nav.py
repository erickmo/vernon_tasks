"""Flatten the "Saya" and "Leader" navbar dropdown groups into top-level links.

The personal (my-dashboard) and leader (leader-dashboard) dashboards were merged
into vt-home (Beranda + Tim tabs). Their dropdown group headers are now dead
shells (route="#"), so we remove the two headers and promote their remaining
child pages (My Work / Analytics / Scorecard and Review / Sprint Analytics / OKR /
Tim & Kapasitas) to top-level by clearing parent_group.

Why a patch (not just the seed): VT Navbar Item is NOT a fixture, and
setup_website.ensure_navbar_seeded() only seeds when the navbar is EMPTY. On an
existing install the live VT Settings.navbar_items rows would keep the old groups
forever. This patch migrates those existing rows once on `bench migrate`.

Idempotent: a re-run finds no legacy group header and no legacy parent_group, so
nothing changes and no save is issued.
"""
import frappe

# Labels of the dropdown groups being flattened. Kept private to this patch:
# the live seed (_NAVBAR_ITEMS) no longer references them, so they are legacy
# values only the migration needs.
_LEGACY_GROUP_LABELS = ("Saya", "Leader")

# Seeded placeholder route on the non-navigable group headers. Used to guard the
# delete so we never drop an admin-created link that merely shares the label.
_GROUP_PLACEHOLDER_ROUTE = "#"

_VT_SETTINGS = "VT Settings"
_NAVBAR_FIELD = "navbar_items"


def _is_legacy_header(row) -> bool:
    """True for a seeded Saya/Leader dropdown header (drop these)."""
    return (
        bool(row.is_group)
        and row.label in _LEGACY_GROUP_LABELS
        and (row.route or "") == _GROUP_PLACEHOLDER_ROUTE
    )


def execute():
    # VT Settings is a Single; mutate its child table via the doc API so idx
    # ordering stays consistent (boot.py renders order_by="idx asc").
    doc = frappe.get_single(_VT_SETTINGS)
    survivors = []
    changed = False

    # Preserve existing row order: filtering the list in place avoids the
    # reorder/clobber that rebuilding from a fixed template would cause.
    for row in doc.get(_NAVBAR_FIELD) or []:
        if _is_legacy_header(row):
            changed = True
            continue  # remove the dead group header
        if row.parent_group in _LEGACY_GROUP_LABELS:
            row.parent_group = ""  # promote former child to top-level
            changed = True
        survivors.append(row)

    if not changed:
        return  # already flat (fresh install or re-run) — no-op

    doc.set(_NAVBAR_FIELD, survivors)
    doc.save(ignore_permissions=True)
    frappe.db.commit()

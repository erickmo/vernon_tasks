"""Promote the "Brand" navbar link from the Admin dropdown to a top-level link.

Brand management (/app/vt-brands) was seeded as a child of the manager-only
"Admin" dropdown group. To make it easier to reach we surface it as a standalone
top-level navbar link, still VT-Manager-gated. The "Admin" group itself stays
(it keeps "Pengaturan").

Why a patch (not just the seed): VT Navbar Item is NOT a fixture, and
setup_website.ensure_navbar_seeded() only seeds when the navbar is EMPTY. On an
existing install the live VT Settings.navbar_items rows would keep the old
nesting forever, so this patch migrates those existing rows once on
`bench migrate`.

Install shapes handled:
  - Seeded after the Admin group existed: a Brand row sits under "Admin" -> we
    clear its parent_group (promote in place, order preserved).
  - Seeded before the Admin group existed: no Brand row at all (but other rows
    present) -> we append a top-level Brand row.
  - Empty navbar (fresh/wiped install) -> no-op, so the after_migrate
    ensure_navbar_seeded() hook can plant the full menu (Brand already
    top-level there). Patches run before that hook, so an early lone-Brand
    insert would otherwise suppress the full seed.

Idempotent: a re-run finds Brand already top-level (and present), so nothing
changes and no save is issued.
"""
import frappe

_VT_SETTINGS = "VT Settings"
_NAVBAR_FIELD = "navbar_items"

# Identity of the Brand link. route is the stable key (label could be renamed by
# an admin), so we match on route and only touch the brand-management entry.
_BRAND_ROUTE = "/app/vt-brands"
_ADMIN_GROUP_LABEL = "Admin"

# Top-level Brand row appended when no Brand link exists yet (pre-Admin-group
# installs). Mirrors the _NAVBAR_ITEMS seed entry: manager-only, badge icon.
_BRAND_ROW = dict(
    label="Brand",
    route=_BRAND_ROUTE,
    icon="badge",
    is_group=0,
    parent_group="",
    role_restriction="VT Manager",
    enabled=1,
)


def execute():
    # VT Settings is a Single; mutate its child table via the doc API so idx
    # ordering stays consistent (boot.py renders order_by="idx asc").
    doc = frappe.get_single(_VT_SETTINGS)
    rows = doc.get(_NAVBAR_FIELD) or []

    if not rows:
        # Empty navbar (fresh/wiped install). Patches run before the
        # after_migrate ensure_navbar_seeded() hook; appending a lone Brand row
        # here would make the navbar non-empty and suppress that full seed,
        # leaving Brand as the only link. Bail and let the seeder plant the full
        # menu (which already has Brand top-level).
        return

    brand_row = next((r for r in rows if (r.route or "") == _BRAND_ROUTE), None)

    if brand_row is None:
        # No Brand link on this install (older seed) — append it top-level.
        doc.append(_NAVBAR_FIELD, _BRAND_ROW)
        doc.save(ignore_permissions=True)
        frappe.db.commit()
        return

    if brand_row.parent_group == _ADMIN_GROUP_LABEL:
        # Promote the existing nested Brand link to top-level, in place.
        brand_row.parent_group = ""
        doc.save(ignore_permissions=True)
        frappe.db.commit()
        return

    # Already top-level (fresh install or re-run) — no-op.

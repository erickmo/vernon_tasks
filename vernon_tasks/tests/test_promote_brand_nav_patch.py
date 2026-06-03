# Tests for the promote_brand_nav_toplevel data patch + the seed guard.
#
# Covers: PRD-025 onboarding navbar (Brand management surfaced top-level).
# The patch must promote a Brand link nested under the "Admin" dropdown to
# top-level, add a top-level Brand link on installs that lack one entirely,
# preserve VT-Manager gating, and be idempotent.
import frappe
from frappe.tests.utils import FrappeTestCase

from vernon_tasks.patches.v1_x.promote_brand_nav_toplevel import execute as promote_brand
from vernon_tasks.setup_website import _NAVBAR_ITEMS
from vernon_tasks.boot import _filter_by_roles

_CHILD = "VT Navbar Item"
_MANAGER_ROLE = "VT Manager"
_BRAND_ROUTE = "/app/vt-brands"

# Install shape A: Brand link nested under the manager-only "Admin" dropdown
# (what a site seeded after commit ad810bc has).
_NAV_BRAND_UNDER_ADMIN = [
    dict(label="Beranda",    route="/app/vt-home",     icon="home",    is_group=0, parent_group="",      role_restriction="",            enabled=1),
    dict(label="Eksekutif",  route="/app/exec-analytics", icon="chart",is_group=0, parent_group="",      role_restriction=_MANAGER_ROLE, enabled=1),
    dict(label="Admin",      route="#",                icon="setting", is_group=1, parent_group="",      role_restriction=_MANAGER_ROLE, enabled=1),
    dict(label="Pengaturan", route="/app/vt-settings", icon="setting", is_group=0, parent_group="Admin", role_restriction=_MANAGER_ROLE, enabled=1),
    dict(label="Brand",      route=_BRAND_ROUTE,       icon="badge",   is_group=0, parent_group="Admin", role_restriction=_MANAGER_ROLE, enabled=1),
]

# Install shape B: no Brand link at all (site seeded before the Admin group
# existed). The patch must append a top-level Brand link.
_NAV_NO_BRAND = [
    dict(label="Beranda", route="/app/vt-home",     icon="home",    is_group=0, parent_group="", role_restriction="",            enabled=1),
    dict(label="Proyek",  route="/app/vt-projects",  icon="folder-normal", is_group=0, parent_group="", role_restriction="",     enabled=1),
]


def _seed(items):
    """Replace VT Settings.navbar_items with the given ordered list."""
    doc = frappe.get_single("VT Settings")
    doc.set("navbar_items", [])
    for it in items:
        doc.append("navbar_items", it)
    doc.save(ignore_permissions=True)
    frappe.db.commit()


def _rows():
    """Current navbar rows ordered by idx (mirrors boot.py read order)."""
    return frappe.get_all(
        _CHILD,
        filters={"parenttype": "VT Settings"},
        fields=["label", "route", "is_group", "parent_group", "role_restriction", "idx"],
        order_by="idx asc",
    )


def _brand(rows):
    """The single Brand row (by route) from a rows list, or None."""
    return next((r for r in rows if r["route"] == _BRAND_ROUTE), None)


class TestPromoteBrandFromAdmin(FrappeTestCase):
    """Install shape A: Brand nested under Admin -> promoted to top-level."""

    def setUp(self):
        _seed(_NAV_BRAND_UNDER_ADMIN)

    def tearDown(self):
        frappe.db.delete(_CHILD, {"parenttype": "VT Settings"})
        frappe.db.commit()

    def test_brand_promoted_to_top_level(self):
        promote_brand()
        brand = _brand(_rows())
        self.assertIsNotNone(brand)
        self.assertEqual(brand["parent_group"], "", "Brand still nested under Admin")
        self.assertFalse(brand["is_group"])

    def test_admin_group_and_pengaturan_kept(self):
        promote_brand()
        by_label = {r["label"]: r for r in _rows()}
        # Admin group survives, Pengaturan stays under it (out of scope to move).
        self.assertIn("Admin", by_label)
        self.assertEqual(by_label["Admin"]["is_group"], 1)
        self.assertEqual(by_label["Pengaturan"]["parent_group"], "Admin")

    def test_manager_gating_preserved(self):
        promote_brand()
        brand = _brand(_rows())
        self.assertEqual(brand["role_restriction"], _MANAGER_ROLE)
        # A Member must not see the promoted Brand link.
        member_visible = [r["label"] for r in _filter_by_roles(_rows(), {"VT Member"})]
        self.assertNotIn("Brand", member_visible)
        manager_visible = [r["label"] for r in _filter_by_roles(_rows(), {_MANAGER_ROLE})]
        self.assertIn("Brand", manager_visible)

    def test_idempotent_second_run_is_noop(self):
        promote_brand()
        first = _rows()
        promote_brand()  # second run must not change anything
        self.assertEqual(_rows(), first)


class TestAddBrandWhenMissing(FrappeTestCase):
    """Install shape B: no Brand link -> a top-level Brand link is appended."""

    def setUp(self):
        _seed(_NAV_NO_BRAND)

    def tearDown(self):
        frappe.db.delete(_CHILD, {"parenttype": "VT Settings"})
        frappe.db.commit()

    def test_brand_link_added_top_level(self):
        self.assertIsNone(_brand(_rows()))  # precondition: absent
        promote_brand()
        brand = _brand(_rows())
        self.assertIsNotNone(brand, "Brand link was not added")
        self.assertEqual(brand["parent_group"], "")
        self.assertEqual(brand["role_restriction"], _MANAGER_ROLE)

    def test_added_only_once_on_rerun(self):
        promote_brand()
        promote_brand()  # idempotent: must not append a duplicate
        brands = [r for r in _rows() if r["route"] == _BRAND_ROUTE]
        self.assertEqual(len(brands), 1)


class TestEmptyNavbarNoop(FrappeTestCase):
    """Empty navbar -> patch is a no-op so the after_migrate
    ensure_navbar_seeded() hook can plant the full menu. Patches run before
    that hook, so a lone-Brand insert here would suppress the full seed."""

    def setUp(self):
        _seed([])

    def tearDown(self):
        frappe.db.delete(_CHILD, {"parenttype": "VT Settings"})
        frappe.db.commit()

    def test_empty_navbar_stays_empty(self):
        promote_brand()
        self.assertEqual(_rows(), [], "patch must not seed a lone Brand row")


class TestBrandSeedGuard(FrappeTestCase):
    """Guard the seed so a future edit can't silently re-nest Brand."""

    def test_seed_brand_is_top_level(self):
        by_label = {i["label"]: i for i in _NAVBAR_ITEMS}
        self.assertIn("Brand", by_label)
        self.assertEqual(by_label["Brand"]["parent_group"], "", "Brand re-nested in seed")
        self.assertEqual(by_label["Brand"]["is_group"], 0)

    def test_seed_brand_is_manager_only(self):
        by_label = {i["label"]: i for i in _NAVBAR_ITEMS}
        self.assertEqual(by_label["Brand"]["role_restriction"], _MANAGER_ROLE)

# Tests for the flatten_saya_leader_nav data patch + the flattened seed guard.
#
# Covers: PRD-dashboard-merge (Saya/Leader dropdown groups folded into vt-home).
# The patch must drop the two group headers, promote their children to top-level,
# preserve VT-Leader gating, preserve order, and be idempotent.
import frappe
from frappe.tests.utils import FrappeTestCase

from vernon_tasks.patches.v1_x.flatten_saya_leader_nav import execute as flatten_nav
from vernon_tasks.setup_website import _NAVBAR_ITEMS
from vernon_tasks.boot import _filter_by_roles

_CHILD = "VT Navbar Item"
_LEADER_ROLE = "VT Leader"

# Pre-flatten navbar structure (what an existing install had before this patch).
# Mirrors the old _NAVBAR_ITEMS: Saya + Leader were is_group=1 dropdown headers.
_OLD_NAVBAR = [
    dict(label="Beranda",         route="/app/vt-home",         icon="home",         is_group=0, parent_group="",       role_restriction="",          enabled=1),
    dict(label="Saya",            route="#",                    icon="user",         is_group=1, parent_group="",       role_restriction="",          enabled=1),
    dict(label="My Work",         route="/app/my-work",         icon="check-circle", is_group=0, parent_group="Saya",   role_restriction="",          enabled=1),
    dict(label="Analytics",       route="/app/my-analytics",    icon="trend",        is_group=0, parent_group="Saya",   role_restriction="",          enabled=1),
    dict(label="Scorecard",       route="/app/vt-scorecard",    icon="star",         is_group=0, parent_group="Saya",   role_restriction="",          enabled=1),
    dict(label="Proyek",          route="/app/vt-projects",     icon="folder-normal",is_group=0, parent_group="",       role_restriction="",          enabled=1),
    dict(label="Leader",          route="#",                    icon="users",        is_group=1, parent_group="",       role_restriction=_LEADER_ROLE, enabled=1),
    dict(label="Review",          route="/app/leader-review",   icon="tick",         is_group=0, parent_group="Leader", role_restriction=_LEADER_ROLE, enabled=1),
    dict(label="Sprint Analytics",route="/app/leader-analytics",icon="chart",        is_group=0, parent_group="Leader", role_restriction=_LEADER_ROLE, enabled=1),
    dict(label="OKR",             route="/app/vt-okr",          icon="target-doc",   is_group=0, parent_group="Leader", role_restriction=_LEADER_ROLE, enabled=1),
    dict(label="Tim & Kapasitas", route="/app/vt-team",         icon="users",        is_group=0, parent_group="Leader", role_restriction=_LEADER_ROLE, enabled=1),
]

# Expected top-level label order after flattening (group headers gone, children
# promoted in place — Proyek stays between the ex-Saya and ex-Leader links).
_EXPECTED_ORDER = [
    "Beranda", "My Work", "Analytics", "Scorecard", "Proyek",
    "Review", "Sprint Analytics", "OKR", "Tim & Kapasitas",
]
_SAYA_CHILDREN = ("My Work", "Analytics", "Scorecard")
_LEADER_CHILDREN = ("Review", "Sprint Analytics", "OKR", "Tim & Kapasitas")


class TestFlattenSayaLeaderNavPatch(FrappeTestCase):
    def setUp(self):
        self._seed(_OLD_NAVBAR)

    def tearDown(self):
        frappe.db.delete(_CHILD, {"parenttype": "VT Settings"})
        frappe.db.commit()

    def _seed(self, items):
        """Replace VT Settings.navbar_items with the given ordered list."""
        doc = frappe.get_single("VT Settings")
        doc.set("navbar_items", [])
        for it in items:
            doc.append("navbar_items", it)
        doc.save(ignore_permissions=True)
        frappe.db.commit()

    def _rows(self):
        """Current navbar rows ordered by idx (mirrors boot.py read order)."""
        return frappe.get_all(
            _CHILD,
            filters={"parenttype": "VT Settings"},
            fields=["label", "route", "is_group", "parent_group", "role_restriction", "idx"],
            order_by="idx asc",
        )

    def test_group_headers_removed(self):
        flatten_nav()
        labels = [r["label"] for r in self._rows()]
        self.assertNotIn("Saya", labels)
        self.assertNotIn("Leader", labels)
        # No is_group header for either legacy group survives.
        groups = [r["label"] for r in self._rows() if r["is_group"]]
        self.assertEqual(groups, [])

    def test_children_promoted_to_top_level(self):
        flatten_nav()
        by_label = {r["label"]: r for r in self._rows()}
        for label in _SAYA_CHILDREN + _LEADER_CHILDREN:
            self.assertEqual(by_label[label]["parent_group"], "", f"{label} still nested")
            self.assertFalse(by_label[label]["is_group"], f"{label} became a group")

    def test_leader_gating_preserved(self):
        flatten_nav()
        by_label = {r["label"]: r for r in self._rows()}
        for label in _LEADER_CHILDREN:
            self.assertEqual(by_label[label]["role_restriction"], _LEADER_ROLE)
        for label in _SAYA_CHILDREN:
            self.assertEqual(by_label[label]["role_restriction"], "")

    def test_order_and_idx_preserved(self):
        flatten_nav()
        rows = self._rows()
        self.assertEqual([r["label"] for r in rows], _EXPECTED_ORDER)
        # Survivors keep their original idx (gaps remain where the two headers
        # were removed); what matters for the renderer is a strictly ascending,
        # unique idx so order_by="idx asc" is deterministic.
        idxs = [r["idx"] for r in rows]
        self.assertEqual(idxs, sorted(idxs))
        self.assertEqual(len(idxs), len(set(idxs)))

    def test_member_sees_saya_not_leader_after_flatten(self):
        """Real regression risk: flattening must not leak VT-Leader pages to Members."""
        flatten_nav()
        member_roles = {"VT Member", "Guest"}
        visible = [r["label"] for r in _filter_by_roles(self._rows(), member_roles)]
        for label in _SAYA_CHILDREN:
            self.assertIn(label, visible)
        for label in _LEADER_CHILDREN:
            self.assertNotIn(label, visible)

    def test_idempotent_second_run_is_noop(self):
        flatten_nav()
        first = self._rows()
        flatten_nav()  # second run must not change anything
        self.assertEqual(self._rows(), first)


class TestFlattenedSeedGuard(FrappeTestCase):
    """Guard the seed so a future edit can't silently re-nest the dashboards."""

    def test_seed_has_no_saya_leader_groups(self):
        groups = [i["label"] for i in _NAVBAR_ITEMS if i["is_group"]]
        self.assertNotIn("Saya", groups)
        self.assertNotIn("Leader", groups)

    def test_seed_children_are_top_level(self):
        by_label = {i["label"]: i for i in _NAVBAR_ITEMS}
        for label in _SAYA_CHILDREN + _LEADER_CHILDREN:
            self.assertEqual(by_label[label]["parent_group"], "", f"{label} re-nested")
            self.assertEqual(by_label[label]["is_group"], 0)

    def test_seed_leader_children_keep_role(self):
        by_label = {i["label"]: i for i in _NAVBAR_ITEMS}
        for label in _LEADER_CHILDREN:
            self.assertEqual(by_label[label]["role_restriction"], _LEADER_ROLE)

"""VT Item controller tests — unified hierarchy (P1).

Covers: per-type autoname, parent-type validation (strict + skips),
brand inheritance, percent_done rollup. Spec:
docs/superpowers/specs/2026-06-07-vt-item-unified-hierarchy-design.html
"""
import frappe
from frappe.tests.utils import FrappeTestCase


def _make(node_type, title, parent=None, **kw):
	doc = frappe.get_doc(
		{"doctype": "VT Item", "node_type": node_type, "title": title,
		 "parent_vt_item": parent, **kw}
	)
	doc.insert(ignore_permissions=True)
	return doc


class TestVTItem(FrappeTestCase):
	def test_autoname_prefix_per_type(self):
		# PRD: VT Item P1 | spec §3.3
		okr = _make("OKR", "Grow revenue")
		self.assertTrue(okr.name.startswith("OKR-"))
		proj = _make("Project", "Website", parent=okr.name)
		self.assertTrue(proj.name.startswith("PROJ-"))
		sp = _make("Sprint", "Sprint 1", parent=proj.name)
		self.assertTrue(sp.name.startswith("SP-"))
		task = _make("Task", "Build hero", parent=sp.name)
		self.assertTrue(task.name.startswith("TASK-"))

	def test_illegal_parent_type_rejected(self):
		# spec §4 — Project under Task is illegal
		okr = _make("OKR", "O1")
		proj = _make("Project", "P1", parent=okr.name)
		sp = _make("Sprint", "S1", parent=proj.name)
		task = _make("Task", "T1", parent=sp.name)
		with self.assertRaises(frappe.ValidationError):
			_make("Project", "bad", parent=task.name)

	def test_skip_levels_allowed(self):
		# spec §4 — Task directly under Project (backlog), Project at root
		proj = _make("Project", "Standalone")  # no OKR parent
		task = _make("Task", "Backlog item", parent=proj.name)
		self.assertEqual(task.parent_vt_item, proj.name)

	def test_kpi_root_and_under_okr(self):
		# spec §4 — KPI may be top-tier or under an OKR
		kpi_root = _make("KPI", "NPS")
		self.assertIsNone(kpi_root.parent_vt_item)
		okr = _make("OKR", "O2")
		kpi_child = _make("KPI", "Churn", parent=okr.name)
		self.assertEqual(kpi_child.parent_vt_item, okr.name)

	def _ensure_brand(self):
		name = "Test Brand VT Item"
		if not frappe.db.exists("VT Brand", name):
			frappe.get_doc(
				{"doctype": "VT Brand", "brand_name": name}
			).insert(ignore_permissions=True)
		return name

	def test_brand_inherits_from_ancestor(self):
		# spec §4 — blank brand resolves from nearest ancestor
		brand = self._ensure_brand()
		okr = _make("OKR", "Branded OKR", brand=brand)
		proj = _make("Project", "Child proj", parent=okr.name)  # no brand set
		self.assertEqual(proj.brand, brand)

	def test_percent_done_rolls_up(self):
		# spec §5 — child percent_done propagates to ancestors (mean)
		okr = _make("OKR", "Rollup OKR")
		proj = _make("Project", "Rollup proj", parent=okr.name)
		_make("Task", "t1", parent=proj.name, percent_done=100)
		_make("Task", "t2", parent=proj.name, percent_done=0)
		proj.reload()
		self.assertEqual(proj.percent_done, 50)
		okr.reload()
		self.assertEqual(okr.percent_done, 50)

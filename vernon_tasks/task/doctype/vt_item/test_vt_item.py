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

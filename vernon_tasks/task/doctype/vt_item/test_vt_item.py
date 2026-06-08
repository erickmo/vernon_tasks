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

	def test_okr_holds_key_results(self):
		# spec §3.2 — Key Result lives as a child row under an OKR node
		okr = _make("OKR", "OKR with KR")
		okr.append("key_results", {"metric": "Signups", "target_value": 1000})
		okr.save(ignore_permissions=True)
		okr.reload()
		self.assertEqual(len(okr.key_results), 1)
		self.assertEqual(okr.key_results[0].metric, "Signups")

	def test_kpi_holds_entries(self):
		# spec §3.2 — KPI Entry lives as a child row under a KPI node
		kpi = _make("KPI", "Daily active users")
		kpi.append("kpi_entries", {"date": frappe.utils.today(), "value": 42})
		kpi.save(ignore_permissions=True)
		kpi.reload()
		self.assertEqual(len(kpi.kpi_entries), 1)
		self.assertEqual(kpi.kpi_entries[0].value, 42)

	def test_task_kanban_synced_from_pdca(self):
		# P2 — Task board column derives from pdca_phase (CLOSED → Done)
		proj = _make("Project", "Sync proj")
		task = _make("Task", "sync t", parent=proj.name, pdca_phase="CLOSED")
		self.assertEqual(task.kanban_status, "Done")

	def test_blocked_kanban_preserved(self):
		# P2 — Blocked is orthogonal; pdca sync must not overwrite it
		proj = _make("Project", "Blk proj")
		task = _make("Task", "blk t", parent=proj.name,
			pdca_phase="DO", kanban_status="Blocked")
		self.assertEqual(task.kanban_status, "Blocked")

	def test_task_defaults_phase_and_weight(self):
		# P3 — a Task with no pdca_phase/weight gets legacy defaults
		# (pdca BACKLOG → kanban Backlog, weight 1)
		proj = _make("Project", "Exp proj")
		task = _make("Task", "exp t", parent=proj.name)
		self.assertEqual(task.pdca_phase, "BACKLOG")
		self.assertEqual(task.kanban_status, "Backlog")
		self.assertEqual(task.weight, 1)

	def test_illegal_pdca_transition_rejected(self):
		# P3 — Deming cycle enforced on phase change (DO → CLOSED illegal)
		proj = _make("Project", "Trans proj")
		task = _make("Task", "trans t", parent=proj.name, pdca_phase="DO")
		task.pdca_phase = "CLOSED"
		with self.assertRaises(frappe.ValidationError):
			task.save(ignore_permissions=True)

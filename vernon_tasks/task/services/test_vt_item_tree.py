"""Tests for the VT Item tree query foundation (P2).

Spec: docs/superpowers/specs/2026-06-07-vt-item-unified-hierarchy-design.html
"""
import frappe
from frappe.tests.utils import FrappeTestCase

from vernon_tasks.task.services import vt_item_tree as tree


def _mk(node_type, title, parent=None, **kw):
	doc = frappe.get_doc({"doctype": "VT Item", "node_type": node_type,
		"title": title, "parent_vt_item": parent, **kw})
	doc.insert(ignore_permissions=True)
	return doc


class TestVTItemTree(FrappeTestCase):
	def setUp(self):
		self.okr = _mk("OKR", "P2 OKR")
		self.proj = _mk("Project", "P2 Proj", parent=self.okr.name)
		self.sprint = _mk("Sprint", "P2 Sprint", parent=self.proj.name)
		self.t1 = _mk("Task", "P2 T1", parent=self.sprint.name, actual_minutes=30)
		self.t2 = _mk("Task", "P2 T2", parent=self.proj.name, actual_minutes=10)  # backlog skip

	def test_nodes_typed(self):
		names = [n.name for n in tree.nodes("OKR")]
		self.assertIn(self.okr.name, names)

	def test_children_typed(self):
		kids = [c.name for c in tree.children(self.proj.name, "Sprint")]
		self.assertEqual(kids, [self.sprint.name])

	def test_descendants_spans_skips(self):
		# both the sprint's task AND the backlog task (direct under project)
		tasks = {d.name for d in tree.descendants(self.proj.name, "Task")}
		self.assertEqual(tasks, {self.t1.name, self.t2.name})

	def test_project_of_walks_ancestors(self):
		self.assertEqual(tree.project_of(self.t1.name), self.proj.name)
		self.assertEqual(tree.project_of(self.sprint.name), self.proj.name)

	def test_ancestor_of_type_none_when_absent(self):
		self.assertIsNone(tree.ancestor_of_type(self.okr.name, "Project"))

	def test_child_table_rows(self):
		self.okr.append("key_results", {"metric": "M", "target_value": 5})
		self.okr.save(ignore_permissions=True)
		rows = tree.child_table_rows(self.okr.name, "key_results")
		self.assertEqual(len(rows), 1)
		self.assertEqual(rows[0]["metric"], "M")

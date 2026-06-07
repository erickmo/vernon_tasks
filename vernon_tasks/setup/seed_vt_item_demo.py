"""Minimal VT Item demo seed — one OKR→Project→Sprint→Task chain.

Console helper for P1 only (eyeball the native tree view at
/app/vt-item/view/tree). The full demo_data rewrite is P4.
Run: bench --site task.localhost execute \
  vernon_tasks.setup.seed_vt_item_demo.seed
"""
import frappe

# Stable titles so re-running is idempotent (skip if already present).
DEMO_CHAIN = [
	("OKR", "DEMO OKR — Grow", None),
	("Project", "DEMO Project — Launch", "DEMO OKR — Grow"),
	("Sprint", "DEMO Sprint 1", "DEMO Project — Launch"),
	("Task", "DEMO Task — Ship landing", "DEMO Sprint 1"),
]


def _find(title):
	"""Return the node name for a demo title, or None."""
	return frappe.db.get_value("VT Item", {"title": title})


def seed():
	"""Idempotently create the demo chain. Safe to re-run."""
	for node_type, title, parent_title in DEMO_CHAIN:
		if _find(title):
			continue
		parent = _find(parent_title) if parent_title else None
		frappe.get_doc(
			{"doctype": "VT Item", "node_type": node_type,
			 "title": title, "parent_vt_item": parent, "is_group": 1}
		).insert(ignore_permissions=True)
	frappe.db.commit()
	print("seeded VT Item demo chain")

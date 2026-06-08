import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, today

from vernon_tasks.task.api import okr

_OKR_TITLE = "OKR-API-Obj"
_PROJ_TITLE = "OKR-API-Proj"


def _cleanup():
	# NestedSet blocks deleting a parent before its children, so delete each
	# OKR's whole subtree deepest-first (highest lft) then the OKR node.
	for title, node_type in ((_OKR_TITLE, "OKR"), (_PROJ_TITLE, "Project")):
		for node in frappe.get_all(
			"VT Item",
			{"title": title, "node_type": node_type},
			["name", "lft", "rgt"],
		):
			descendants = frappe.get_all(
				"VT Item",
				filters={"lft": [">", node["lft"]], "rgt": ["<", node["rgt"]]},
				fields=["name"],
				order_by="lft desc",
			)
			for d in descendants:
				frappe.delete_doc("VT Item", d["name"], force=True)
			frappe.delete_doc("VT Item", node["name"], force=True)


def _make_objective(start_offset, end_offset):
	return frappe.get_doc({
		"doctype": "VT Item",
		"node_type": "OKR",
		"title": _OKR_TITLE,
		"pdca_phase": "DO",
		"period_start": add_days(today(), start_offset),
		"period_end": add_days(today(), end_offset),
	}).insert(ignore_permissions=True)


def _add_key_result(objective, metric, target, current):
	doc = frappe.get_doc("VT Item", objective)
	doc.append("key_results", {
		"metric": metric,
		"target_value": target,
		"current_value": current,
	})
	doc.save(ignore_permissions=True)
	return doc.key_results[-1]


def _make_project(parent=None):
	return frappe.get_doc({
		"doctype": "VT Item",
		"node_type": "Project",
		"title": _PROJ_TITLE,
		"parent_vt_item": parent,
		"health_status": "Open",
	}).insert(ignore_permissions=True)


class TestOkrGetForProject(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		_cleanup()

	def tearDown(self):
		_cleanup()

	def test_get_for_project_nonexistent_returns_empty_shape(self):
		result = okr.get_for_project("nonexistent-project-id")
		self.assertEqual(result, {"objective": None, "key_results": []})

	def test_get_for_project_no_objective_returns_empty_shape(self):
		project = _make_project(parent=None)
		result = okr.get_for_project(project.name)
		self.assertEqual(result, {"objective": None, "key_results": []})

	def test_get_for_project_returns_objective_and_key_results(self):
		# Window: started 4 days ago, ends in 6 days → 4/10 elapsed = 0.4 pace.
		objective = _make_objective(-4, 6)
		_add_key_result(objective.name, "Revenue", 100.0, 25.0)
		_add_key_result(objective.name, "Signups", 50.0, 10.0)
		project = _make_project(parent=objective.name)

		result = okr.get_for_project(project.name)

		self.assertEqual(result["objective"]["id"], objective.name)
		self.assertEqual(result["objective"]["title"], _OKR_TITLE)
		self.assertEqual(result["objective"]["phase"], "DO")

		self.assertEqual(len(result["key_results"]), 2)
		first = result["key_results"][0]
		self.assertEqual(set(first.keys()),
			{"id", "title", "target", "current", "pace_expected"})
		self.assertEqual(first["title"], "Revenue")
		self.assertEqual(first["target"], 100.0)
		self.assertEqual(first["current"], 25.0)
		self.assertEqual(first["pace_expected"], 0.4)

	def test_get_for_project_objective_without_period_pace_zero(self):
		objective = _make_objective(0, 0)
		# Clear the period so pace cannot be computed.
		frappe.db.set_value("VT Item", objective.name,
			{"period_start": None, "period_end": None})
		_add_key_result(objective.name, "Revenue", 100.0, 25.0)
		project = _make_project(parent=objective.name)

		result = okr.get_for_project(project.name)

		self.assertEqual(result["objective"]["id"], objective.name)
		self.assertEqual(result["key_results"][0]["pace_expected"], 0.0)

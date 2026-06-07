import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, today
from vernon_tasks.task.services.risk_evaluator import evaluate_risks

# On VT Item the legacy VT Task done phase ("DONE") is the unified completion
# phase "CLOSED"; the per-task assignee Link assigned_to→owner_user. A project
# is a VT Item node (node_type='Project') and its Tasks are its subtree (the old
# VT Task.project Link is now the parent_vt_item tree relation).
_DONE_PHASE = "CLOSED"

_TITLES = (
	"Risk-Empty",
	"Risk-Blocked",
	"Risk-Blocked-Fresh",
	"Risk-Override",
)


def _cleanup():
	# NestedSet blocks deleting a parent before its children, so delete each
	# project's whole subtree deepest-first (highest lft) then the project.
	for title in _TITLES:
		for proj in frappe.get_all(
			"VT Item", {"title": title, "node_type": "Project"}, ["name", "lft", "rgt"]
		):
			descendants = frappe.get_all(
				"VT Item",
				filters={"lft": [">", proj["lft"]], "rgt": ["<", proj["rgt"]]},
				fields=["name"],
				order_by="lft desc",
			)
			for d in descendants:
				frappe.delete_doc("VT Item", d["name"], force=True)
			frappe.delete_doc("VT Item", proj["name"], force=True)


def _make_project(title, end_offset=30):
	return frappe.get_doc({
		"doctype": "VT Item",
		"node_type": "Project",
		"title": title,
		"start_date": add_days(today(), -30),
		"end_date": add_days(today(), end_offset),
		"health_status": "Open",
	}).insert(ignore_permissions=True)


def _make_blocked_task(project):
	# Task is a VT Item child of the Project node; done phase 'DONE'→'CLOSED'.
	return frappe.get_doc({
		"doctype": "VT Item",
		"node_type": "Task",
		"title": "Stuck",
		"parent_vt_item": project,
		"estimated_minutes": 4,
		"actual_minutes": 0,
		"kanban_status": "Blocked",
		"pdca_phase": "DO",
	}).insert(ignore_permissions=True)


class TestRiskEvaluator(FrappeTestCase):
	def setUp(self):
		_cleanup()
		settings = frappe.get_single("VT Settings")
		settings.default_blocked_days_threshold = 3
		settings.default_slip_pct_threshold = 20
		settings.default_capacity_pct_threshold = 120
		settings.save(ignore_permissions=True)

	def tearDown(self):
		_cleanup()

	def test_no_risks_on_empty_project(self):
		p = _make_project("Risk-Empty")
		self.assertEqual(evaluate_risks(p.name), [])

	def test_blocked_task_above_threshold(self):
		p = _make_project("Risk-Blocked")
		t = _make_blocked_task(p.name)
		frappe.db.set_value("VT Item", t.name, "modified", add_days(today(), -5), update_modified=False)
		risks = evaluate_risks(p.name)
		blocked = [r for r in risks if r["type"] == "blocked"]
		self.assertEqual(len(blocked), 1)
		self.assertEqual(blocked[0]["target"], t.name)
		self.assertGreaterEqual(blocked[0]["days"], 5)

	def test_blocked_below_threshold_not_reported(self):
		p = _make_project("Risk-Blocked-Fresh")
		_make_blocked_task(p.name)
		risks = evaluate_risks(p.name)
		self.assertEqual([r for r in risks if r["type"] == "blocked"], [])

	def test_project_override_changes_threshold(self):
		p = _make_project("Risk-Override")
		frappe.db.set_value("VT Item", p.name, "blocked_days_threshold", 30)
		t = _make_blocked_task(p.name)
		frappe.db.set_value("VT Item", t.name, "modified", add_days(today(), -10), update_modified=False)
		risks = evaluate_risks(p.name)
		self.assertEqual([r for r in risks if r["type"] == "blocked"], [])

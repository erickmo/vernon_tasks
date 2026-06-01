import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, today
from vernon_tasks.task.services.risk_evaluator import evaluate_risks

_FIXTURE_BRAND = "TEST-RISK-BRAND"


def _ensure_brand():
    if not frappe.db.exists("VT Brand", _FIXTURE_BRAND):
        frappe.get_doc({
            "doctype": "VT Brand",
            "brand_name": _FIXTURE_BRAND,
        }).insert(ignore_permissions=True)
    return _FIXTURE_BRAND


def _make_project(title, end_offset=30):
    return frappe.get_doc({
        "doctype": "VT Project",
        "title": title,
        "brand": _ensure_brand(),
        "project_owner": "Administrator",
        "start_date": add_days(today(), -30),
        "end_date": add_days(today(), end_offset),
        "status": "Open",
    }).insert(ignore_permissions=True)


class TestRiskEvaluator(FrappeTestCase):
    def setUp(self):
        settings = frappe.get_single("VT Settings")
        settings.default_blocked_days_threshold = 3
        settings.default_slip_pct_threshold = 20
        settings.default_capacity_pct_threshold = 120
        settings.save(ignore_permissions=True)

    def test_no_risks_on_empty_project(self):
        p = _make_project("Risk-Empty")
        self.assertEqual(evaluate_risks(p.name), [])

    def test_blocked_task_above_threshold(self):
        p = _make_project("Risk-Blocked")
        t = frappe.get_doc({
            "doctype": "VT Task",
            "title": "Stuck",
            "project": p.name,
            "estimated_minutes": 4,
            "actual_minutes": 0,
            "kanban_status": "Blocked",
            "pdca_phase": "DO",
        }).insert(ignore_permissions=True)
        frappe.db.set_value("VT Task", t.name, "modified", add_days(today(), -5), update_modified=False)
        risks = evaluate_risks(p.name)
        blocked = [r for r in risks if r["type"] == "blocked"]
        self.assertEqual(len(blocked), 1)
        self.assertEqual(blocked[0]["target"], t.name)
        self.assertGreaterEqual(blocked[0]["days"], 5)

    def test_blocked_below_threshold_not_reported(self):
        p = _make_project("Risk-Blocked-Fresh")
        frappe.get_doc({
            "doctype": "VT Task",
            "title": "Fresh",
            "project": p.name,
            "estimated_minutes": 4,
            "actual_minutes": 0,
            "kanban_status": "Blocked",
            "pdca_phase": "DO",
        }).insert(ignore_permissions=True)
        risks = evaluate_risks(p.name)
        self.assertEqual([r for r in risks if r["type"] == "blocked"], [])

    def test_project_override_changes_threshold(self):
        p = _make_project("Risk-Override")
        frappe.db.set_value("VT Project", p.name, "blocked_days_threshold", 30)
        t = frappe.get_doc({
            "doctype": "VT Task",
            "title": "Stuck",
            "project": p.name,
            "estimated_minutes": 4,
            "actual_minutes": 0,
            "kanban_status": "Blocked",
            "pdca_phase": "DO",
        }).insert(ignore_permissions=True)
        frappe.db.set_value("VT Task", t.name, "modified", add_days(today(), -10), update_modified=False)
        risks = evaluate_risks(p.name)
        self.assertEqual([r for r in risks if r["type"] == "blocked"], [])

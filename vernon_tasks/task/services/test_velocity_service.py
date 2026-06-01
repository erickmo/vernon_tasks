import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, today
from vernon_tasks.task.services.velocity_service import (
    get_sprint_velocity,
    get_velocity_trend,
)


_FIXTURE_BRAND = "TEST-VEL-BRAND"


def _ensure_brand():
    if not frappe.db.exists("VT Brand", _FIXTURE_BRAND):
        frappe.get_doc({
            "doctype": "VT Brand",
            "brand_name": _FIXTURE_BRAND,
        }).insert(ignore_permissions=True)
    return _FIXTURE_BRAND


def _make_project(name="Test-Proj-Vel"):
    if frappe.db.exists("VT Project", name):
        frappe.delete_doc("VT Project", name, force=True)
    return frappe.get_doc({
        "doctype": "VT Project",
        "title": name,
        "brand": _ensure_brand(),
        "project_owner": "Administrator",
        "start_date": add_days(today(), -60),
        "end_date": add_days(today(), 60),
        "status": "Open",
    }).insert(ignore_permissions=True)


def _make_sprint(project, idx, start_offset):
    return frappe.get_doc({
        "doctype": "VT Sprint",
        "sprint_title": f"S{idx}",
        "project": project,
        "start_date": add_days(today(), start_offset),
        "end_date": add_days(today(), start_offset + 13),
        "status": "Closed",
    }).insert(ignore_permissions=True)


def _make_task(project, sprint, hours, completion_offset, phase="DONE"):
    return frappe.get_doc({
        "doctype": "VT Task",
        "title": "T",
        "project": project,
        "sprint": sprint,
        "estimated_minutes": hours,
        "actual_minutes": hours,
        "completion_date": add_days(today(), completion_offset) if phase == "DONE" else None,
        "pdca_phase": phase,
        "kanban_status": "Done" if phase == "DONE" else "Todo",
    }).insert(ignore_permissions=True)


class TestVelocityService(FrappeTestCase):
    def setUp(self):
        self.project = _make_project()
        self.s1 = _make_sprint(self.project.name, 1, -42)
        self.s2 = _make_sprint(self.project.name, 2, -28)
        self.s3 = _make_sprint(self.project.name, 3, -14)
        _make_task(self.project.name, self.s1.name, 10, -32)
        _make_task(self.project.name, self.s1.name, 5, -30)  # 15 total
        _make_task(self.project.name, self.s2.name, 8, -18)  # 8 total
        _make_task(self.project.name, self.s3.name, 12, -4)  # 12 total
        _make_task(self.project.name, self.s3.name, 7, -10, phase="DO")  # excluded

    def test_sprint_velocity_sums_done_actual_hours(self):
        self.assertEqual(get_sprint_velocity(self.s1.name), 15.0)
        self.assertEqual(get_sprint_velocity(self.s2.name), 8.0)
        self.assertEqual(get_sprint_velocity(self.s3.name), 12.0)

    def test_velocity_trend_returns_last_n_closed_sprints_in_order(self):
        result = get_velocity_trend(self.project.name, n=6)
        self.assertEqual(result["velocity"], [15.0, 8.0, 12.0])
        self.assertEqual(result["sprints"], [self.s1.name, self.s2.name, self.s3.name])
        self.assertAlmostEqual(result["avg"], (15 + 8 + 12) / 3)

    def test_trend_pct_first_to_last(self):
        result = get_velocity_trend(self.project.name, n=6)
        self.assertAlmostEqual(result["trend_pct"], (12 - 15) / 15 * 100)

    def test_velocity_trend_empty(self):
        empty = _make_project("Empty-Proj-Vel")
        result = get_velocity_trend(empty.name, n=6)
        self.assertEqual(result["velocity"], [])
        self.assertEqual(result["avg"], 0.0)
        self.assertEqual(result["trend_pct"], 0.0)

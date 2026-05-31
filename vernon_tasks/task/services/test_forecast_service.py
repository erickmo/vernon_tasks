import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, today
from vernon_tasks.task.services.forecast_service import get_forecast


def _setup_project(name, sprint_velocities, remaining_hours, sprint_len=14):
    if frappe.db.exists("VT Project", name):
        frappe.delete_doc("VT Project", name, force=True)
    project = frappe.get_doc({
        "doctype": "VT Project",
        "title": name,
        "project_owner": frappe.session.user,
        "start_date": add_days(today(), -180),
        "end_date": add_days(today(), 180),
        "status": "Open",
    }).insert(ignore_permissions=True)
    for idx, v in enumerate(sprint_velocities):
        offset = -((len(sprint_velocities) - idx) * sprint_len)
        sprint = frappe.get_doc({
            "doctype": "VT Sprint",
            "sprint_title": f"FC-{name}-{idx}",
            "project": project.name,
            "start_date": add_days(today(), offset),
            "end_date": add_days(today(), offset + sprint_len - 1),
            "status": "Closed",
        }).insert(ignore_permissions=True)
        if v > 0:
            frappe.get_doc({
                "doctype": "VT Task",
                "title": "T",
                "project": project.name,
                "sprint": sprint.name,
                "estimated_minutes": v,
                "actual_minutes": v,
                "completion_date": add_days(today(), offset + 1),
                "pdca_phase": "DONE",
                "kanban_status": "Done",
            }).insert(ignore_permissions=True)
    if remaining_hours > 0:
        frappe.get_doc({
            "doctype": "VT Task",
            "title": "Remain",
            "project": project.name,
            "estimated_minutes": remaining_hours,
            "actual_minutes": 0,
            "pdca_phase": "DO",
            "kanban_status": "In Progress",
        }).insert(ignore_permissions=True)
    return project


class TestForecastService(FrappeTestCase):
    def test_insufficient_data_under_three_sprints(self):
        project = _setup_project("FC-Few", [10, 12], remaining_hours=20)
        result = get_forecast(project.name)
        self.assertTrue(result["insufficient_data"])
        self.assertEqual(result["sprints_needed"], 1)

    def test_predicted_end_uses_avg_velocity(self):
        project = _setup_project("FC-Even", [10, 10, 10], remaining_hours=30)
        result = get_forecast(project.name)
        self.assertFalse(result.get("insufficient_data"))
        self.assertAlmostEqual(result["avg_velocity"], 10.0)
        self.assertEqual(result["remaining_hours"], 30.0)
        self.assertEqual(result["sprints_used"], 3)

    def test_confidence_high_when_stdev_low(self):
        project = _setup_project("FC-Stable", [10, 10, 10, 10], remaining_hours=10)
        result = get_forecast(project.name)
        self.assertGreaterEqual(result["confidence"], 0.95)

    def test_pmin_after_predicted_after_pmax(self):
        project = _setup_project("FC-Range", [5, 10, 15], remaining_hours=30)
        result = get_forecast(project.name)
        from frappe.utils import getdate
        self.assertGreaterEqual(getdate(result["p_min"]), getdate(result["predicted_end"]))
        self.assertLessEqual(getdate(result["p_max"]), getdate(result["predicted_end"]))

import frappe
import pytest
from unittest.mock import patch, MagicMock


def make_task(project, title, pdca_phase="Plan", assigned_to=None):
    return {
        "name": f"VT-{title.replace(' ', '-')}",
        "title": title,
        "project": project,
        "pdca_phase": pdca_phase,
        "assigned_to": assigned_to or "test@example.com",
        "deadline": None,
        "priority": "Medium",
        "kanban_status": "Open",
        "base_points": 10.0,
        "completion_date": None,
    }


class TestGetProjectTasks:
    def test_returns_all_tasks_for_project(self):
        tasks = [make_task("PROJ-001", "Task A"), make_task("PROJ-001", "Task B")]
        with patch("frappe.get_all", return_value=tasks):
            from vernon_tasks.api.projects import get_project_tasks
            result = get_project_tasks("PROJ-001")
        assert len(result) == 2
        assert result[0]["title"] == "Task A"

    def test_filters_by_pdca_phase(self):
        tasks = [make_task("PROJ-001", "Plan Task", pdca_phase="Plan")]
        with patch("frappe.get_all", return_value=tasks) as mock_get_all:
            from vernon_tasks.api.projects import get_project_tasks
            get_project_tasks("PROJ-001", pdca_phase="Plan")
        call_filters = mock_get_all.call_args[1]["filters"]
        assert call_filters.get("pdca_phase") == "Plan"

    def test_filters_by_assignee(self):
        tasks = [make_task("PROJ-001", "My Task", assigned_to="alice@example.com")]
        with patch("frappe.get_all", return_value=tasks) as mock_get_all:
            from vernon_tasks.api.projects import get_project_tasks
            get_project_tasks("PROJ-001", assignee="alice@example.com")
        call_filters = mock_get_all.call_args[1]["filters"]
        assert call_filters.get("assigned_to") == "alice@example.com"

    def test_no_phase_filter_when_none(self):
        with patch("frappe.get_all", return_value=[]) as mock_get_all:
            from vernon_tasks.api.projects import get_project_tasks
            get_project_tasks("PROJ-001")
        call_filters = mock_get_all.call_args[1]["filters"]
        assert "pdca_phase" not in call_filters

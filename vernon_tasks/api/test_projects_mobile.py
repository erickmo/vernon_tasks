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
        with patch("frappe.has_permission", return_value=True), \
             patch("frappe.get_all", return_value=tasks):
            from vernon_tasks.api.projects import get_project_tasks
            result = get_project_tasks("PROJ-001")
        assert len(result) == 2
        assert result[0]["title"] == "Task A"

    def test_filters_by_pdca_phase(self):
        tasks = [make_task("PROJ-001", "Plan Task", pdca_phase="Plan")]
        with patch("frappe.has_permission", return_value=True), \
             patch("frappe.get_all", return_value=tasks) as mock_get_all:
            from vernon_tasks.api.projects import get_project_tasks
            get_project_tasks("PROJ-001", pdca_phase="Plan")
        call_filters = mock_get_all.call_args[1]["filters"]
        assert call_filters.get("pdca_phase") == "Plan"

    def test_filters_by_assignee(self):
        tasks = [make_task("PROJ-001", "My Task", assigned_to="alice@example.com")]
        with patch("frappe.has_permission", return_value=True), \
             patch("frappe.get_all", return_value=tasks) as mock_get_all:
            from vernon_tasks.api.projects import get_project_tasks
            get_project_tasks("PROJ-001", assignee="alice@example.com")
        call_filters = mock_get_all.call_args[1]["filters"]
        assert call_filters.get("assigned_to") == "alice@example.com"

    def test_no_phase_filter_when_none(self):
        with patch("frappe.has_permission", return_value=True), \
             patch("frappe.get_all", return_value=[]) as mock_get_all:
            from vernon_tasks.api.projects import get_project_tasks
            get_project_tasks("PROJ-001")
        call_filters = mock_get_all.call_args[1]["filters"]
        assert "pdca_phase" not in call_filters


class TestCreateTask:
    def test_creates_task_with_required_fields(self):
        mock_doc = MagicMock()
        mock_doc.as_dict.return_value = {
            "name": "VT-0001", "title": "New Task", "project": "PROJ-001",
            "pdca_phase": "Plan", "priority": "Medium",
        }
        with patch("frappe.has_permission", return_value=True), \
             patch("frappe.get_doc", return_value=mock_doc):
            from vernon_tasks.api.projects import create_task
            result = create_task(project="PROJ-001", title="New Task")
        mock_doc.insert.assert_called_once_with(ignore_permissions=False)
        assert result["title"] == "New Task"

    def test_defaults_pdca_plan_and_priority_medium(self):
        mock_doc = MagicMock()
        mock_doc.as_dict.return_value = {}
        with patch("frappe.has_permission", return_value=True), \
             patch("frappe.get_doc", return_value=mock_doc) as mock_get_doc:
            from vernon_tasks.api.projects import create_task
            create_task(project="PROJ-001", title="T")
        call_kwargs = mock_get_doc.call_args[0][0]
        assert call_kwargs["pdca_phase"] == "Plan"
        assert call_kwargs["priority"] == "Medium"


class TestUpdateTask:
    def test_updates_specified_fields(self):
        mock_doc = MagicMock()
        mock_doc.title = "Old Title"
        mock_doc.as_dict.return_value = {"name": "VT-0001", "title": "New Title"}
        with patch("frappe.get_doc", return_value=mock_doc):
            from vernon_tasks.api.projects import update_task
            result = update_task(name="VT-0001", title="New Title")
        assert mock_doc.title == "New Title"
        mock_doc.save.assert_called_once_with(ignore_permissions=False)

    def test_skips_none_fields(self):
        mock_doc = MagicMock()
        mock_doc.priority = "Low"
        mock_doc.as_dict.return_value = {}
        with patch("frappe.get_doc", return_value=mock_doc):
            from vernon_tasks.api.projects import update_task
            update_task(name="VT-0001", title="T")
        assert mock_doc.priority == "Low"

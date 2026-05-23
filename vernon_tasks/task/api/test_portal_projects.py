import frappe
from frappe.tests.utils import FrappeTestCase

from vernon_tasks.task.api import portal_projects


class TestPortalProjectsExtended(FrappeTestCase):
    def test_get_project_tasks_invalid_group_by(self):
        frappe.set_user("Administrator")
        with self.assertRaises(ValueError):
            portal_projects.get_project_tasks(project_id="anything", group_by="evil")

    def test_bulk_phase_shift_rejects_invalid_phase(self):
        frappe.set_user("Administrator")
        with self.assertRaises(frappe.ValidationError):
            portal_projects.bulk_phase_shift(task_ids=[], new_phase="HACK")

    def test_list_projects_returns_list(self):
        frappe.set_user("Administrator")
        result = portal_projects.list_projects(filters=None)
        self.assertIsInstance(result, list)

    def test_list_projects_accepts_json_filters(self):
        frappe.set_user("Administrator")
        result = portal_projects.list_projects(filters='{"has_blockers": true}')
        self.assertIsInstance(result, list)

    def test_get_project_members_handles_missing_schema(self):
        frappe.set_user("Administrator")
        result = portal_projects.get_project_members(project_id="nonexistent")
        self.assertIsInstance(result, list)

    def test_bulk_move_tasks_with_empty_list(self):
        frappe.set_user("Administrator")
        result = portal_projects.bulk_move_tasks(task_ids=[], target_sprint="S1")
        self.assertEqual(result, {"moved": 0})

    def test_relink_task_kr_validates_kr_existence(self):
        frappe.set_user("Administrator")
        with self.assertRaises(frappe.ValidationError):
            portal_projects.relink_task_kr(task_ids=[], kr_id="ghost-kr-doesnt-exist")

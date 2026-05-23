import frappe
from frappe.tests.utils import FrappeTestCase

from vernon_tasks.task.api import okr


class TestOkrGetForProject(FrappeTestCase):
    def test_get_for_project_nonexistent_returns_empty_shape(self):
        frappe.set_user("Administrator")
        result = okr.get_for_project("nonexistent-project-id")
        self.assertEqual(result, {"objective": None, "key_results": []})

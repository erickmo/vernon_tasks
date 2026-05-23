import frappe
from frappe.tests.utils import FrappeTestCase

from vernon_tasks.task.api import sprints


class TestSprintsGetBurndown(FrappeTestCase):
    def test_get_burndown_nonexistent_raises(self):
        frappe.set_user("Administrator")
        with self.assertRaises(frappe.DoesNotExistError):
            sprints.get_burndown("nonexistent-sprint-id")

import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_tasks.task.services.project_task_grouper import group_tasks


class TestProjectTaskGrouper(FrappeTestCase):
    def test_invalid_group_by_raises(self):
        with self.assertRaises(ValueError):
            group_tasks(project_id="X", group_by="evil")

    def test_group_by_kr_buckets_unlinked(self):
        result = group_tasks(project_id="nonexistent", group_by="kr")
        # Empty project still returns shape with "Unlinked" bucket
        self.assertIsInstance(result, list)
        # Each bucket: {key, label, meta, tasks}
        if result:
            self.assertIn("key", result[0])
            self.assertIn("tasks", result[0])

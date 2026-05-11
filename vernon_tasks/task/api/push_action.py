import frappe
from vernon_tasks.task.api.my_work_mutations import complete


@frappe.whitelist()
def complete_from_notification(task_id: str) -> dict:
    return complete(task_id)

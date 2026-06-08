import frappe
from frappe.utils import nowdate, get_first_day_of_week, add_days

from vernon_tasks.task.services import vt_item_tree as tree


def execute(filters=None):
    filters = filters or {}
    columns = _get_columns()
    data = _get_data(filters)
    return columns, data


def _get_columns():
    return [
        {
            "fieldname": "name",
            "label": "Task",
            "fieldtype": "Link",
            "options": "VT Item",
            "width": 160,
        },
        {
            "fieldname": "title",
            "label": "Task Title",
            "fieldtype": "Data",
            "width": 220,
        },
        {
            "fieldname": "project",
            "label": "Project",
            "fieldtype": "Link",
            "options": "VT Item",
            "width": 160,
        },
        {
            "fieldname": "assigned_to",
            "label": "Assigned To",
            "fieldtype": "Link",
            "options": "User",
            "width": 150,
        },
        {
            "fieldname": "review_scheduled_date",
            "label": "Review Date",
            "fieldtype": "Date",
            "width": 120,
        },
        {
            "fieldname": "review_estimated_minutes",
            "label": "Review Est. (min)",
            "fieldtype": "Float",
            "width": 130,
        },
        {
            "fieldname": "deadline",
            "label": "Deadline",
            "fieldtype": "Date",
            "width": 120,
        },
    ]


def _get_data(filters):
    today = nowdate()
    from_date = filters.get("from_date") or get_first_day_of_week(today)
    to_date = filters.get("to_date") or add_days(from_date, 6)

    node_filters = {
        "pdca_phase": "CHECK",
        "review_scheduled_date": ["between", [from_date, to_date]],
    }

    nodes = tree.nodes(
        "Task",
        filters=node_filters,
        fields=[
            "name",
            "title",
            "owner_user",
            "review_scheduled_date",
            "review_estimated_minutes",
            "deadline",
        ],
        order_by="review_scheduled_date asc",
    )

    project_filter = filters.get("project")
    rows = []
    for node in nodes:
        # VT Task.project becomes the nearest Project ancestor in the tree.
        node_project = tree.project_of(node.get("name"))
        if project_filter and node_project != project_filter:
            continue
        rows.append({
            "name": node.get("name"),
            "title": node.get("title"),
            "project": node_project,
            # APIs/columns still expose the legacy "assigned_to" key.
            "assigned_to": node.get("owner_user"),
            "review_scheduled_date": node.get("review_scheduled_date"),
            "review_estimated_minutes": node.get("review_estimated_minutes"),
            "deadline": node.get("deadline"),
        })

    if not rows:
        return []

    total_minutes = sum(r.get("review_estimated_minutes") or 0 for r in rows)
    rows.append({
        "title": "Total Review Minutes",
        "review_estimated_minutes": total_minutes,
        "is_grand_total": True,
    })

    return rows

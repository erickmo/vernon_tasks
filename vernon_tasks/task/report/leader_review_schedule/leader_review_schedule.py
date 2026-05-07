import frappe
from frappe.utils import nowdate, get_first_day_of_week, add_days


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
            "options": "VT Task",
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
            "options": "VT Project",
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
            "fieldname": "review_estimated_hours",
            "label": "Review Est. (hrs)",
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

    conditions = "WHERE pdca_phase = 'CHECK' AND review_scheduled_date BETWEEN %(from_date)s AND %(to_date)s"
    values = {"from_date": from_date, "to_date": to_date}

    if filters.get("project"):
        conditions += " AND project = %(project)s"
        values["project"] = filters["project"]

    rows = frappe.db.sql(
        f"""
        SELECT name, title, project, assigned_to,
               review_scheduled_date, review_estimated_hours, deadline
        FROM `tabVT Task`
        {conditions}
        ORDER BY review_scheduled_date ASC
        """,
        values,
        as_dict=True,
    )

    if not rows:
        return []

    total_hours = sum(r.get("review_estimated_hours") or 0 for r in rows)
    rows.append({
        "title": "Total Review Hours",
        "review_estimated_hours": total_hours,
        "is_grand_total": True,
    })

    return rows

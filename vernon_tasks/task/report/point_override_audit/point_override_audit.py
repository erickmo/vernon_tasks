import frappe


def execute(filters=None):
    filters = filters or {}
    columns = [
        {"fieldname": "task", "label": "Task", "fieldtype": "Link", "options": "VT Item", "width": 180},
        {"fieldname": "task_title", "label": "Task Title", "fieldtype": "Data", "width": 220},
        {"fieldname": "user", "label": "User", "fieldtype": "Link", "options": "User", "width": 150},
        {"fieldname": "original_amount", "label": "Original Points", "fieldtype": "Float", "width": 120},
        {"fieldname": "amount", "label": "Override Delta", "fieldtype": "Float", "width": 120},
        {"fieldname": "overridden_by", "label": "Overridden By", "fieldtype": "Link", "options": "User", "width": 150},
        {"fieldname": "note", "label": "Reason", "fieldtype": "Data", "width": 250},
        {"fieldname": "log_timestamp", "label": "Date", "fieldtype": "Datetime", "width": 150},
    ]
    conditions = "WHERE tpl.transaction_type = 'leader_override'"
    values = {}
    if filters.get("user"):
        conditions += " AND tpl.user = %(user)s"
        values["user"] = filters["user"]
    if filters.get("from_date"):
        conditions += " AND DATE(tpl.log_timestamp) >= %(from_date)s"
        values["from_date"] = filters["from_date"]
    if filters.get("to_date"):
        conditions += " AND DATE(tpl.log_timestamp) <= %(to_date)s"
        values["to_date"] = filters["to_date"]
    data = frappe.db.sql(f"""
        SELECT tpl.task, t.title AS task_title, tpl.user,
               tpl.original_amount, tpl.amount, tpl.overridden_by,
               tpl.note, tpl.log_timestamp
        FROM `tabTask Point Log` tpl
        INNER JOIN `tabVT Item` t ON t.name = tpl.task AND t.node_type = 'Task'
        {conditions} ORDER BY tpl.log_timestamp DESC
    """, values, as_dict=True)
    return columns, data

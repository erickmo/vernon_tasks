import frappe


def execute(filters=None):
    columns = [
        {"fieldname": "task", "label": "Task", "fieldtype": "Link", "options": "VT Task", "width": 200},
        {"fieldname": "title", "label": "Title", "fieldtype": "Data", "width": 250},
        {"fieldname": "assigned_to", "label": "Assigned To", "fieldtype": "Link", "options": "User", "width": 150},
        {"fieldname": "project", "label": "Project", "fieldtype": "Link", "options": "VT Project", "width": 150},
        {"fieldname": "deadline", "label": "Deadline", "fieldtype": "Date", "width": 100},
        {"fieldname": "blocked_by", "label": "Blocked By Task", "fieldtype": "Link", "options": "VT Task", "width": 200},
        {"fieldname": "blocked_by_title", "label": "Blocker Title", "fieldtype": "Data", "width": 200},
        {"fieldname": "days_blocked", "label": "Days Blocked", "fieldtype": "Int", "width": 100},
    ]
    data = frappe.db.sql("""
        SELECT t.name AS task, t.title, t.assigned_to, t.project, t.deadline,
               td.blocked_by, bt.title AS blocked_by_title,
               DATEDIFF(CURDATE(), t.modified) AS days_blocked
        FROM `tabVT Task` t
        INNER JOIN `tabTask Dependency` td ON td.parent = t.name
        INNER JOIN `tabVT Task` bt ON bt.name = td.blocked_by
        WHERE t.pdca_phase NOT IN ('DONE') AND bt.pdca_phase NOT IN ('DONE')
        ORDER BY t.deadline ASC, days_blocked DESC
    """, as_dict=True)
    return columns, data

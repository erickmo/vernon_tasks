import frappe


def execute(filters=None):
    filters = filters or {}
    columns = [
        {"fieldname": "sprint", "label": "Sprint", "fieldtype": "Link", "options": "VT Sprint", "width": 160},
        {"fieldname": "sprint_title", "label": "Title", "fieldtype": "Data", "width": 200},
        {"fieldname": "project", "label": "Project", "fieldtype": "Link", "options": "VT Project", "width": 160},
        {"fieldname": "start_date", "label": "Start", "fieldtype": "Date", "width": 100},
        {"fieldname": "end_date", "label": "End", "fieldtype": "Date", "width": 100},
        {"fieldname": "total_weight", "label": "Planned Wt", "fieldtype": "Float", "width": 110},
        {"fieldname": "done_weight", "label": "Done Wt", "fieldtype": "Float", "width": 100},
        {"fieldname": "velocity_pct", "label": "Velocity %", "fieldtype": "Percent", "width": 100},
    ]
    cond, vals = "", {}
    if filters.get("project"):
        cond = "WHERE s.project = %(project)s"
        vals["project"] = filters["project"]
    data = frappe.db.sql(f"""
        SELECT s.name AS sprint, s.sprint_title, s.project, s.start_date, s.end_date,
               COALESCE(SUM(t.weight),0) AS total_weight,
               COALESCE(SUM(CASE WHEN t.pdca_phase='DONE' THEN t.weight ELSE 0 END),0) AS done_weight
        FROM `tabVT Sprint` s
        LEFT JOIN `tabSprint Task` st ON st.parent=s.name
        LEFT JOIN `tabVT Task` t ON t.name=st.task {cond}
        GROUP BY s.name ORDER BY s.start_date DESC
    """, vals, as_dict=True)
    for row in data:
        row.velocity_pct = round(row.done_weight / row.total_weight * 100, 1) if row.total_weight else 0
    return columns, data

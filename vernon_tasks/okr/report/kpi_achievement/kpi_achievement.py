import frappe


def execute(filters=None):
    filters = filters or {}
    columns = [
        {"fieldname": "kpi", "label": "KPI", "fieldtype": "Link", "options": "KPI Definition", "width": 180},
        {"fieldname": "frequency", "label": "Freq", "fieldtype": "Data", "width": 100},
        {"fieldname": "date", "label": "Date", "fieldtype": "Date", "width": 100},
        {"fieldname": "value", "label": "Value", "fieldtype": "Float", "width": 100},
        {"fieldname": "unit", "label": "Unit", "fieldtype": "Data", "width": 80},
        {"fieldname": "notes", "label": "Notes", "fieldtype": "Data", "width": 200},
    ]
    cond, vals = "WHERE 1=1", {}
    if filters.get("kpi_definition"):
        cond += " AND ke.kpi_definition=%(kpi)s"
        vals["kpi"] = filters["kpi_definition"]
    if filters.get("from_date"):
        cond += " AND ke.date>=%(from_date)s"
        vals["from_date"] = filters["from_date"]
    if filters.get("to_date"):
        cond += " AND ke.date<=%(to_date)s"
        vals["to_date"] = filters["to_date"]
    data = frappe.db.sql(f"""
        SELECT ke.kpi_definition AS kpi, kd.frequency, ke.date, ke.value, kd.unit, ke.notes
        FROM `tabKPI Entry` ke
        INNER JOIN `tabKPI Definition` kd ON kd.name=ke.kpi_definition
        {cond} ORDER BY ke.date DESC
    """, vals, as_dict=True)
    return columns, data

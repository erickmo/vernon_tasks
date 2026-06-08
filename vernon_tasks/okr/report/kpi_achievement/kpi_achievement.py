import frappe

# KPI nodes live in the unified VT Item tree (node_type="KPI"); the legacy
# KPI Definition fields kpi_name/unit/frequency are now VT Item.title/unit/
# frequency, and KPI Entry rows are the child table "kpi_entries" (doctype
# "VT Item KPI Entry") on the KPI node.
_KPI = "KPI"
_ENTRY_TABLE = "tabVT Item KPI Entry"


def execute(filters=None):
    filters = filters or {}
    columns = [
        {"fieldname": "kpi", "label": "KPI", "fieldtype": "Link", "options": "VT Item", "width": 180},
        {"fieldname": "frequency", "label": "Freq", "fieldtype": "Data", "width": 100},
        {"fieldname": "date", "label": "Date", "fieldtype": "Date", "width": 100},
        {"fieldname": "value", "label": "Value", "fieldtype": "Float", "width": 100},
        {"fieldname": "unit", "label": "Unit", "fieldtype": "Data", "width": 80},
        {"fieldname": "notes", "label": "Notes", "fieldtype": "Data", "width": 200},
    ]
    # Resolve KPI node(s) to read; without a kpi filter we span every KPI node.
    kpi_filters = {"node_type": _KPI}
    if filters.get("kpi_definition"):
        kpi_filters["name"] = filters["kpi_definition"]
    kpi_nodes = frappe.get_all(
        "VT Item", filters=kpi_filters,
        fields=["name", "frequency", "unit"],
    )
    if not kpi_nodes:
        return columns, []

    cond, vals = "WHERE e.parenttype='VT Item' AND e.parent IN %(kpis)s", {
        "kpis": tuple(n["name"] for n in kpi_nodes),
    }
    if filters.get("from_date"):
        cond += " AND e.date>=%(from_date)s"
        vals["from_date"] = filters["from_date"]
    if filters.get("to_date"):
        cond += " AND e.date<=%(to_date)s"
        vals["to_date"] = filters["to_date"]
    rows = frappe.db.sql(f"""
        SELECT e.parent AS kpi, e.date, e.value, e.notes
        FROM `{_ENTRY_TABLE}` e
        {cond} ORDER BY e.date DESC
    """, vals, as_dict=True)

    meta = {n["name"]: n for n in kpi_nodes}
    data = []
    for r in rows:
        node = meta.get(r["kpi"], {})
        data.append({
            "kpi": r["kpi"],
            "frequency": node.get("frequency"),
            "date": r["date"],
            "value": r["value"],
            "unit": node.get("unit"),
            "notes": r["notes"],
        })
    return columns, data

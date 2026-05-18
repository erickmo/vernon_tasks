import frappe

from vernon_tasks.okr.period_parser import parse_period


def execute():
    frappe.reload_doc("okr", "doctype", "objective")
    columns = frappe.db.sql("SHOW COLUMNS FROM `tabObjective` LIKE 'period_%%'")
    column_names = {c[0] for c in columns}
    if "period_start" not in column_names or "period_end" not in column_names:
        # Columns still missing after reload; skip — schema sync later in migrate will add them, patch can re-run.
        return
    rows = frappe.db.sql(
        "SELECT name, period FROM `tabObjective` WHERE period_start IS NULL OR period_end IS NULL",
        as_dict=True,
    )
    unparsed = []
    for row in rows:
        parsed = parse_period(row.period)
        if not parsed:
            unparsed.append(row.name)
            continue
        start, end = parsed
        frappe.db.set_value(
            "Objective",
            row.name,
            {
                "period_start": start,
                "period_end": end,
            },
            update_modified=False,
        )
    if unparsed:
        frappe.log_error(
            message=f"Objective period dates could not be auto-filled for: {unparsed}",
            title="add_objective_period_dates: unparsed periods",
        )
    frappe.db.commit()

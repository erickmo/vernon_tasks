import frappe


def list_kpis() -> list[dict]:
    rows = frappe.db.sql("""
        SELECT name, kpi_name, unit, frequency
        FROM `tabKPI Definition`
        ORDER BY kpi_name ASC
    """, as_dict=True)
    return [{
        "name": r["name"],
        "kpi_name": r["kpi_name"],
        "unit": r["unit"],
        "frequency": r["frequency"],
    } for r in rows]


def get_kpi_trend(kpi_definition: str, periods: int = 12) -> dict:
    if not frappe.db.exists("KPI Definition", kpi_definition):
        raise frappe.DoesNotExistError(f"KPI Definition not found: {kpi_definition}")

    meta = frappe.db.get_value(
        "KPI Definition", kpi_definition,
        ["kpi_name", "unit"], as_dict=True,
    )

    rows = frappe.db.sql("""
        SELECT date, value
        FROM `tabKPI Entry`
        WHERE kpi_definition = %(kpi)s
        ORDER BY date DESC
        LIMIT %(n)s
    """, {"kpi": kpi_definition, "n": periods}, as_dict=True)

    ordered = list(reversed(rows))
    return {
        "labels": [str(r["date"]) for r in ordered],
        "values": [float(r["value"]) for r in ordered],
        "unit": meta["unit"] or "",
        "kpi_name": meta["kpi_name"],
    }

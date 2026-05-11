import frappe

_CLOSED_STATUS = "Closed"


def get_okr_rollup(period: str | None = None) -> list[dict]:
    where = "WHERE o.status != %(closed)s"
    params = {"closed": _CLOSED_STATUS}
    if period:
        where += " AND o.period = %(period)s"
        params["period"] = period

    rows = frappe.db.sql(f"""
        SELECT
            o.name AS objective,
            o.title AS title,
            o.objective_owner AS owner,
            o.status AS status,
            COALESCE(AVG(kr.progress_percent), 0) AS progress,
            COUNT(kr.name) AS kr_count
        FROM `tabObjective` o
        LEFT JOIN `tabKey Result` kr ON kr.objective = o.name
        {where}
        GROUP BY o.name
        ORDER BY progress DESC, o.title ASC
    """, params, as_dict=True)

    return [{
        "objective": r["objective"],
        "title": r["title"],
        "owner": r["owner"],
        "status": r["status"],
        "progress": round(float(r["progress"]), 2),
        "kr_count": int(r["kr_count"]),
    } for r in rows]

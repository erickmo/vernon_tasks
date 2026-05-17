import frappe


@frappe.whitelist()
def list_objectives(filters=None):
    if isinstance(filters, str):
        import json
        filters = json.loads(filters)
    filters = filters or {}

    conditions = ["1=1"]
    params = {}

    period_start = filters.get("period_start")
    period_end = filters.get("period_end")
    if period_start and period_end:
        conditions.append("(o.period_end IS NULL OR o.period_end >= %(ps)s)")
        conditions.append("(o.period_start IS NULL OR o.period_start <= %(pe)s)")
        params["ps"] = period_start
        params["pe"] = period_end

    owners = filters.get("owners") or []
    if owners:
        conditions.append("o.objective_owner IN %(owners)s")
        params["owners"] = tuple(owners)

    statuses = filters.get("statuses") or []
    if statuses:
        conditions.append("o.status IN %(statuses)s")
        params["statuses"] = tuple(statuses)

    pdca_phases = filters.get("pdca_phases") or []
    if pdca_phases:
        conditions.append("o.pdca_phase IN %(pdca_phases)s")
        params["pdca_phases"] = tuple(pdca_phases)

    where = " AND ".join(conditions)
    sql = f"""
        SELECT
          o.name, o.title, o.period, o.period_start, o.period_end,
          o.objective_owner, o.status, o.pdca_phase, o.modified,
          COALESCE(AVG(kr.progress_percent), 0) AS progress_avg
        FROM `tabObjective` o
        LEFT JOIN `tabKey Result` kr ON kr.objective = o.name
        WHERE {where}
        GROUP BY o.name
        ORDER BY o.period DESC, o.modified DESC
        LIMIT 500
    """
    return frappe.db.sql(sql, params, as_dict=True)


@frappe.whitelist()
def get_objective_with_krs(name):
    if not frappe.db.exists("Objective", name):
        raise frappe.DoesNotExistError(f"Objective {name} not found")
    obj = frappe.get_doc("Objective", name).as_dict()
    krs = frappe.get_all(
        "Key Result",
        filters={"objective": name},
        fields=["name", "metric", "target_value", "current_value", "unit",
                "progress_percent", "modified"],
        order_by="modified asc",
    )
    return {"objective": obj, "key_results": krs}

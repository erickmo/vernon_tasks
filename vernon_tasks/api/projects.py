import frappe


@frappe.whitelist()
def list_projects(filters=None):
    if isinstance(filters, str):
        import json
        filters = json.loads(filters)
    filters = filters or {}

    conditions = ["1=1"]
    params = {}

    period_start = filters.get("period_start")
    period_end = filters.get("period_end")
    if period_start and period_end:
        conditions.append("(p.end_date IS NULL OR p.end_date >= %(ps)s)")
        conditions.append("(p.start_date IS NULL OR p.start_date <= %(pe)s)")
        params["ps"] = period_start
        params["pe"] = period_end
    elif period_start:
        conditions.append("(p.end_date IS NULL OR p.end_date >= %(ps)s)")
        params["ps"] = period_start
    elif period_end:
        conditions.append("(p.start_date IS NULL OR p.start_date <= %(pe)s)")
        params["pe"] = period_end

    statuses = filters.get("statuses") or []
    if statuses:
        conditions.append("p.status IN %(statuses)s")
        params["statuses"] = tuple(statuses)

    pdca_phases = filters.get("pdca_phases") or []
    if pdca_phases:
        conditions.append("p.pdca_phase IN %(pdca_phases)s")
        params["pdca_phases"] = tuple(pdca_phases)

    leaders = filters.get("leaders") or []
    if leaders:
        conditions.append("p.project_leader IN %(leaders)s")
        params["leaders"] = tuple(leaders)

    owners = filters.get("owners") or []
    if owners:
        conditions.append("p.project_owner IN %(owners)s")
        params["owners"] = tuple(owners)

    where = " AND ".join(conditions)
    sql = f"""
        SELECT
          p.name, p.title, p.project_owner, p.project_leader,
          p.start_date, p.end_date, p.status, p.pdca_phase,
          p.objective, p.modified,
          o.title AS linked_objective_title,
          (SELECT COUNT(*) FROM `tabProject Team Member` t WHERE t.parent = p.name) AS team_count,
          (SELECT COUNT(*) FROM `tabProject Milestone` m WHERE m.parent = p.name) AS milestone_count,
          (SELECT COUNT(*) FROM `tabVT Sprint` s WHERE s.project = p.name) AS sprint_count
        FROM `tabVT Project` p
        LEFT JOIN `tabObjective` o ON o.name = p.objective
        WHERE {where}
        ORDER BY p.start_date DESC, p.modified DESC
        LIMIT 500
    """
    return frappe.db.sql(sql, params, as_dict=True)

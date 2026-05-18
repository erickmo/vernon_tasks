import frappe

VALID_SPRINT_STATUSES = {"Planning", "Active", "Review", "Closed"}


def _parse_filters(filters):
    if filters is None:
        return {}
    if isinstance(filters, str):
        import json
        return json.loads(filters)
    return filters


@frappe.whitelist()
def list_sprints(project, filters=None):
    filters = _parse_filters(filters)
    if not project:
        frappe.throw("project is required")

    conditions = ["s.project = %(project)s"]
    params = {"project": project}

    statuses = filters.get("statuses") or []
    if statuses:
        conditions.append("s.status IN %(statuses)s")
        params["statuses"] = tuple(statuses)

    period_start = filters.get("period_start")
    period_end = filters.get("period_end")
    if period_start and period_end:
        conditions.append("(s.end_date IS NULL OR s.end_date >= %(ps)s)")
        conditions.append("(s.start_date IS NULL OR s.start_date <= %(pe)s)")
        params["ps"] = period_start
        params["pe"] = period_end

    where = " AND ".join(conditions)
    sql = f"""
        SELECT
          s.name, s.sprint_title, s.project, s.start_date, s.end_date,
          s.status, s.goal, s.modified,
          (SELECT COUNT(*) FROM `tabVT Task` t WHERE t.sprint = s.name) AS task_count,
          COALESCE((SELECT SUM(t.estimated_hours) FROM `tabVT Task` t
                    WHERE t.sprint = s.name AND t.kanban_status != 'Done'), 0) AS open_hours,
          COALESCE((SELECT SUM(t.estimated_hours) FROM `tabVT Task` t
                    WHERE t.sprint = s.name AND t.kanban_status = 'Done'), 0) AS completed_hours
        FROM `tabVT Sprint` s
        WHERE {where}
        ORDER BY s.start_date DESC, s.modified DESC
        LIMIT 200
    """
    return frappe.db.sql(sql, params, as_dict=True)

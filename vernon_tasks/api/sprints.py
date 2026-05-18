import frappe
import time

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


def _lazy_populate_ranks(sprint):
    rows = frappe.db.sql(
        "SELECT name, creation FROM `tabVT Task` WHERE sprint = %s AND kanban_rank IS NULL ORDER BY creation",
        (sprint,),
        as_dict=True,
    )
    for r in rows:
        rank = float(int(r["creation"].timestamp()) * 1000)
        frappe.db.set_value("VT Task", r["name"], "kanban_rank", rank, update_modified=False)
    if rows:
        frappe.db.commit()


@frappe.whitelist()
def get_sprint_with_relations(name):
    if not frappe.db.exists("VT Sprint", name):
        raise frappe.DoesNotExistError(f"VT Sprint {name} not found")

    _lazy_populate_ranks(name)

    sprint = frappe.get_doc("VT Sprint", name).as_dict()
    project_name = sprint.get("project")
    project_summary = None
    if project_name and frappe.db.exists("VT Project", project_name):
        project_summary = frappe.db.get_value(
            "VT Project", project_name,
            ["name", "title", "status", "pdca_phase", "start_date", "end_date"],
            as_dict=True,
        )

    tasks = frappe.db.sql(
        """
        SELECT name, title, assigned_to, kanban_status, pdca_phase,
               kanban_rank, estimated_hours, weight, priority, deadline
        FROM `tabVT Task`
        WHERE sprint = %s
        ORDER BY kanban_rank ASC, creation ASC
        """,
        (name,),
        as_dict=True,
    )
    return {"sprint": sprint, "project_summary": project_summary, "tasks": tasks}


SPRINT_MUTABLE_FIELDS = {"sprint_title", "start_date", "end_date", "status", "goal"}


def _validate_sprint_payload(payload):
    if payload.get("status") and payload["status"] not in VALID_SPRINT_STATUSES:
        frappe.throw(f"Invalid sprint status: {payload['status']}")
    start = payload.get("start_date")
    end = payload.get("end_date")
    if start and end and str(end) < str(start):
        frappe.throw("end_date must be >= start_date")


@frappe.whitelist()
def create_sprint(payload):
    payload = _parse_filters(payload)
    _validate_sprint_payload(payload)
    if not payload.get("project"):
        frappe.throw("project is required")
    doc = frappe.get_doc({
        "doctype": "VT Sprint",
        "sprint_title": payload["sprint_title"],
        "project": payload["project"],
        "start_date": payload["start_date"],
        "end_date": payload["end_date"],
        "status": payload.get("status", "Planning"),
        "goal": payload.get("goal", ""),
    }).insert()
    return {"name": doc.name}


@frappe.whitelist()
def update_sprint(name, payload):
    payload = _parse_filters(payload)
    _validate_sprint_payload(payload)
    if not frappe.db.exists("VT Sprint", name):
        raise frappe.DoesNotExistError(f"VT Sprint {name} not found")
    doc = frappe.get_doc("VT Sprint", name)
    for field in SPRINT_MUTABLE_FIELDS:
        if field in payload:
            setattr(doc, field, payload[field])
    doc.save()
    return {"name": doc.name}


@frappe.whitelist()
def bulk_update_sprints(names, payload):
    if isinstance(names, str):
        import json
        names = json.loads(names)
    payload = _parse_filters(payload)

    updated = []
    skipped = []
    status = payload.get("status")
    if status and status not in VALID_SPRINT_STATUSES:
        return {"updated": [], "skipped": [{"name": n, "reason": "invalid_status"} for n in names]}

    for name in names:
        if not frappe.db.exists("VT Sprint", name):
            skipped.append({"name": name, "reason": "not_found"})
            continue
        try:
            doc = frappe.get_doc("VT Sprint", name)
            if status:
                doc.status = status
            doc.save()
            updated.append(name)
        except frappe.PermissionError:
            skipped.append({"name": name, "reason": "no_permission"})
    return {"updated": updated, "skipped": skipped}

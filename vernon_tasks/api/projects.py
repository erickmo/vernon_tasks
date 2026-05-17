import frappe

from vernon_tasks.okr.pdca import next_pdca_phase

VALID_PROJECT_STATUSES = {"Open", "On Track", "At Risk", "Closed"}


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


@frappe.whitelist()
def get_project_with_relations(name):
    if not frappe.db.exists("VT Project", name):
        raise frappe.DoesNotExistError(f"VT Project {name} not found")
    project = frappe.get_doc("VT Project", name).as_dict()

    linked_objective_summary = None
    obj_name = project.get("objective")
    if obj_name and frappe.db.exists("Objective", obj_name):
        obj = frappe.db.get_value(
            "Objective", obj_name,
            ["name", "title", "period", "status"], as_dict=True
        )
        avg_progress = frappe.db.sql(
            "SELECT COALESCE(AVG(progress_percent), 0) AS avg FROM `tabKey Result` WHERE objective = %s",
            obj_name, as_dict=True
        )
        obj["avg_kr_progress"] = float(avg_progress[0]["avg"]) if avg_progress else 0.0
        linked_objective_summary = obj

    counts = {
        "team_members": frappe.db.count("Project Team Member", {"parent": name}),
        "milestones": frappe.db.count("Project Milestone", {"parent": name}),
        "sprints": frappe.db.count("VT Sprint", {"project": name}),
        "documentation": frappe.db.count("Project Documentation", {"parent": name}),
    }

    return {
        "project": project,
        "linked_objective_summary": linked_objective_summary,
        "counts": counts,
    }


@frappe.whitelist()
def bulk_update_projects(names, payload):
    if isinstance(names, str):
        import json
        names = json.loads(names)
    if isinstance(payload, str):
        import json
        payload = json.loads(payload)
    if not isinstance(names, list) or not names:
        return {"updated": [], "skipped": []}
    payload = payload or {}

    target_status = payload.get("status")
    target_pdca = payload.get("pdca_phase")

    if target_status and target_status not in VALID_PROJECT_STATUSES:
        frappe.throw(f"Invalid status: {target_status}", frappe.ValidationError)

    updated = []
    skipped = []
    for name in names:
        if not frappe.has_permission("VT Project", "write", doc=name):
            skipped.append({"name": name, "reason": "no_permission"})
            continue

        changes = {}
        if target_status:
            changes["status"] = target_status

        if target_pdca:
            if target_pdca == "__next__":
                current = frappe.db.get_value("VT Project", name, "pdca_phase")
                nxt = next_pdca_phase(current)
                if nxt is None:
                    skipped.append({
                        "name": name,
                        "reason": "already_closed" if current == "CLOSED" else "invalid_phase",
                    })
                    continue
                changes["pdca_phase"] = nxt
            else:
                changes["pdca_phase"] = target_pdca

        if not changes:
            skipped.append({"name": name, "reason": "no_changes"})
            continue

        for field, value in changes.items():
            frappe.db.set_value("VT Project", name, field, value)
        updated.append({"name": name, "changes": changes})

    frappe.db.commit()
    return {"updated": updated, "skipped": skipped}

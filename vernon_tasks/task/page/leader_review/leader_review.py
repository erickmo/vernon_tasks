import frappe


def _leader_project_names(user: str) -> list:
    rows = frappe.db.sql("""
        SELECT p.name FROM `tabVT Project` p
        WHERE p.project_leader = %(user)s
        UNION
        SELECT ptm.parent FROM `tabProject Team Member` ptm
        WHERE ptm.user = %(user)s AND ptm.role = 'Leader'
    """, {"user": user}, as_dict=True)
    return [r.name for r in rows]


def _is_leader_of_project(user: str, project: str) -> bool:
    proj_leader = frappe.db.get_value("VT Project", project, "project_leader")
    if proj_leader == user:
        return True
    return bool(frappe.db.exists(
        "Project Team Member",
        {"parent": project, "user": user, "role": "Leader"},
    ))


@frappe.whitelist()
def get_review_queue() -> list:
    user = frappe.session.user
    projects = _leader_project_names(user)
    if not projects:
        return []
    placeholders = ", ".join(["%s"] * len(projects))
    return frappe.db.sql(f"""
        SELECT t.name, t.title, t.project, t.priority, t.deadline,
               t.assigned_to, t.pdca_phase, t.kanban_status,
               t.estimated_hours, t.review_scheduled_date
        FROM `tabVT Task` t
        WHERE t.pdca_phase = 'CHECK'
          AND t.project IN ({placeholders})
        ORDER BY
            FIELD(t.priority, 'Critical', 'High', 'Medium', 'Low'),
            t.deadline ASC
    """, projects, as_dict=True)


@frappe.whitelist()
def get_team_workload() -> list:
    user = frappe.session.user
    projects = _leader_project_names(user)
    if not projects:
        return []
    placeholders = ", ".join(["%s"] * len(projects))
    rows = frappe.db.sql(f"""
        SELECT t.assigned_to, COALESCE(SUM(t.estimated_hours), 0) AS total_hours
        FROM `tabVT Task` t
        WHERE t.pdca_phase NOT IN ('DONE', 'BACKLOG')
          AND t.project IN ({placeholders})
          AND t.assigned_to IS NOT NULL
          AND t.assigned_to != ''
        GROUP BY t.assigned_to
        ORDER BY total_hours DESC
    """, projects, as_dict=True)
    capacity = frappe.db.get_single_value("VT Settings", "default_daily_target_hours") or 8.0
    for r in rows:
        r["capacity"] = float(capacity)
        r["overloaded"] = r["total_hours"] > float(capacity)
    return rows


@frappe.whitelist()
def get_team_blocked_tasks() -> list:
    user = frappe.session.user
    projects = _leader_project_names(user)
    if not projects:
        return []
    placeholders = ", ".join(["%s"] * len(projects))
    return frappe.db.sql(f"""
        SELECT
            t.name, t.title, t.project, t.priority, t.deadline,
            t.assigned_to, t.pdca_phase, t.kanban_status,
            td.blocked_by AS blocker_name,
            bt.title AS blocker_title,
            bt.assigned_to AS blocker_assignee,
            DATEDIFF(CURDATE(), t.start_date) AS days_blocked
        FROM `tabVT Task` t
        INNER JOIN `tabTask Dependency` td ON td.parent = t.name
        INNER JOIN `tabVT Task` bt ON bt.name = td.blocked_by
        WHERE t.pdca_phase NOT IN ('DONE')
          AND bt.pdca_phase != 'DONE'
          AND t.project IN ({placeholders})
        ORDER BY days_blocked DESC
    """, projects, as_dict=True)


@frappe.whitelist()
def approve_task(task_name: str) -> dict:
    user = frappe.session.user
    doc = frappe.get_doc("VT Task", task_name)
    if not _is_leader_of_project(user, doc.project):
        frappe.throw("Not authorized to approve this task", frappe.PermissionError)
    if doc.pdca_phase != "CHECK":
        frappe.throw(
            f"Task must be in CHECK phase to approve (current phase: {doc.pdca_phase})",
            frappe.ValidationError,
        )
    doc.pdca_phase = "DONE"
    doc.save(ignore_permissions=True)
    doc.submit()
    return {"status": "ok"}


@frappe.whitelist()
def reject_task(task_name: str, reason: str) -> dict:
    user = frappe.session.user
    if not reason or not reason.strip():
        frappe.throw("Rejection reason is required", frappe.ValidationError)
    doc = frappe.get_doc("VT Task", task_name)
    if not _is_leader_of_project(user, doc.project):
        frappe.throw("Not authorized to reject this task", frappe.PermissionError)
    if doc.pdca_phase != "CHECK":
        frappe.throw(
            f"Task must be in CHECK phase to reject (current phase: {doc.pdca_phase})",
            frappe.ValidationError,
        )
    frappe.db.set_value("VT Task", task_name, {
        "pdca_phase": "DO",
        "kanban_status": "In Progress",
        "rejection_note": reason.strip(),
    })
    return {"status": "ok"}

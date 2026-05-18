import json
import frappe
from datetime import date as _date

TASK_MUTABLE_FIELDS_MANAGER_LEADER = {
    "title", "deadline", "assigned_to", "kanban_status", "priority", "estimated_hours", "pdca_phase"
}
TASK_MUTABLE_FIELDS_MEMBER = {"title", "kanban_status", "pdca_phase"}

VALID_KANBAN_STATUSES = {
    "Backlog", "Scheduled", "In Progress", "In Review", "Revision", "Done", "Blocked"
}
VALID_PDCA_PHASES = {"BACKLOG", "PLAN", "DO", "CHECK", "ACT", "DONE"}
KANBAN_TO_PDCA = {
    "Backlog": "BACKLOG",
    "Scheduled": "PLAN",
    "In Progress": "DO",
    "In Review": "CHECK",
    "Revision": "ACT",
    "Done": "DONE",
}

TASK_DETAIL_FIELDS = [
    "name", "title", "deadline", "assigned_to", "kanban_status", "priority",
    "base_points", "pdca_phase", "completion_date", "project", "sprint",
    "estimated_hours", "kanban_rank",
]

ROLE_MANAGER = "VT Manager"
ROLE_LEADER = "VT Leader"
ROLE_MEMBER = "VT Member"
DOCTYPE_TASK = "VT Task"
DOCTYPE_SPRINT = "VT Sprint"
DOCTYPE_USER = "User"


def _parse_payload(payload):
    if payload is None:
        return {}
    if isinstance(payload, str):
        return json.loads(payload)
    return payload


def _get_user_role(project):
    user = frappe.session.user
    user_roles = set(frappe.get_roles(user))
    if ROLE_MANAGER in user_roles:
        return "Manager"
    if ROLE_LEADER in user_roles:
        return "Leader"
    if ROLE_MEMBER in user_roles:
        return "Member"
    return None


def _get_user_role_for_task(task_name):
    project = frappe.db.get_value(DOCTYPE_TASK, task_name, "project")
    return _get_user_role(project)


def _permitted_fields(task_doc, project, role):
    if role in ("Manager", "Leader"):
        return list(TASK_MUTABLE_FIELDS_MANAGER_LEADER)
    if role == "Member" and task_doc.assigned_to == frappe.session.user:
        return list(TASK_MUTABLE_FIELDS_MEMBER)
    return []


def _assert_task_readable(task):
    if not frappe.db.exists(DOCTYPE_TASK, task):
        frappe.throw(f"{DOCTYPE_TASK} {task} not found")


def _apply_task_updates(task_doc, payload, allowed):
    """Validate payload fields and return a dict of field→value updates."""
    for field in payload:
        if field not in TASK_MUTABLE_FIELDS_MANAGER_LEADER:
            continue
        if field not in allowed:
            raise frappe.PermissionError(
                f"Not allowed to update field '{field}' as "
                f"{frappe.session.user or 'non-member'}"
            )

    updates = {}

    if "title" in payload:
        if not str(payload["title"]).strip():
            frappe.throw("title cannot be empty")
        updates["title"] = payload["title"].strip()

    if "kanban_status" in payload:
        if payload["kanban_status"] not in VALID_KANBAN_STATUSES:
            frappe.throw(f"Invalid kanban_status: {payload['kanban_status']}")
        updates["kanban_status"] = payload["kanban_status"]
        mapped_pdca = KANBAN_TO_PDCA.get(payload["kanban_status"])
        if mapped_pdca:
            updates["pdca_phase"] = mapped_pdca
        if payload["kanban_status"] == "Done" and not task_doc.completion_date:
            updates["completion_date"] = _date.today()

    if "pdca_phase" in payload:
        if payload["pdca_phase"] not in VALID_PDCA_PHASES:
            frappe.throw(f"Invalid pdca_phase: {payload['pdca_phase']}")
        updates["pdca_phase"] = payload["pdca_phase"]

    if "priority" in payload:
        updates["priority"] = payload["priority"]

    if "estimated_hours" in payload:
        updates["estimated_hours"] = float(payload["estimated_hours"])

    if "assigned_to" in payload:
        updates["assigned_to"] = payload["assigned_to"]

    if "deadline" in payload:
        updates["deadline"] = payload["deadline"] or None

    return updates


@frappe.whitelist()
def get_task_detail(task):
    _assert_task_readable(task)
    task_data = frappe.db.get_value(
        DOCTYPE_TASK, task,
        TASK_DETAIL_FIELDS,
        as_dict=True,
    )
    role = _get_user_role(task_data.get("project"))
    task_doc_stub = frappe._dict({"assigned_to": task_data.get("assigned_to")})
    fields = _permitted_fields(task_doc_stub, task_data.get("project"), role)

    assigned_to_full_name = None
    if task_data.get("assigned_to"):
        assigned_to_full_name = frappe.db.get_value(
            DOCTYPE_USER, task_data["assigned_to"], "full_name"
        )
    task_data["assigned_to_full_name"] = assigned_to_full_name

    for f in ("deadline", "completion_date"):
        if task_data.get(f):
            task_data[f] = str(task_data[f])

    return {"task": task_data, "permitted_fields": fields}


@frappe.whitelist()
def update_task(task, payload):
    payload = _parse_payload(payload)
    _assert_task_readable(task)
    task_doc = frappe.get_doc(DOCTYPE_TASK, task)
    role = _get_user_role(task_doc.project)
    allowed = set(_permitted_fields(task_doc, task_doc.project, role))

    updates = _apply_task_updates(task_doc, payload, allowed)

    if updates:
        frappe.db.set_value(DOCTYPE_TASK, task, updates, update_modified=True)

    return get_task_detail(task)


@frappe.whitelist()
def create_task(payload):
    payload = _parse_payload(payload)

    if not str(payload.get("title", "")).strip():
        frappe.throw("title is required")

    sprint_name = payload.get("sprint")
    project_name = payload.get("project")
    if not sprint_name:
        frappe.throw("sprint is required")
    if not project_name:
        frappe.throw("project is required")

    sprint = frappe.get_doc(DOCTYPE_SPRINT, sprint_name)
    role = _get_user_role(project_name)

    if role == "Member" and sprint.status != "Active":
        raise frappe.PermissionError("Members can only create tasks in Active sprints")

    doc = frappe.get_doc({
        "doctype": DOCTYPE_TASK,
        "title": payload["title"].strip(),
        "sprint": sprint_name,
        "project": project_name,
        "priority": payload.get("priority", "Medium"),
        "estimated_hours": payload.get("estimated_hours", 1.0),
        "deadline": payload.get("deadline") or None,
        "assigned_to": payload.get("assigned_to") or frappe.session.user,
        "pdca_phase": payload.get("pdca_phase", "BACKLOG"),
        "kanban_status": payload.get("kanban_status", "Backlog"),
        "kanban_rank": None,
    }).insert(ignore_permissions=True)

    task_data = frappe.db.get_value(
        DOCTYPE_TASK, doc.name,
        ["name", "title", "assigned_to", "kanban_status", "pdca_phase",
         "kanban_rank", "estimated_hours", "priority", "deadline"],
        as_dict=True,
    )
    if task_data.get("deadline"):
        task_data["deadline"] = str(task_data["deadline"])
    if not task_data.get("kanban_rank"):
        task_data["kanban_rank"] = None

    return {"name": doc.name, "task": task_data}

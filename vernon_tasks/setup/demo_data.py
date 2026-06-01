"""Optional demo data: one brand, project, sprint, and three tasks.

Layer: setup utility (not a doctype controller). This module spans four
doctypes (VT Brand, VT Project, VT Sprint, VT Task) with no single owning
lifecycle — justifying placement here rather than in a controller method.
Compare: setup/roles.py which is similarly cross-doctype.

Every created document is recorded in VT Settings.demo_data_refs (JSON list)
so clear() can delete exactly what it made without touching unrelated data.
"""
import json
import frappe

# --- Constants ---------------------------------------------------------------

_REFS_FIELD = "demo_data_refs"
_BRAND_NAME = "Brand Demo"
_PROJECT_TITLE = "Proyek Demo"
_SPRINT_TITLE = "Sprint Demo 1"
_PROJECT_DURATION_DAYS = 30
_SPRINT_DURATION_DAYS = 14
_TASK_DEADLINE_DAYS = 7

_DEMO_TASKS = [
    {"title": "Demo: Siapkan brief", "kanban_status": "Backlog", "base_points": 3},
    {"title": "Demo: Desain awal", "kanban_status": "In Progress", "base_points": 5},
    {"title": "Demo: Review internal", "kanban_status": "In Review", "base_points": 2},
]


# --- Internal helpers --------------------------------------------------------

def _get_refs() -> list:
    """Read demo_data_refs from VT Settings; return empty list if unset."""
    raw = frappe.db.get_single_value("VT Settings", _REFS_FIELD)
    if not raw:
        return []
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        return []


def _set_refs(refs: list) -> None:
    """Persist refs list to VT Settings.demo_data_refs as JSON."""
    frappe.db.set_single_value("VT Settings", _REFS_FIELD, json.dumps(refs))


# --- Public API --------------------------------------------------------------

def load(user: str | None = None) -> dict:
    """Create demo brand / project / sprint / tasks owned by `user`.

    The demo project sets `user` as both project_owner and project_leader.
    VTProject._validate_team_excludes_owner_leader blocks owner/leader from
    also appearing in team_members, so team_members is intentionally left
    empty here — the owner/leader pair already covers all role scenarios.

    Every created document is appended to VT Settings.demo_data_refs so that
    clear() can clean up deterministically.

    Args:
        user: Frappe User email. Falls back to frappe.session.user.

    Returns:
        Dict with counts: {"brand": 1, "project": 1, "sprint": 1, "tasks": N}
    """
    user = user or frappe.session.user
    if _get_refs():
        # Demo already loaded; no-op so a repeated call cannot duplicate records.
        return {"brand": 0, "project": 0, "sprint": 0, "tasks": 0, "already_loaded": True}
    refs = []

    try:
        today = frappe.utils.today()

        # --- Brand ---------------------------------------------------------------
        if not frappe.db.exists("VT Brand", _BRAND_NAME):
            brand = frappe.get_doc({"doctype": "VT Brand", "brand_name": _BRAND_NAME})
            brand.insert(ignore_permissions=True)
            refs.append({"doctype": "VT Brand", "name": brand.name})
        brand_name = _BRAND_NAME

        # --- Project -------------------------------------------------------------
        # team_members is left empty: user is already project_owner + project_leader,
        # and _validate_team_excludes_owner_leader would throw if they also appeared
        # as a child row (VTProject controller, see vt_project.py line ~121).
        project = frappe.get_doc({
            "doctype": "VT Project",
            "title": _PROJECT_TITLE,
            "brand": brand_name,
            "project_owner": user,
            "project_leader": user,
            "start_date": today,
            "end_date": frappe.utils.add_days(today, _PROJECT_DURATION_DAYS),
        })
        project.insert(ignore_permissions=True)
        refs.append({"doctype": "VT Project", "name": project.name})

        # --- Sprint --------------------------------------------------------------
        sprint = frappe.get_doc({
            "doctype": "VT Sprint",
            "sprint_title": _SPRINT_TITLE,
            "project": project.name,
            "start_date": today,
            "end_date": frappe.utils.add_days(today, _SPRINT_DURATION_DAYS),
        })
        sprint.insert(ignore_permissions=True)
        refs.append({"doctype": "VT Sprint", "name": sprint.name})

        # --- Tasks ---------------------------------------------------------------
        task_count = 0
        for t in _DEMO_TASKS:
            task = frappe.get_doc({
                "doctype": "VT Task",
                "title": t["title"],
                "project": project.name,
                "assigned_to": user,
                "kanban_status": t["kanban_status"],
                "base_points": t["base_points"],
                "deadline": frappe.utils.add_days(today, _TASK_DEADLINE_DAYS),
            })
            task.insert(ignore_permissions=True)
            refs.append({"doctype": "VT Task", "name": task.name})
            task_count += 1

        _set_refs(refs)
        frappe.db.commit()
    except Exception:
        # Never leave half-created demo records behind.
        frappe.db.rollback()
        raise
    return {"brand": 1, "project": 1, "sprint": 1, "tasks": task_count}


def clear() -> dict:
    """Delete exactly the documents recorded in demo_data_refs (reverse order).

    Reverse-order deletion prevents FK constraint failures: tasks and sprints
    reference the project, so they must be removed before the project.

    Returns:
        Dict with count of removed documents: {"removed": N}
    """
    refs = _get_refs()
    for ref in reversed(refs):
        if frappe.db.exists(ref["doctype"], ref["name"]):
            frappe.delete_doc(
                ref["doctype"], ref["name"],
                force=True,
                ignore_permissions=True,
            )
    _set_refs([])
    frappe.db.commit()
    return {"removed": len(refs)}

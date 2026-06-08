"""Optional demo data: one brand + a VT Item subtree (project, sprint, tasks).

Layer: setup utility (not a doctype controller). It spans VT Brand + the
unified VT Item hierarchy (Project/Sprint/Task nodes) with no single owning
lifecycle — justifying placement here rather than in a controller method.
Compare: setup/roles.py which is similarly cross-doctype.

Every created document is recorded in VT Settings.demo_data_refs (JSON object
keyed by user) so clear() can delete exactly what it made without touching
unrelated data. Per-user storage ensures multi-user isolation.
"""
import json
import frappe

# --- Constants ---------------------------------------------------------------

_REFS_FIELD = "demo_data_refs"
_ITEM = "VT Item"
_BRAND_NAME = "Brand Demo"
_PROJECT_TITLE = "Proyek Demo"
_SPRINT_TITLE = "Sprint Demo 1"
_PROJECT_DURATION_DAYS = 30
_SPRINT_DURATION_DAYS = 14
_TASK_DEADLINE_DAYS = 7

# Demo tasks carry a pdca_phase; the VT Item controller DERIVES kanban_status
# from it (PDCA_KANBAN_MAP), so we never set kanban_status directly.
_DEMO_TASKS = [
    {"title": "Demo: Siapkan brief", "pdca_phase": "BACKLOG", "base_points": 3},
    {"title": "Demo: Desain awal", "pdca_phase": "DO", "base_points": 5},
    {"title": "Demo: Review internal", "pdca_phase": "CHECK", "base_points": 2},
]


# --- Internal helpers --------------------------------------------------------

def _get_all_refs():
    raw = frappe.db.get_single_value("VT Settings", _REFS_FIELD)
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except (ValueError, TypeError):
        return {}
    return data if isinstance(data, dict) else {}


def _get_refs(user):
    return _get_all_refs().get(user, [])


def _set_refs(user, refs):
    data = _get_all_refs()
    if refs:
        data[user] = refs
    else:
        data.pop(user, None)
    frappe.db.set_single_value("VT Settings", _REFS_FIELD, json.dumps(data))


def has_demo(user):
    """True if `user` currently has demo data loaded."""
    return bool(_get_refs(user))


# --- Public API --------------------------------------------------------------

def load(user: str | None = None) -> dict:
    """Create a demo brand + VT Item subtree (project → sprint, tasks) for `user`.

    The demo project sets `user` as both owner_user and leader_user. Tasks are
    parented to the project node (backlog-style, no sprint link) and assigned to
    `user`. Every created document is appended to VT Settings.demo_data_refs so
    clear() can clean up deterministically (reverse order = leaves before group,
    which the nested set requires).

    Args:
        user: Frappe User email. Falls back to frappe.session.user.

    Returns:
        Dict with counts: {"brand": 1, "project": 1, "sprint": 1, "tasks": N}
    """
    user = user or frappe.session.user
    if _get_refs(user):
        # Demo already loaded for this user; no-op so a repeated call cannot duplicate records.
        return {"brand": 0, "project": 0, "sprint": 0, "tasks": 0, "already_loaded": True}
    refs = []

    try:
        today = frappe.utils.today()

        # --- Brand (VT Brand is not part of the hierarchy merge) -----------------
        if not frappe.db.exists("VT Brand", _BRAND_NAME):
            brand = frappe.get_doc({"doctype": "VT Brand", "brand_name": _BRAND_NAME})
            brand.insert(ignore_permissions=True)
            refs.append({"doctype": "VT Brand", "name": brand.name})
        brand_name = _BRAND_NAME

        # --- Project node --------------------------------------------------------
        project = frappe.get_doc({
            "doctype": _ITEM,
            "node_type": "Project",
            "title": _PROJECT_TITLE,
            "brand": brand_name,
            "owner_user": user,
            "leader_user": user,
            "start_date": today,
            "end_date": frappe.utils.add_days(today, _PROJECT_DURATION_DAYS),
        })
        project.insert(ignore_permissions=True)
        refs.append({"doctype": _ITEM, "name": project.name})

        # --- Sprint node (child of the project) ----------------------------------
        sprint = frappe.get_doc({
            "doctype": _ITEM,
            "node_type": "Sprint",
            "title": _SPRINT_TITLE,
            "parent_vt_item": project.name,
            "start_date": today,
            "end_date": frappe.utils.add_days(today, _SPRINT_DURATION_DAYS),
        })
        sprint.insert(ignore_permissions=True)
        refs.append({"doctype": _ITEM, "name": sprint.name})

        # --- Task nodes (parented to the project; kanban derived from pdca) ------
        task_count = 0
        for t in _DEMO_TASKS:
            task = frappe.get_doc({
                "doctype": _ITEM,
                "node_type": "Task",
                "title": t["title"],
                "parent_vt_item": project.name,
                "owner_user": user,
                "pdca_phase": t["pdca_phase"],
                "base_points": t["base_points"],
                "deadline": frappe.utils.add_days(today, _TASK_DEADLINE_DAYS),
            })
            task.insert(ignore_permissions=True)
            refs.append({"doctype": _ITEM, "name": task.name})
            task_count += 1

        _set_refs(user, refs)
        frappe.db.commit()
    except Exception:
        # Never leave half-created demo records behind.
        frappe.db.rollback()
        raise
    return {"brand": 1, "project": 1, "sprint": 1, "tasks": task_count}


def clear(user=None) -> dict:
    """Delete the demo docs recorded for `user` (reverse order).

    Reverse-order deletion removes Task/Sprint leaf nodes before the Project
    group node — required by the nested set (a group with children cannot be
    deleted) and by ref ordering.

    Args:
        user: Frappe User email. Falls back to frappe.session.user.

    Returns:
        Dict with count of removed documents: {"removed": N}
    """
    user = user or frappe.session.user
    refs = _get_refs(user)
    for ref in reversed(refs):
        if frappe.db.exists(ref["doctype"], ref["name"]):
            frappe.delete_doc(ref["doctype"], ref["name"], force=True, ignore_permissions=True)
    _set_refs(user, [])
    frappe.db.commit()
    return {"removed": len(refs)}

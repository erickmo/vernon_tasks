"""Onboarding state for the vt-home checklist card.

Per-user completion is DERIVED from the user's data, because Frappe's native
Onboarding Step.is_complete is a single global flag shared across all users and
therefore wrong for per-contributor onboarding. The native Module Onboarding
records (seeded separately) mirror this catalog for the Workspace surface only.
"""
import frappe
from vernon_tasks.setup import demo_data
from vernon_tasks.task.services import vt_item_tree as tree

_DISMISS_KEY = "vt_onboarding_dismissed"
# Project team membership lives in the `team_members` child table on the
# Project VT Item node; its rows carry parenttype 'VT Item' (was 'VT Project').
_TEAM_TABLE = "tabProject Team Member"
_VT_ITEM = "VT Item"

# Canonical step catalog. `route_kind`/`route_target` tell the client how to act.
_ONBOARDING_STEPS = [
    {"key": "buat_brand", "title": "Buat brand", "route_kind": "page", "route_target": "vt-brands"},
    {"key": "buat_proyek", "title": "Buat proyek pertama", "route_kind": "quick_create_project", "route_target": ""},
    {"key": "tambah_tim", "title": "Tambah anggota tim", "route_kind": "page", "route_target": "vt-team"},
    {"key": "buat_task", "title": "Buat task pertama", "route_kind": "new_doc", "route_target": "VT Item"},
]


def _member_project_names(user):
    """Project node names where `user` appears in the team_members child table.

    Replaces the legacy `Project Team Member WHERE parenttype='VT Project'`
    lookup: team_members is now a child table on the Project VT Item node
    (parenttype 'VT Item')."""
    try:
        rows = frappe.db.sql(
            """
            SELECT DISTINCT parent FROM `{table}`
             WHERE parenttype = %(pt)s AND user = %(u)s
            """.format(table=_TEAM_TABLE),
            {"pt": _VT_ITEM, "u": user},
            as_dict=True,
        )
    except (frappe.db.OperationalError, frappe.db.ProgrammingError):
        return set()
    return {r["parent"] for r in rows}


def _user_project_names(user):
    """Names of Project nodes the user owns, leads, or is a team member of."""
    owned = tree.nodes("Project", filters={"owner_user": user}, fields=["name"])
    led = tree.nodes("Project", filters={"leader_user": user}, fields=["name"])
    names = {r["name"] for r in owned} | {r["name"] for r in led}
    return names | _member_project_names(user)


def _is_complete(key, user, project_names):
    """Derive per-user completion for one step key from actual data."""
    if key == "buat_brand":
        return bool(frappe.db.count("VT Brand"))
    if key == "buat_proyek":
        return bool(project_names)
    if key == "tambah_tim":
        if not project_names:
            return False
        return bool(frappe.db.exists(
            "Project Team Member",
            {"parent": ["in", list(project_names)], "parenttype": _VT_ITEM},
        ))
    if key == "buat_task":
        return bool(
            tree.nodes("Task", filters={"owner_user": user}, limit=1)
            or tree.nodes("Task", filters={"owner": user}, limit=1)
        )
    return False


@frappe.whitelist()
def get_onboarding_state():
    """Return the onboarding checklist with per-user derived completion."""
    user = frappe.session.user
    project_names = _user_project_names(user)
    steps = [
        {**s, "is_complete": _is_complete(s["key"], user, project_names)}
        for s in _ONBOARDING_STEPS
    ]
    done = sum(1 for s in steps if s["is_complete"])
    dismissed = bool(frappe.defaults.get_user_default(_DISMISS_KEY))
    has_demo = demo_data.has_demo(user)
    return {
        "steps": steps,
        "progress": {"done": done, "total": len(steps)},
        "dismissed": dismissed,
        "has_demo": has_demo,
        "show": (not dismissed) and (done < len(steps)),
    }


@frappe.whitelist()
def dismiss_onboarding():
    """Persist a per-user dismissal of the onboarding card."""
    frappe.defaults.set_user_default(_DISMISS_KEY, 1)
    return {"ok": 1}


@frappe.whitelist()
def load_demo():
    """Create optional demo data for the current user."""
    return demo_data.load(frappe.session.user)


@frappe.whitelist()
def clear_demo():
    """Remove the demo data created by load_demo for the current user."""
    return demo_data.clear(frappe.session.user)

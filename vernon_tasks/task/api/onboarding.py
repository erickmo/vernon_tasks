"""Onboarding state for the vt-home checklist card.

Per-user completion is DERIVED from the user's data, because Frappe's native
Onboarding Step.is_complete is a single global flag shared across all users and
therefore wrong for per-contributor onboarding. The native Module Onboarding
records (seeded separately) mirror this catalog for the Workspace surface only.
"""
import frappe
from vernon_tasks.setup import demo_data

_DISMISS_KEY = "vt_onboarding_dismissed"

# Canonical step catalog. `route_kind`/`route_target` tell the client how to act.
_ONBOARDING_STEPS = [
    {"key": "buat_brand", "title": "Buat brand", "route_kind": "page", "route_target": "vt-brands"},
    {"key": "buat_proyek", "title": "Buat proyek pertama", "route_kind": "quick_create_project", "route_target": ""},
    {"key": "tambah_tim", "title": "Tambah anggota tim", "route_kind": "page", "route_target": "vt-team"},
    {"key": "buat_task", "title": "Buat task pertama", "route_kind": "new_doc", "route_target": "VT Task"},
]


def _user_project_names(user):
    """Names of projects the user owns, leads, or is a team member of."""
    owned = frappe.get_all("VT Project", filters={"project_owner": user}, pluck="name")
    led = frappe.get_all("VT Project", filters={"project_leader": user}, pluck="name")
    member = frappe.get_all(
        "Project Team Member", filters={"user": user, "parenttype": "VT Project"}, pluck="parent"
    )
    return set(owned) | set(led) | set(member)


def _is_complete(key, user, project_names):
    """Derive per-user completion for one step key from actual data."""
    if key == "buat_brand":
        return bool(frappe.db.count("VT Brand"))
    if key == "buat_proyek":
        return bool(project_names)
    if key == "tambah_tim":
        return any(
            frappe.db.count("Project Team Member", {"parent": p, "parenttype": "VT Project"}) >= 1
            for p in project_names
        )
    if key == "buat_task":
        return bool(
            frappe.db.exists("VT Task", {"assigned_to": user})
            or frappe.db.exists("VT Task", {"owner": user})
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
    has_demo = bool(frappe.db.get_single_value("VT Settings", "demo_data_refs"))
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
    """Remove the demo data created by load_demo."""
    return demo_data.clear()

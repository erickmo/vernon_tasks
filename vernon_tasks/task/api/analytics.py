import frappe
from vernon_tasks.task.services.burndown_service import get_burndown as _get_burndown
from vernon_tasks.task.services.velocity_service import get_velocity_trend as _get_velocity_trend
from vernon_tasks.task.services.forecast_service import get_forecast as _get_forecast
from vernon_tasks.task.services.risk_evaluator import evaluate_risks as _evaluate_risks
from vernon_tasks.task.api.security import clamp_int

_ALLOWED_ROLES = ("VT Leader", "VT Manager")
_CACHE_TTL = 3600


def _guard():
    if not set(frappe.get_roles()) & set(_ALLOWED_ROLES):
        frappe.throw("Not authorized", frappe.PermissionError)


def _cache_get_or_set(key, fn):
    cached = frappe.cache().get_value(key)
    if cached is not None:
        return cached
    val = fn()
    frappe.cache().set_value(key, val, expires_in_sec=_CACHE_TTL)
    return val


@frappe.whitelist()
def get_burndown(sprint):
    _guard()
    return _get_burndown(sprint)


@frappe.whitelist()
def get_velocity_trend(project, n=6):
    _guard()
    n = clamp_int(n, 1, 24, "n")
    key = f"vt_velocity:{project}:{n}"
    return _cache_get_or_set(key, lambda: _get_velocity_trend(project, n))


@frappe.whitelist()
def get_forecast(project):
    _guard()
    key = f"vt_forecast:{project}"
    return _cache_get_or_set(key, lambda: _get_forecast(project))


@frappe.whitelist()
def get_risks(project):
    _guard()
    return _evaluate_risks(project)


def invalidate_project_cache(doc, method=None):
    """Hook target (VT Item on_update) — clears velocity + forecast cache for the
    affected project. Resolves the project from the tree: a Project node IS the
    project; a Sprint/Task node's project is its nearest ancestor; other node
    types (OKR/KPI) have no project cache to clear."""
    node_type = getattr(doc, "node_type", None)
    if node_type == "Project":
        project = doc.name
    elif node_type in ("Sprint", "Task"):
        from vernon_tasks.task.services import vt_item_tree as tree
        project = tree.project_of(doc.name)
    else:
        return
    if not project:
        return
    for n in (3, 6, 12):
        frappe.cache().delete_value(f"vt_velocity:{project}:{n}")
    frappe.cache().delete_value(f"vt_forecast:{project}")
    # Portal velocity/forecast cache keys include {bucket}:{n}:{user} segments
    # (e.g. "pr:vel:leader:6:user@example.com"). Enumerating all users to build
    # those keys would be expensive, so we intentionally skip eager invalidation
    # and let those keys expire by their 300s TTL instead.
    frappe.cache().delete_value("pr:health:manager")

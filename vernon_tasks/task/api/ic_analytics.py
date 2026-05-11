import frappe
from vernon_tasks.task.services.leaderboard_service import get_leaderboard as _lb
from vernon_tasks.task.services.personal_velocity_service import get_personal_velocity as _pv
from vernon_tasks.task.services.streak_service import get_streak as _streak

_ALLOWED_ROLES = ("VT Member", "VT Leader", "VT Manager")


def _guard():
    if not set(frappe.get_roles()) & set(_ALLOWED_ROLES):
        frappe.throw("Not authorized", frappe.PermissionError)


@frappe.whitelist()
def get_leaderboard(period="month", limit=10):
    _guard()
    return _lb(period, int(limit))


@frappe.whitelist()
def get_personal_velocity(project, n=6):
    _guard()
    return _pv(frappe.session.user, project, int(n))


@frappe.whitelist()
def get_streak(project):
    _guard()
    return _streak(frappe.session.user, project)

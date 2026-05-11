import frappe
from vernon_tasks.task.services.okr_rollup_service import get_okr_rollup as _okr
from vernon_tasks.task.services.kpi_trend_service import (
    get_kpi_trend as _kpi_trend,
    list_kpis as _list_kpis,
)
from vernon_tasks.task.services.health_score_service import get_health_score as _health
from vernon_tasks.task.api.security import clamp_int

_ALLOWED_ROLES = ("VT Manager", "System Manager")


def _guard():
    if not set(frappe.get_roles()) & set(_ALLOWED_ROLES):
        frappe.throw("Not authorized", frappe.PermissionError)


@frappe.whitelist()
def get_okr_rollup(period=None):
    _guard()
    return _okr(period)


@frappe.whitelist()
def list_kpis():
    _guard()
    return _list_kpis()


@frappe.whitelist()
def get_kpi_trend(kpi_definition, periods=12):
    _guard()
    periods = clamp_int(periods, 1, 24, "periods")
    return _kpi_trend(kpi_definition, periods)


@frappe.whitelist()
def get_health_score():
    _guard()
    return _health()

"""Portal Dashboard API — single bundled endpoint."""
import frappe

from vernon_tasks.task.api.security import require_login
from vernon_tasks.task.services.dashboard_aggregator import build_home_payload

ALLOWED_ROLES = {"ic", "leader", "pm", "exec"}
DEFAULT_ROLE = "ic"


@frappe.whitelist()
def get_home(role: str = DEFAULT_ROLE) -> dict:
    require_login()
    safe_role = role if role in ALLOWED_ROLES else DEFAULT_ROLE
    return build_home_payload(user=frappe.session.user, role=safe_role)

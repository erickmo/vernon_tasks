"""Grant a sensible default VT role to users who hold none.

Wired to the `on_session_creation` framework event (hooks.py). There is no
VT-owned doctype lifecycle for "a user logged in", so this is a framework-event
concern rather than a controller method.
"""
import frappe

DEFAULT_ROLE = "VT Member"
_VT_ROLES = ("VT Manager", "VT Leader", "VT Member")
_SKIP_USERS = ("Administrator", "Guest")


def grant_default_role(login_manager):
    """On session creation, give `VT Member` to any non-admin user with no VT role.

    Idempotent: does nothing if the user already holds any VT role. Called by
    Frappe with `login_manager` whose `.user` is the authenticated username.
    """
    user = getattr(login_manager, "user", None)
    if not user or user in _SKIP_USERS:
        return
    if set(_VT_ROLES) & set(frappe.get_roles(user)):
        return
    try:
        frappe.get_doc("User", user).add_roles(DEFAULT_ROLE)
    except Exception:
        # An optional default-role grant must never break the login flow.
        frappe.log_error(title="grant_default_role failed")

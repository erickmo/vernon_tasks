import frappe

_ALLOWED_ROLES = ("VT Leader", "VT Manager")


def get_context(context):
    if not set(frappe.get_roles()) & set(_ALLOWED_ROLES):
        frappe.throw("Not authorized", frappe.PermissionError)
    return context

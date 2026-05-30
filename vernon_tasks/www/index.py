import frappe

no_cache = 1

# Logged-in users land on the vt-home dashboard; guests go to login.
DASHBOARD_ROUTE = "/app/vt-home"


def get_context(context):
    if frappe.session.user == "Guest":
        frappe.local.flags.redirect_location = "/login"
    else:
        frappe.local.flags.redirect_location = DASHBOARD_ROUTE
    raise frappe.Redirect

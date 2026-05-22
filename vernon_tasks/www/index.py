import frappe

no_cache = 1


def get_context(context):
    if frappe.session.user == "Guest":
        frappe.local.flags.redirect_location = "/login"
    else:
        frappe.local.flags.redirect_location = "/m/dashboard"
    raise frappe.Redirect

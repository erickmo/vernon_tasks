import frappe


@frappe.whitelist(allow_guest=True)
def boot():
    user = frappe.session.user
    if user == "Guest":
        return {"user": None, "csrf_token": None, "roles": []}
    return {
        "user": user,
        "csrf_token": frappe.sessions.get_csrf_token(),
        "roles": frappe.get_roles(user),
    }

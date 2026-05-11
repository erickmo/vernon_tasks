import frappe


@frappe.whitelist(allow_guest=True)
def boot():
    user = frappe.session.user
    push_public_key = (
        frappe.db.get_single_value("VT Settings", "push_vapid_public_key") or ""
    )
    if user == "Guest":
        return {
            "user": None,
            "csrf_token": None,
            "roles": [],
            "push_public_key": push_public_key,
        }
    return {
        "user": user,
        "csrf_token": frappe.sessions.get_csrf_token(),
        "roles": frappe.get_roles(user),
        "push_public_key": push_public_key,
    }

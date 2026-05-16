import frappe

_DEFAULT_HEADLINE = "Kelola tugas tim dengan lebih cerdas."
_DEFAULT_SUBTEXT = (
    "Sprint, kanban, dan analitik dalam satu tempat"
    " — dirancang untuk tim yang bergerak cepat."
)


@frappe.whitelist(allow_guest=True)
def boot():
    user = frappe.session.user
    settings = frappe.db.get_singles_dict("VT Settings")
    push_public_key = settings.get("push_vapid_public_key") or ""
    login_branding = {
        "headline": settings.get("login_headline") or _DEFAULT_HEADLINE,
        "subtext": settings.get("login_subtext") or _DEFAULT_SUBTEXT,
    }
    if user == "Guest":
        return {
            "user": None,
            "csrf_token": None,
            "roles": [],
            "push_public_key": push_public_key,
            "login_branding": login_branding,
        }
    return {
        "user": user,
        "csrf_token": frappe.sessions.get_csrf_token(),
        "roles": frappe.get_roles(user),
        "push_public_key": push_public_key,
        "login_branding": login_branding,
    }

import frappe

no_cache = 1


def get_context(context):
    if frappe.session.user != "Guest":
        frappe.local.flags.redirect_location = "/m/work"
        raise frappe.Redirect

    context.csrf_token = frappe.sessions.get_csrf_token()
    context.redirect_to = frappe.form_dict.get("redirect_to") or "/m/work"
    context.dev_shortcuts = _get_dev_shortcuts()


def _get_dev_shortcuts() -> list[dict]:
    if not frappe.conf.get("developer_mode"):
        return []
    return [
        {"usr": "Administrator", "pwd": "admin", "label": "Administrator"},
    ]

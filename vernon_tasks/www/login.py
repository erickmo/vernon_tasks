import frappe

no_cache = 1


def get_context(context):
    if frappe.session.user != "Guest":
        frappe.local.flags.redirect_location = "/m/work"
        raise frappe.Redirect

    context.csrf_token = frappe.sessions.get_csrf_token()
    redirect_to = frappe.form_dict.get("redirect_to") or "/m/work"
    if not redirect_to.startswith("/"):
        redirect_to = "/m/work"
    context.redirect_to = redirect_to
    context.dev_shortcuts = _get_dev_shortcuts()


def _get_dev_shortcuts() -> list[dict]:
    if not frappe.conf.get("developer_mode"):
        return []
    pwd = frappe.conf.get("dev_password", "admin")
    return [
        {"usr": "Administrator", "pwd": pwd, "label": "Administrator"},
    ]

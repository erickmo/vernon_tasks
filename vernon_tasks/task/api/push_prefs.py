import frappe
from vernon_tasks.task.api.security import rate_limit


_FIELDS = ("event_assignment", "event_mention", "event_due", "event_review")
_DEFAULTS = {f: 1 for f in _FIELDS}


@frappe.whitelist()
def get_prefs() -> dict:
    user = frappe.session.user
    if user == "Guest":
        frappe.throw("Login required", frappe.PermissionError)
    name = frappe.db.exists("Vernon Push Preference", {"user": user})
    if not name:
        return dict(_DEFAULTS)
    row = frappe.db.get_value(
        "Vernon Push Preference", name, list(_FIELDS), as_dict=True
    )
    return {f: int(row[f] or 0) for f in _FIELDS}


@frappe.whitelist()
def update_prefs(
    event_assignment: int = 1,
    event_mention: int = 1,
    event_due: int = 1,
    event_review: int = 1,
) -> dict:
    user = frappe.session.user
    if user == "Guest":
        frappe.throw("Login required", frappe.PermissionError)

    rate_limit("push_prefs", 20)
    values = {
        "event_assignment": int(event_assignment),
        "event_mention": int(event_mention),
        "event_due": int(event_due),
        "event_review": int(event_review),
    }
    name = frappe.db.exists("Vernon Push Preference", {"user": user})
    if name:
        frappe.db.set_value("Vernon Push Preference", name, values)
    else:
        frappe.get_doc(
            {
                "doctype": "Vernon Push Preference",
                "user": user,
                **values,
            }
        ).insert(ignore_permissions=True)
    return {"ok": True}

import frappe
from frappe.utils import now_datetime
from vernon_tasks.task.api.security import max_str, rate_limit, require_login


@frappe.whitelist(allow_guest=True)
def get_public_key() -> dict:
    key = frappe.db.get_single_value("VT Settings", "push_vapid_public_key") or ""
    return {"public_key": key}


@frappe.whitelist()
def subscribe(endpoint: str, p256dh: str, auth: str, user_agent: str = "") -> dict:
    user = frappe.session.user
    if user == "Guest":
        frappe.throw("Login required", frappe.PermissionError)

    rate_limit("push_subscribe", 5)
    endpoint = max_str(endpoint, 2048)

    existing = frappe.db.get_value(
        "Vernon Push Subscription", {"endpoint": endpoint}, "name"
    )
    if existing:
        frappe.db.set_value(
            "Vernon Push Subscription",
            existing,
            {
                "user": user,
                "p256dh": p256dh,
                "auth": auth,
                "user_agent": user_agent,
                "last_seen": now_datetime(),
            },
        )
        return {"ok": True, "renewed": True}

    frappe.get_doc(
        {
            "doctype": "Vernon Push Subscription",
            "user": user,
            "endpoint": endpoint,
            "p256dh": p256dh,
            "auth": auth,
            "user_agent": user_agent,
            "last_seen": now_datetime(),
        }
    ).insert(ignore_permissions=True)
    return {"ok": True, "renewed": False}


@frappe.whitelist()
def unsubscribe(endpoint: str) -> dict:
    require_login()
    user = frappe.session.user
    name = frappe.db.get_value(
        "Vernon Push Subscription",
        {"endpoint": endpoint, "user": user},
        "name",
    )
    if name:
        frappe.delete_doc("Vernon Push Subscription", name, ignore_permissions=True)
    return {"ok": True}


@frappe.whitelist()
def is_subscribed(endpoint: str) -> dict:
    user = frappe.session.user
    if user == "Guest":
        return {"subscribed": False}
    return {
        "subscribed": bool(
            frappe.db.exists(
                "Vernon Push Subscription",
                {"endpoint": endpoint, "user": user},
            )
        ),
    }

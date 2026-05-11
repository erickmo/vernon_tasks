import json

import frappe


def _vapid() -> tuple[str, str, str]:
    pub = frappe.db.get_single_value("VT Settings", "push_vapid_public_key") or ""
    priv = frappe.db.get_single_value("VT Settings", "push_vapid_private_key") or ""
    subject = "mailto:" + (
        frappe.db.get_single_value("System Settings", "email_footer_address")
        or "vernon@localhost"
    )
    return pub, priv, subject


def _target_url(doc) -> str:
    if doc.get("document_type") == "VT Task" and doc.get("document_name"):
        return f"/m/work/{doc.document_name}"
    return "/m/me/notifications"


def send_to_user(user: str, payload: dict) -> int:
    """Send push to every subscription for a user. Returns count delivered."""
    if user == "Guest":
        return 0
    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        frappe.log_error("pywebpush not installed; skipping push", "Vernon Push")
        return 0

    _pub, priv, subject = _vapid()
    if not priv:
        return 0

    subs = frappe.get_all(
        "Vernon Push Subscription",
        filters={"user": user},
        fields=["name", "endpoint", "p256dh", "auth"],
    )
    sent = 0
    for s in subs:
        try:
            webpush(
                subscription_info={
                    "endpoint": s["endpoint"],
                    "keys": {"p256dh": s["p256dh"], "auth": s["auth"]},
                },
                data=json.dumps(payload),
                vapid_private_key=priv,
                vapid_claims={"sub": subject},
                ttl=86400,
            )
            sent += 1
        except WebPushException as e:
            status = getattr(getattr(e, "response", None), "status_code", None)
            if status in (404, 410):
                frappe.delete_doc(
                    "Vernon Push Subscription",
                    s["name"],
                    ignore_permissions=True,
                )
            else:
                frappe.log_error(
                    f"push_sender to {user}: {e}", "Vernon Push"
                )
    return sent


def send_push_for_notification(doc, method=None):
    """Hook target: dispatched on Notification Log insert."""
    if not getattr(doc, "for_user", None) or doc.for_user == "Administrator":
        return
    payload = {
        "title": "Vernon Tasks",
        "body": (doc.subject or "Notifikasi baru")[:120],
        "url": _target_url(doc),
        "tag": doc.name,
    }
    send_to_user(doc.for_user, payload)

import frappe

CACHE_KEY_UNREAD = "vt:notif:unread:{user}"
CACHE_TTL = 30


@frappe.whitelist()
def list(limit: int = 50, offset: int = 0, only_unread: int = 0) -> dict:
    user = frappe.session.user
    if user == "Guest":
        frappe.throw("Login required", frappe.PermissionError)

    filters: dict = {"for_user": user}
    if int(only_unread):
        filters["read"] = 0

    rows = frappe.get_all(
        "Notification Log",
        filters=filters,
        fields=[
            "name",
            "subject",
            "email_content",
            "type",
            "document_type",
            "document_name",
            "read",
            "creation",
        ],
        order_by="creation desc",
        limit_start=int(offset),
        limit_page_length=int(limit),
    )
    return {"results": rows}


@frappe.whitelist()
def mark_read(name: str) -> dict:
    user = frappe.session.user
    doc = frappe.get_doc("Notification Log", name)
    if doc.for_user != user:
        frappe.throw("Forbidden", frappe.PermissionError)
    doc.read = 1
    doc.save(ignore_permissions=True)
    _invalidate_unread_cache(user)
    return {"ok": True}


@frappe.whitelist()
def mark_all_read() -> dict:
    user = frappe.session.user
    if user == "Guest":
        frappe.throw("Login required", frappe.PermissionError)
    frappe.db.set_value(
        "Notification Log",
        {"for_user": user, "read": 0},
        "read",
        1,
        update_modified=False,
    )
    _invalidate_unread_cache(user)
    return {"ok": True}


@frappe.whitelist()
def count_unread() -> dict:
    user = frappe.session.user
    if user == "Guest":
        return {"count": 0}
    key = CACHE_KEY_UNREAD.format(user=user)
    cached = frappe.cache().get_value(key)
    if cached is not None:
        return {"count": int(cached)}
    count = frappe.db.count("Notification Log", {"for_user": user, "read": 0})
    frappe.cache().set_value(key, count, expires_in_sec=CACHE_TTL)
    return {"count": count}


def _invalidate_unread_cache(user: str) -> None:
    frappe.cache().delete_value(CACHE_KEY_UNREAD.format(user=user))

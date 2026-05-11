import json
import frappe
from frappe.utils import add_days, now_datetime

ALLOWED_EVENTS = {
    "pwa_boot",
    "login_success",
    "login_failure",
    "page_view",
    "task_view",
    "offline_seen",
    "error_boundary",
    "sw_register_failed",
    "task_complete",
    "task_complete_undone",
    "task_log",
    "task_snooze",
    "install_prompt_shown",
    "install_accepted",
    "install_dismissed",
    "install_snoozed",
    "search_query",
    "filter_applied",
    "notif_view",
    "notif_tap",
    "notif_mark_all_read",
}

RATE_LIMIT_PER_MINUTE = 60
RETENTION_DAYS = 90


@frappe.whitelist()
def log_event(event: str, props: dict | None = None) -> dict:
    if event not in ALLOWED_EVENTS:
        frappe.throw(f"Unknown telemetry event: {event}")

    user = frappe.session.user
    if user == "Guest":
        return {"ok": False, "reason": "guest"}

    cache_key = f"vt:tel:{user}:{frappe.utils.now()[:16]}"
    count = frappe.cache().incrby(cache_key, 1)
    frappe.cache().expire(cache_key, 90)
    if count > RATE_LIMIT_PER_MINUTE:
        frappe.throw("Telemetry rate limit exceeded")

    props_str = json.dumps(props) if isinstance(props, dict) else (props or None)

    doc = frappe.get_doc({
        "doctype": "Vernon Telemetry Event",
        "event": event,
        "user": user,
        "timestamp": now_datetime(),
        "props": props_str,
    })
    doc.insert(ignore_permissions=True)
    return {"ok": True}


def purge_old_telemetry() -> None:
    cutoff = add_days(now_datetime(), -RETENTION_DAYS)
    frappe.db.delete("Vernon Telemetry Event", {"timestamp": ["<", cutoff]})
    frappe.db.commit()

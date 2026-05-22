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
    "dashboard_view",
    "analytics_view",
    "analytics_period_change",
    "analytics_project_change",
    "leader_review_view",
    "leader_approve",
    "leader_reject",
    "leader_sprint_view",
    "leader_exec_view",
    "leader_project_change",
    "push_subscribe_attempt",
    "push_subscribed",
    "push_unsubscribed",
    "push_received",
    "push_pref_view",
    "push_pref_changed",
    "push_action_complete",
    "portal.page_view",
    "portal.nav_click",
    "portal.permission_denied",
    "portal.error",
    "okr.list_view",
    "okr.detail_view",
    "okr.kr_update",
    "okr.objective_create",
    "okr.objective_edit",
    "okr.bulk_pdca_advance",
    "okr.permission_denied",
    "projects.list_view",
    "projects.detail_view",
    "projects.create",
    "projects.edit",
    "projects.bulk_pdca_advance",
    "projects.bulk_status_set",
    "projects.inline_status_change",
    "projects.objective_link_click",
    "projects.permission_denied",
    "sprints.board_view",
    "sprints.sprint_move",
    "sprints.sprint_created",
    "sprints.sprint_updated",
    "sprints.task_move",
    "sprints.task_rank_change",
    "sprints.task_board_axis_toggle",
    "sprints.burndown_view",
    "sprints.rank_rebalance",
    "portal.notif_bell_open",
    "portal.notif_panel_close",
    "portal.notif_item_click",
    "portal.notif_mark_read",
    "portal.notif_mark_all_read",
    "portal.notif_page_view",
    "portal.notif_filter_change",
    "portal.notif_load_more",
    "tasks.detail_view",
    "tasks.task_updated",
    "tasks.task_created",
    "tasks.comment_added",
    "tasks.comment_deleted",
    "tasks.panel_closed",
    "reports.page_view",
    "reports.tab_view",
    "reports.period_change",
    "reports.kpi_select",
    "reports.velocity_n_change",
    "reports.leaderboard_period_change",
    "reports.overdue_view_toggle",
    "reports.permission_denied",
}

RATE_LIMIT_PER_MINUTE = 60
RETENTION_DAYS = 90
_PROPS_MAX_BYTES = 2048


@frappe.whitelist()
def log_event(event: str, props: dict | None = None) -> dict:
    if event not in ALLOWED_EVENTS:
        frappe.throw(f"Unknown telemetry event: {event}")

    user = frappe.session.user
    if user == "Guest":
        return {"ok": False, "reason": "guest"}

    cache_key = frappe.cache().make_key(f"vt:tel:{user}:{frappe.utils.now()[:16]}")
    count = frappe.cache().incrby(cache_key, 1)
    frappe.cache().expire(cache_key, 90)
    if count > RATE_LIMIT_PER_MINUTE:
        frappe.throw("Telemetry rate limit exceeded")

    if isinstance(props, dict):
        props_str = json.dumps(props)
        if len(props_str) > _PROPS_MAX_BYTES:
            props_str = "{}"
    else:
        props_str = props or None

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

import frappe
from frappe import _
from vernon_tasks.task.api.security import clamp_int

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_UNREAD_CACHE_KEY = "vt:portal:notif:unread:{user}"
_FLAG_CACHE_KEY = "vt:portal:notif:flag"
_VALID_EVENT_TYPES = {"task_assigned", "task_review", "sprint_status", "comment"}

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _get_flag() -> bool:
    """Return portal_notifications_enabled from VT Settings. Cached 60s."""
    cached = frappe.cache().get_value(_FLAG_CACHE_KEY)
    if cached is not None:
        return bool(cached)
    value = frappe.db.get_single_value("VT Settings", "portal_notifications_enabled")
    frappe.cache().set_value(_FLAG_CACHE_KEY, int(bool(value)), expires_in_sec=60)
    return bool(value)


def _require_flag():
    """Raise PermissionError if the feature flag is off."""
    if not _get_flag():
        frappe.throw(_("Portal notifications are not enabled"), frappe.PermissionError)


def _invalidate_unread_cache(user: str) -> None:
    """Delete the unread-count cache entry for a given user."""
    frappe.cache().delete_value(_UNREAD_CACHE_KEY.format(user=user))


def _count_unread_for_user(user: str) -> int:
    """Return live count of unread Vernon Notification rows for user."""
    cached = frappe.cache().get_value(_UNREAD_CACHE_KEY.format(user=user))
    if cached is not None:
        return int(cached)
    count = frappe.db.count("Vernon Notification", {"user": user, "is_read": 0})
    frappe.cache().set_value(
        _UNREAD_CACHE_KEY.format(user=user), count, expires_in_sec=30
    )
    return count


# ---------------------------------------------------------------------------
# queue_notification — shared helper for all doc-event handlers
# ---------------------------------------------------------------------------


def queue_notification(
    user: str,
    event_type: str,
    reference_doctype: str,
    reference_name: str,
    message: str,
) -> None:
    """
    Create a Vernon Notification row for `user`.

    Guards:
    - Skip if user == "Guest"
    - Skip if user == frappe.session.user  (no self-notifications)
    - Skip if an unread row for same (user, event_type, reference_name) already exists
    """
    if not user or user == "Guest":
        return
    if user == frappe.session.user:
        return

    # Deduplication: skip if unread row already exists for same tuple
    existing = frappe.db.exists(
        "Vernon Notification",
        {
            "user": user,
            "event_type": event_type,
            "reference_doctype": reference_doctype,
            "reference_name": reference_name,
            "is_read": 0,
        },
    )
    if existing:
        return

    doc = frappe.get_doc({
        "doctype": "Vernon Notification",
        "user": user,
        "event_type": event_type,
        "reference_doctype": reference_doctype,
        "reference_name": reference_name,
        "message": message,
        "is_read": 0,
    })
    doc.insert(ignore_permissions=True)
    _invalidate_unread_cache(user)


# ---------------------------------------------------------------------------
# Doc-event handlers
# ---------------------------------------------------------------------------


def on_vt_task_update(doc, method):
    """
    Handle VT Task on_update.
    Fires notifications for:
      1. assigned_to change → task_assigned
      2. kanban_status change to Done (approved) or Revision (rejected) → task_review
    """
    if not _get_flag():
        return

    before = getattr(doc, "_doc_before_save", None)
    if before is None:
        return

    # --- task_assigned ---
    new_assigned = doc.assigned_to or ""
    old_assigned = before.assigned_to or ""
    if new_assigned and new_assigned != old_assigned:
        queue_notification(
            user=new_assigned,
            event_type="task_assigned",
            reference_doctype="VT Task",
            reference_name=doc.name,
            message=f"Task assigned to you: {doc.title}",
        )

    # --- task_review (approve/reject via kanban_status change) ---
    new_status = doc.kanban_status or ""
    old_status = before.kanban_status or ""
    if new_status != old_status and new_status in ("Done", "Revision"):
        assigned_to = doc.assigned_to or ""
        if not assigned_to:
            return
        if new_status == "Done":
            action = "approved"
        else:
            action = "rejected"
        queue_notification(
            user=assigned_to,
            event_type="task_review",
            reference_doctype="VT Task",
            reference_name=doc.name,
            message=f"Your task was {action}: {doc.title}",
        )


def on_vt_sprint_update(doc, method):
    """
    Handle VT Sprint on_update.
    Fires sprint_status notifications to all task owners when status → Active or Completed.
    """
    if not _get_flag():
        return

    before = getattr(doc, "_doc_before_save", None)
    if before is None:
        return

    new_status = doc.status or ""
    old_status = before.status or ""

    if new_status == old_status:
        return
    if new_status not in ("Active", "Completed"):
        return

    if new_status == "Active":
        message = f"Sprint started: {doc.sprint_title}"
    else:
        message = f"Sprint completed: {doc.sprint_title}"

    # Gather all assigned_to values for tasks in this sprint
    rows = frappe.get_all(
        "VT Task",
        filters={"sprint": doc.name},
        pluck="assigned_to",
    )
    recipients = list({r for r in rows if r and r != "Guest"})

    if len(recipients) > 100:
        frappe.log_error(
            f"Sprint {doc.name} has {len(recipients)} task owners — "
            "consider async queue for large sprint notifications (P4d).",
            "portal_notifications sprint fanout warning",
        )

    for user in recipients:
        queue_notification(
            user=user,
            event_type="sprint_status",
            reference_doctype="VT Sprint",
            reference_name=doc.name,
            message=message,
        )


def on_comment_insert(doc, method):
    """
    Handle Comment after_insert.
    Fires comment notification to the VT Task's assigned_to user.
    """
    if not _get_flag():
        return

    if doc.reference_doctype != "VT Task":
        return

    assigned_to = frappe.db.get_value(
        "VT Task", doc.reference_name, "assigned_to"
    )
    if not assigned_to:
        return

    # Self-comment guard
    if doc.comment_by == assigned_to:
        return

    commenter_name = (
        frappe.db.get_value("User", doc.comment_by, "full_name") or doc.comment_by
    )
    task_title = (
        frappe.db.get_value("VT Task", doc.reference_name, "title") or doc.reference_name
    )

    queue_notification(
        user=assigned_to,
        event_type="comment",
        reference_doctype="VT Task",
        reference_name=doc.reference_name,
        message=f"{commenter_name} commented on your task: {task_title}",
    )


# ---------------------------------------------------------------------------
# Whitelisted RPC endpoints
# ---------------------------------------------------------------------------


@frappe.whitelist()
def list_notifications(
    limit: int = 20,
    offset: int = 0,
    only_unread: int = 0,
    event_type_filter: str = "",
) -> dict:
    """
    Return paginated Vernon Notification rows for the session user.

    Query params:
      limit          int, clamped 1–100
      offset         int, clamped 0–10000
      only_unread    int 0/1
      event_type_filter  str, one of task_assigned|task_review|sprint_status|comment
    """
    _require_flag()
    user = frappe.session.user

    limit = clamp_int(int(limit), 1, 100, "limit")
    offset = clamp_int(int(offset), 0, 10000, "offset")

    filters = {"user": user}
    if int(only_unread):
        filters["is_read"] = 0
    if event_type_filter and event_type_filter in _VALID_EVENT_TYPES:
        filters["event_type"] = event_type_filter

    rows = frappe.get_all(
        "Vernon Notification",
        filters=filters,
        fields=["name", "event_type", "reference_doctype", "reference_name",
                "message", "is_read", "creation", "user"],
        order_by="creation desc",
        limit=limit,
        start=offset,
    )

    total_unread = _count_unread_for_user(user)

    return {"results": rows, "total_unread": total_unread}


@frappe.whitelist()
def count_unread() -> dict:
    """
    Return {"count": N} for session user. Returns {"count": 0} for Guest without throwing.
    """
    _require_flag()
    user = frappe.session.user
    if user == "Guest":
        return {"count": 0}
    return {"count": _count_unread_for_user(user)}


@frappe.whitelist(methods=["POST"])
def mark_read(name: str) -> dict:
    """
    Mark a single Vernon Notification as read.
    Raises PermissionError if the row belongs to a different user.
    """
    _require_flag()
    user = frappe.session.user

    doc = frappe.get_doc("Vernon Notification", name)
    if doc.user != user:
        frappe.throw(_("Forbidden"), frappe.PermissionError)

    doc.is_read = 1
    doc.save(ignore_permissions=True)
    _invalidate_unread_cache(user)
    return {"ok": True}


@frappe.whitelist(methods=["POST"])
def mark_all_read() -> dict:
    """
    Mark all unread Vernon Notification rows for session user as read.
    """
    _require_flag()
    user = frappe.session.user

    frappe.db.set_value(
        "Vernon Notification",
        {"user": user, "is_read": 0},
        "is_read",
        1,
        update_modified=False,
    )
    _invalidate_unread_cache(user)
    return {"ok": True}


@frappe.whitelist()
def get_feature_flag() -> dict:
    """Return {"enabled": bool} — cached 60s. Used by NotificationsFeatureGate."""
    # Note: this endpoint does NOT call _require_flag() — it's the flag check itself.
    return {"enabled": _get_flag()}

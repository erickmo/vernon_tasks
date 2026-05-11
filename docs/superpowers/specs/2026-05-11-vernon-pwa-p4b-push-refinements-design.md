# Vernon Tasks PWA — P4b Push Refinements

**Date:** 2026-05-11
**Predecessors:** PRs #1–#9 (P4a Web Push shipped)

## Goals

- Per-user push event-type preferences (Assignment / Mention / Due / Review)
- "Selesai" + "Buka" action buttons on relevant push notifications
- Settings UI at `/m/me/notifications/settings`
- Push delivery respects prefs server-side
- 3 new telemetry events

Non-goals:

- W3C Badging API (deferred; narrow browser support)
- Quiet hours / DND
- Per-project pref overrides

## Architecture

### New DocType: Vernon Push Preference

Single row per user, autoname by user.

```json
{
  "doctype": "DocType",
  "name": "Vernon Push Preference",
  "module": "VT Settings",
  "autoname": "field:user",
  "fields": [
    {"fieldname": "user", "fieldtype": "Link", "options": "User", "reqd": 1, "unique": 1},
    {"fieldname": "event_assignment", "fieldtype": "Check", "default": "1", "label": "Penugasan"},
    {"fieldname": "event_mention", "fieldtype": "Check", "default": "1", "label": "Disebut"},
    {"fieldname": "event_due", "fieldtype": "Check", "default": "1", "label": "Tenggat"},
    {"fieldname": "event_review", "fieldtype": "Check", "default": "1", "label": "Review"}
  ]
}
```

### Push event type mapping

`Notification Log.type` (and `subject` heuristic) → preference field:

| Notification Log type | Pref field | Action buttons? |
|---|---|---|
| `Assignment` | `event_assignment` | Complete + View |
| `Mention` | `event_mention` | View only |
| `Alert` (with "due" keyword) | `event_due` | Complete + View |
| anything else mapped to a `VT Task` | `event_review` | View only |
| no `document_type=VT Task` | always allowed (system) | View only |

Encoded in `push_sender._matches_pref(doc, prefs)`.

### Backend additions

```
vernon_tasks/
  vt_settings/doctype/vernon_push_preference/
    __init__.py
    vernon_push_preference.json
    vernon_push_preference.py
  task/api/
    push_prefs.py             # get_prefs, update_prefs
    test_push_prefs.py
    push_action.py            # complete_from_notification(task_name) — alias for my_work_mutations.complete
    test_push_action.py
    telemetry.py              # +3 events
  task/services/
    push_sender.py            # MODIFY: check prefs + include actions in payload
    test_push_sender.py       # MODIFY: prefs-respected test
```

### push_prefs.py

```python
import frappe


@frappe.whitelist()
def get_prefs() -> dict:
    user = frappe.session.user
    if user == "Guest":
        frappe.throw("Login required", frappe.PermissionError)
    name = frappe.db.exists("Vernon Push Preference", {"user": user})
    if not name:
        return {
            "event_assignment": 1,
            "event_mention": 1,
            "event_due": 1,
            "event_review": 1,
        }
    doc = frappe.get_doc("Vernon Push Preference", name)
    return {
        "event_assignment": int(doc.event_assignment),
        "event_mention": int(doc.event_mention),
        "event_due": int(doc.event_due),
        "event_review": int(doc.event_review),
    }


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
    name = frappe.db.exists("Vernon Push Preference", {"user": user})
    values = {
        "event_assignment": int(event_assignment),
        "event_mention": int(event_mention),
        "event_due": int(event_due),
        "event_review": int(event_review),
    }
    if name:
        frappe.db.set_value("Vernon Push Preference", name, values)
    else:
        frappe.get_doc({
            "doctype": "Vernon Push Preference",
            "user": user,
            **values,
        }).insert(ignore_permissions=True)
    return {"ok": True}
```

### push_action.py

Lightweight wrapper around existing complete mutation, plus telemetry hook.

```python
import frappe
from vernon_tasks.task.api.my_work_mutations import complete


@frappe.whitelist()
def complete_from_notification(task_id: str) -> dict:
    result = complete(task_id)
    frappe.publish_realtime(
        event="vernon_push_action",
        message={"task_id": task_id, "kind": "complete"},
        user=frappe.session.user,
    )
    return result
```

### push_sender.py changes

```python
_TYPE_TO_PREF = {
    "Assignment": "event_assignment",
    "Mention": "event_mention",
    "Alert": "event_due",
    # Notification Log without type but with VT Task → event_review
}


def _user_pref(user: str) -> dict:
    name = frappe.db.exists("Vernon Push Preference", {"user": user})
    if not name:
        return {
            "event_assignment": 1, "event_mention": 1, "event_due": 1, "event_review": 1,
        }
    return frappe.db.get_value(
        "Vernon Push Preference",
        name,
        ["event_assignment", "event_mention", "event_due", "event_review"],
        as_dict=True,
    )


def _pref_field_for(doc) -> str:
    t = (doc.get("type") or "").strip()
    if t in _TYPE_TO_PREF:
        return _TYPE_TO_PREF[t]
    if doc.get("document_type") == "VT Task":
        return "event_review"
    return ""  # always allow


def _actions_for(doc) -> list:
    field = _pref_field_for(doc)
    if doc.get("document_type") == "VT Task" and field in (
        "event_assignment",
        "event_due",
    ):
        return [
            {"action": "complete", "title": "Selesai"},
            {"action": "view", "title": "Buka"},
        ]
    return []


def send_push_for_notification(doc, method=None):
    if not getattr(doc, "for_user", None) or doc.for_user == "Administrator":
        return
    prefs = _user_pref(doc.for_user)
    field = _pref_field_for(doc)
    if field and not prefs.get(field):
        return  # user opted out
    payload = {
        "title": "Vernon Tasks",
        "body": (doc.subject or "Notifikasi baru")[:120],
        "url": _target_url(doc),
        "tag": doc.name,
        "actions": _actions_for(doc),
        "task_id": doc.get("document_name")
            if doc.get("document_type") == "VT Task"
            else None,
    }
    send_to_user(doc.for_user, payload)
```

### Frontend additions

```
pwa/src/
  api/pushPrefs.ts
  api/pushPrefs.test.ts
  pages/PushPrefs.tsx              # /m/me/notifications/settings
  components/Notifications.tsx     # MODIFY: add settings link in header
  router.tsx                       # MODIFY: add /m/me/notifications/settings route
  i18n.ts                          # MODIFY: pref labels
  telemetry.ts                     # MODIFY: 3 new events
public/push-handler.js             # MODIFY: include actions + handle notificationclick.action
```

### push-handler.js changes

```javascript
self.addEventListener("push", function (event) {
  // parse + showNotification with options.actions = data.actions ?? []
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var action = event.action;
  var data = event.notification.data || {};
  if (action === "complete" && data.task_id) {
    event.waitUntil(
      fetch("/api/method/vernon_tasks.task.api.push_action.complete_from_notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ task_id: data.task_id }),
      }).catch(function () {})
    );
    return;
  }
  // default: open URL (same as P4a)
  var url = data.url || "/m/";
  event.waitUntil(self.clients.matchAll(...));
});
```

### PushPrefs page

```typescript
const FIELDS = [
  { key: "event_assignment", label: t("pref.assignment") },
  { key: "event_mention", label: t("pref.mention") },
  { key: "event_due", label: t("pref.due") },
  { key: "event_review", label: t("pref.review") },
];

// useQuery on getPrefs, mutation on update with optimistic UI
// each row: label + toggle switch
```

### Telemetry events

```
"push_pref_view",
"push_pref_changed",   // props: field, value
"push_action_complete" // logged by SW when complete action fires
```

### Permissions

- `push_prefs.*` whitelisted, owner-only via session.user
- `push_action.complete_from_notification` uses existing `my_work_mutations.complete` `_check_access`
- `Vernon Push Preference` DocType: System Manager + owner (via standard Frappe permission inference)

### Testing

#### Vitest

- `pushPrefs.test.ts` — get/update URL + body
- `PushPrefs.test.tsx` — initial render with defaults, toggle calls update

#### pytest

- `test_push_prefs.py` — get returns defaults for new user, update creates row, update modifies row
- `test_push_action.py` — complete_from_notification idempotent, owner-only
- `test_push_sender.py` extended — pref off → no send; pref on → sent; type→field mapping per row

## Bundle impact

- New page + API: ~5 KB
- push-handler.js: ~3 KB (was 1.5 KB)

## Rollout

1. `bench migrate` (registers Vernon Push Preference DocType)
2. `./pwa/build-pwa.sh && bench restart`
3. User opens `/m/me/notifications/settings`, toggles event types
4. Trigger Assignment notif → push has 2 buttons
5. Tap "Selesai" → task completes in background
6. Toggle Mention OFF → mention notifs no longer push

## Open questions

None.

# CSO Security Audit — PWA APIs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden Vernon Tasks PWA APIs with rate limiting, input bounds validation, and security response headers before company-wide rollout.

**Architecture:** A new `security.py` guard module provides four helpers (`require_login`, `rate_limit`, `clamp_int`, `max_str`); each API file imports only what it needs. Security headers for `/m/*` responses are injected via an `after_request` hook registered in `hooks.py`.

**Tech Stack:** Python 3.11, Frappe v15, Redis via `frappe.cache()`, FrappeTestCase

---

## File Map

| File | Action |
|---|---|
| `vernon_tasks/task/api/security.py` | **Create** — 4 guard helpers |
| `vernon_tasks/task/api/test_security.py` | **Create** — 12 unit tests |
| `vernon_tasks/task/api/my_work.py` | **Modify** — `require_login` in `detail()`, `max_str` on `query` in `search()` |
| `vernon_tasks/task/api/my_work_mutations.py` | **Modify** — `rate_limit` on all 3 mutations, `max_str` on `note` |
| `vernon_tasks/task/api/notifications.py` | **Modify** — `clamp_int` on `limit` / `offset` in `list()` |
| `vernon_tasks/task/api/push.py` | **Modify** — `max_str` on `endpoint`, `rate_limit` in `subscribe()` |
| `vernon_tasks/task/api/push_prefs.py` | **Modify** — `rate_limit` in `update_prefs()` |
| `vernon_tasks/task/api/analytics.py` | **Modify** — `clamp_int` on `n` in `get_velocity_trend()` |
| `vernon_tasks/task/api/exec_analytics.py` | **Modify** — `clamp_int` on `periods` in `get_kpi_trend()` |
| `vernon_tasks/task/api/telemetry.py` | **Modify** — props size cap in `log_event()` |
| `vernon_tasks/hooks.py` | **Modify** — add `after_request` + `add_pwa_security_headers` |

---

## Task 1: Guard Module (`security.py`) — TDD

**Files:**
- Create: `vernon_tasks/task/api/security.py`
- Create: `vernon_tasks/task/api/test_security.py`

> Frappe tests require a running site. Replace `<site>` in all `bench` commands with your site name (e.g. `site1.localhost`).

- [ ] **Step 1: Write the failing tests**

Create `vernon_tasks/task/api/test_security.py`:

```python
import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_tasks.task.api.security import require_login, rate_limit, clamp_int, max_str


class TestSecurity(FrappeTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.user = "security_test@test.local"
        if not frappe.db.exists("User", cls.user):
            frappe.get_doc(
                {"doctype": "User", "email": cls.user, "first_name": "Security"}
            ).insert(ignore_permissions=True)

    # --- require_login ---

    def test_require_login_raises_for_guest(self):
        frappe.set_user("Guest")
        self.assertRaises(frappe.PermissionError, require_login)

    def test_require_login_passes_for_authenticated_user(self):
        frappe.set_user(self.user)
        require_login()  # must not raise

    # --- rate_limit ---

    def test_rate_limit_allows_calls_under_limit(self):
        frappe.set_user(self.user)
        ep = f"test_under_{frappe.utils.now_datetime().microsecond}"
        for _ in range(3):
            rate_limit(ep, 5)  # 3 < 5, no raise

    def test_rate_limit_raises_when_limit_exceeded(self):
        frappe.set_user(self.user)
        ep = f"test_over_{frappe.utils.now_datetime().microsecond}"
        for _ in range(5):
            rate_limit(ep, 5)  # 5th call == max, still OK
        # 6th call exceeds
        self.assertRaises(frappe.ValidationError, rate_limit, ep, 5)

    def test_rate_limit_skips_for_guest(self):
        frappe.set_user("Guest")
        ep = f"test_guest_{frappe.utils.now_datetime().microsecond}"
        # max=0 but Guest session → must NOT raise
        rate_limit(ep, 0)

    # --- clamp_int ---

    def test_clamp_int_returns_value_in_range(self):
        self.assertEqual(clamp_int(50, 1, 100, "x"), 50)
        self.assertEqual(clamp_int("10", 1, 100, "x"), 10)
        self.assertEqual(clamp_int(1, 1, 100, "x"), 1)    # lo boundary
        self.assertEqual(clamp_int(100, 1, 100, "x"), 100)  # hi boundary

    def test_clamp_int_raises_below_lo(self):
        self.assertRaises(frappe.ValidationError, clamp_int, 0, 1, 100, "x")

    def test_clamp_int_raises_above_hi(self):
        self.assertRaises(frappe.ValidationError, clamp_int, 101, 1, 100, "x")

    def test_clamp_int_raises_for_non_integer_string(self):
        self.assertRaises(frappe.ValidationError, clamp_int, "abc", 1, 100, "x")

    # --- max_str ---

    def test_max_str_truncates_at_limit(self):
        result = max_str("a" * 300, 200)
        self.assertEqual(len(result), 200)

    def test_max_str_preserves_string_under_limit(self):
        self.assertEqual(max_str("hello", 200), "hello")

    def test_max_str_returns_empty_for_none(self):
        self.assertEqual(max_str(None, 200), "")
```

- [ ] **Step 2: Run tests — verify they fail (ImportError)**

```bash
bench --site <site> run-tests --app vernon_tasks --module vernon_tasks.task.api.test_security
```

Expected: `ImportError: cannot import name 'require_login' from 'vernon_tasks.task.api.security'` or `ModuleNotFoundError`.

- [ ] **Step 3: Implement `security.py`**

Create `vernon_tasks/task/api/security.py`:

```python
import frappe

_RATE_LIMIT_TTL = 90  # seconds — bucket expires 90s after first hit


def require_login() -> None:
    if frappe.session.user == "Guest":
        frappe.throw("Login required", frappe.PermissionError)


def rate_limit(endpoint: str, max_calls: int) -> None:
    user = frappe.session.user
    if user == "Guest":
        return
    window = frappe.utils.now()[:16]  # "YYYY-MM-DD HH:MM" — 1-minute bucket
    key = f"vt:rl:{user}:{endpoint}:{window}"
    count = frappe.cache().incrby(key, 1)
    frappe.cache().expire(key, _RATE_LIMIT_TTL)
    if count > max_calls:
        frappe.throw("Rate limit exceeded", frappe.ValidationError)


def clamp_int(val, lo: int, hi: int, name: str = "param") -> int:
    try:
        v = int(val)
    except (TypeError, ValueError):
        frappe.throw(f"{name} must be an integer", frappe.ValidationError)
    if v < lo or v > hi:
        frappe.throw(f"{name} must be between {lo} and {hi}", frappe.ValidationError)
    return v


def max_str(val, limit: int) -> str:
    if not val:
        return ""
    return str(val)[:limit]
```

- [ ] **Step 4: Run tests — verify all 12 pass**

```bash
bench --site <site> run-tests --app vernon_tasks --module vernon_tasks.task.api.test_security
```

Expected: `12 tests passed, 0 failures`

- [ ] **Step 5: Commit**

```bash
git add vernon_tasks/task/api/security.py vernon_tasks/task/api/test_security.py
git commit -m "feat(security): add guard module with require_login, rate_limit, clamp_int, max_str"
```

---

## Task 2: Harden `my_work.py`

**Files:**
- Modify: `vernon_tasks/task/api/my_work.py`

**Changes:**
- `detail()`: add `require_login()` before any DB call (Guest blocks before permission check)
- `search()`: truncate `query` to 200 chars

- [ ] **Step 1: Replace `detail()` and `search()` in `my_work.py`**

Replace the entire file content with:

```python
import frappe
from frappe.utils import today, add_days, getdate
from vernon_tasks.task.api.security import require_login, max_str

TASK_DOCTYPE = "VT Task"


def _serialize(row: dict) -> dict:
    return {
        "id": row["name"],
        "title": row.get("title"),
        "status": row.get("kanban_status"),
        "priority": row.get("priority"),
        "due_date": row.get("deadline"),
        "project": row.get("project"),
        "sprint": row.get("sprint"),
        "points": row.get("base_points") or 0,
    }


@frappe.whitelist()
def list() -> dict:
    user = frappe.session.user
    if user == "Guest":
        frappe.throw("Login required", frappe.PermissionError)

    rows = frappe.get_all(
        TASK_DOCTYPE,
        filters=[
            ["assigned_to", "=", user],
            ["kanban_status", "!=", "Cancelled"],
        ],
        fields=["name", "title", "kanban_status", "priority", "deadline", "project", "sprint", "base_points"],
        order_by="deadline asc",
        limit_page_length=500,
    )

    today_d = getdate(today())
    upcoming_cap = add_days(today_d, 7)
    overdue, today_list, upcoming = [], [], []
    for r in rows:
        d = getdate(r["deadline"]) if r["deadline"] else None
        item = _serialize(r)
        if d is None or d > getdate(upcoming_cap):
            continue
        if d < today_d:
            overdue.append(item)
        elif d == today_d:
            today_list.append(item)
        else:
            upcoming.append(item)
    return {"overdue": overdue, "today": today_list, "upcoming": upcoming}


@frappe.whitelist()
def search(
    query: str = "",
    priority: str = "",
    project: str = "",
    due_range: str = "all",
) -> dict:
    user = frappe.session.user
    if user == "Guest":
        frappe.throw("Login required", frappe.PermissionError)

    query = max_str(query, 200)

    filters: list = [
        ["assigned_to", "=", user],
        ["kanban_status", "!=", "Cancelled"],
    ]
    if query:
        filters.append(["title", "like", f"%{query}%"])
    if priority:
        choices = [p.strip() for p in priority.split(",") if p.strip()]
        if choices:
            filters.append(["priority", "in", choices])
    if project:
        filters.append(["project", "=", project])
    if due_range:
        today_d = getdate(today())
        if due_range == "today":
            filters.append(["deadline", "=", today_d])
        elif due_range == "week":
            filters.append(["deadline", "between", [today_d, add_days(today_d, 7)]])
        elif due_range == "overdue":
            filters.append(["deadline", "<", today_d])

    rows = frappe.get_all(
        TASK_DOCTYPE,
        filters=filters,
        fields=["name", "title", "kanban_status", "priority", "deadline", "project", "sprint", "base_points"],
        order_by="deadline asc",
        limit_page_length=200,
    )
    return {"results": [_serialize(r) for r in rows], "total": len(rows)}


@frappe.whitelist()
def detail(task_id: str) -> dict:
    require_login()

    if not frappe.db.exists(TASK_DOCTYPE, task_id):
        frappe.throw("Not found", frappe.PermissionError)

    user = frappe.session.user
    doc = frappe.get_doc(TASK_DOCTYPE, task_id)
    if doc.get("assigned_to") != user and not frappe.has_permission(TASK_DOCTYPE, "read", doc=doc):
        frappe.throw("Forbidden", frappe.PermissionError)

    activity = frappe.get_all(
        "Comment",
        filters={"reference_doctype": TASK_DOCTYPE, "reference_name": task_id},
        fields=["content", "comment_type", "creation", "owner"],
        order_by="creation desc",
        limit_page_length=10,
    )
    return {
        **_serialize(doc.as_dict()),
        "description": None,
        "activity": activity,
    }
```

- [ ] **Step 2: Run existing my_work tests**

```bash
bench --site <site> run-tests --app vernon_tasks --module vernon_tasks.task.api.test_my_work
```

Expected: all previously passing tests still pass.

- [ ] **Step 3: Commit**

```bash
git add vernon_tasks/task/api/my_work.py
git commit -m "fix(security): require_login in detail(), max_str on search query"
```

---

## Task 3: Harden `my_work_mutations.py`

**Files:**
- Modify: `vernon_tasks/task/api/my_work_mutations.py`

**Changes:**
- `complete()`: `rate_limit("complete", 30)` — 30 completions/min is well above real usage
- `log_progress()`: `rate_limit("log_progress", 20)`, `max_str(note, 1000)`
- `snooze()`: `rate_limit("snooze", 10)`

- [ ] **Step 1: Replace entire file**

```python
import frappe
from frappe.utils import add_days, getdate, today
from vernon_tasks.task.api.security import rate_limit, max_str

TASK_DOCTYPE = "VT Task"
ALLOWED_SNOOZE_DAYS = (1, 3, 7)
MAX_LOG_HOURS = 24


def _check_access(task_id: str):
    if not frappe.db.exists(TASK_DOCTYPE, task_id):
        frappe.throw("Not found", frappe.PermissionError)
    doc = frappe.get_doc(TASK_DOCTYPE, task_id)
    user = frappe.session.user
    if doc.get("assigned_to") != user and not frappe.has_permission(
        TASK_DOCTYPE, "write", doc=doc
    ):
        frappe.throw("Forbidden", frappe.PermissionError)
    return doc


@frappe.whitelist()
def complete(task_id: str) -> dict:
    rate_limit("complete", 30)
    doc = _check_access(task_id)
    if doc.kanban_status == "Done":
        return {"ok": True, "idempotent": True}
    doc.kanban_status = "Done"
    doc.completion_date = today()
    doc.save()
    return {"ok": True, "task_id": task_id}


@frappe.whitelist()
def log_progress(task_id: str, hours, note: str = "") -> dict:
    rate_limit("log_progress", 20)
    hours_f = float(hours)
    if hours_f <= 0 or hours_f > MAX_LOG_HOURS:
        frappe.throw(f"Hours must be in (0, {MAX_LOG_HOURS}]")
    note = max_str(note, 1000)
    doc = _check_access(task_id)
    doc.actual_hours = (doc.actual_hours or 0) + hours_f
    doc.save()
    content = f"[Log {hours_f}h] {note}" if note else f"[Log {hours_f}h]"
    frappe.get_doc({
        "doctype": "Comment",
        "comment_type": "Comment" if note else "Info",
        "reference_doctype": TASK_DOCTYPE,
        "reference_name": task_id,
        "content": content,
    }).insert(ignore_permissions=True)
    return {"ok": True, "actual_hours": doc.actual_hours}


@frappe.whitelist()
def snooze(task_id: str, days) -> dict:
    rate_limit("snooze", 10)
    days_i = int(days)
    if days_i not in ALLOWED_SNOOZE_DAYS:
        frappe.throw(f"Days must be one of {ALLOWED_SNOOZE_DAYS}")
    doc = _check_access(task_id)
    base = getdate(doc.deadline or today())
    new_deadline = add_days(base, days_i)
    doc.deadline = new_deadline
    doc.save()
    frappe.get_doc({
        "doctype": "Comment",
        "comment_type": "Info",
        "reference_doctype": TASK_DOCTYPE,
        "reference_name": task_id,
        "content": f"Snoozed +{days_i}d → {new_deadline}",
    }).insert(ignore_permissions=True)
    return {"ok": True, "deadline": str(new_deadline)}
```

- [ ] **Step 2: Run existing mutation tests**

```bash
bench --site <site> run-tests --app vernon_tasks --module vernon_tasks.task.api.test_my_work_mutations
```

Expected: all previously passing tests still pass.

- [ ] **Step 3: Commit**

```bash
git add vernon_tasks/task/api/my_work_mutations.py
git commit -m "fix(security): rate_limit on complete/log_progress/snooze, max_str on note"
```

---

## Task 4: Harden `notifications.py`, `push.py`, `push_prefs.py`

**Files:**
- Modify: `vernon_tasks/task/api/notifications.py`
- Modify: `vernon_tasks/task/api/push.py`
- Modify: `vernon_tasks/task/api/push_prefs.py`

**Changes:**
- `notifications.list()`: `clamp_int(limit, 1, 100)`, `clamp_int(offset, 0, 10000)`
- `push.subscribe()`: `max_str(endpoint, 2048)`, `rate_limit("push_subscribe", 5)`
- `push_prefs.update_prefs()`: `rate_limit("push_prefs", 20)`

- [ ] **Step 1: Replace `notifications.py`**

```python
import frappe
from vernon_tasks.task.api.security import clamp_int

CACHE_KEY_UNREAD = "vt:notif:unread:{user}"
CACHE_TTL = 30


@frappe.whitelist()
def list(limit: int = 50, offset: int = 0, only_unread: int = 0) -> dict:
    user = frappe.session.user
    if user == "Guest":
        frappe.throw("Login required", frappe.PermissionError)

    limit = clamp_int(limit, 1, 100, "limit")
    offset = clamp_int(offset, 0, 10_000, "offset")

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
        limit_start=offset,
        limit_page_length=limit,
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
```

- [ ] **Step 2: Replace `push.py`**

```python
import frappe
from frappe.utils import now_datetime
from vernon_tasks.task.api.security import max_str, rate_limit


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
```

- [ ] **Step 3: Replace `push_prefs.py`**

```python
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
```

- [ ] **Step 4: Run existing notification and push tests**

```bash
bench --site <site> run-tests --app vernon_tasks --module vernon_tasks.task.api.test_notifications
bench --site <site> run-tests --app vernon_tasks --module vernon_tasks.task.api.test_push
bench --site <site> run-tests --app vernon_tasks --module vernon_tasks.task.api.test_push_prefs
```

Expected: all previously passing tests still pass.

- [ ] **Step 5: Add integration assertions to `test_notifications.py`**

Open `vernon_tasks/task/api/test_notifications.py` and add this test class at the end of the file.

Add the import at the top of that file (use module import to avoid shadowing the builtin `list`):
```python
from vernon_tasks.task.api import notifications as notif_api
```

Then append the class:

```python
class TestNotificationBounds(FrappeTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.user = "notif_bounds@test.local"
        if not frappe.db.exists("User", cls.user):
            frappe.get_doc(
                {"doctype": "User", "email": cls.user, "first_name": "Bounds"}
            ).insert(ignore_permissions=True)

    def test_list_limit_zero_raises(self):
        frappe.set_user(self.user)
        self.assertRaises(frappe.ValidationError, notif_api.list, limit=0)

    def test_list_limit_over_max_raises(self):
        frappe.set_user(self.user)
        self.assertRaises(frappe.ValidationError, notif_api.list, limit=101)

    def test_list_limit_at_max_succeeds(self):
        frappe.set_user(self.user)
        result = notif_api.list(limit=100)
        self.assertIn("results", result)
```

- [ ] **Step 6: Run notification bounds tests**

```bash
bench --site <site> run-tests --app vernon_tasks --module vernon_tasks.task.api.test_notifications
```

Expected: all tests pass including the 3 new bounds tests.

- [ ] **Step 7: Commit**

```bash
git add vernon_tasks/task/api/notifications.py \
        vernon_tasks/task/api/push.py \
        vernon_tasks/task/api/push_prefs.py \
        vernon_tasks/task/api/test_notifications.py
git commit -m "fix(security): clamp limit/offset in notifications, rate_limit+max_str in push"
```

---

## Task 5: Harden `analytics.py`, `exec_analytics.py`, `telemetry.py`

**Files:**
- Modify: `vernon_tasks/task/api/analytics.py`
- Modify: `vernon_tasks/task/api/exec_analytics.py`
- Modify: `vernon_tasks/task/api/telemetry.py`

**Changes:**
- `get_velocity_trend(project, n)`: `n = clamp_int(n, 1, 24, "n")`
- `get_kpi_trend(kpi_definition, periods)`: `periods = clamp_int(periods, 1, 24, "periods")`
- `log_event(event, props)`: truncate `props` if serialized JSON > 2048 chars

- [ ] **Step 1: Modify `analytics.py` — add clamp_int to get_velocity_trend**

Replace only `get_velocity_trend`:

```python
@frappe.whitelist()
def get_velocity_trend(project, n=6):
    _guard()
    n = clamp_int(n, 1, 24, "n")
    key = f"vt_velocity:{project}:{n}"
    return _cache_get_or_set(key, lambda: _get_velocity_trend(project, n))
```

Add import at top of file (after existing imports):

```python
from vernon_tasks.task.api.security import clamp_int
```

Full updated `analytics.py`:

```python
import frappe
from vernon_tasks.task.services.burndown_service import get_burndown as _get_burndown
from vernon_tasks.task.services.velocity_service import get_velocity_trend as _get_velocity_trend
from vernon_tasks.task.services.forecast_service import get_forecast as _get_forecast
from vernon_tasks.task.services.risk_evaluator import evaluate_risks as _evaluate_risks
from vernon_tasks.task.api.security import clamp_int

_ALLOWED_ROLES = ("VT Leader", "VT Manager")
_CACHE_TTL = 3600


def _guard():
    if not set(frappe.get_roles()) & set(_ALLOWED_ROLES):
        frappe.throw("Not authorized", frappe.PermissionError)


def _cache_get_or_set(key, fn):
    cached = frappe.cache().get_value(key)
    if cached is not None:
        return cached
    val = fn()
    frappe.cache().set_value(key, val, expires_in_sec=_CACHE_TTL)
    return val


@frappe.whitelist()
def get_burndown(sprint):
    _guard()
    return _get_burndown(sprint)


@frappe.whitelist()
def get_velocity_trend(project, n=6):
    _guard()
    n = clamp_int(n, 1, 24, "n")
    key = f"vt_velocity:{project}:{n}"
    return _cache_get_or_set(key, lambda: _get_velocity_trend(project, n))


@frappe.whitelist()
def get_forecast(project):
    _guard()
    key = f"vt_forecast:{project}"
    return _cache_get_or_set(key, lambda: _get_forecast(project))


@frappe.whitelist()
def get_risks(project):
    _guard()
    return _evaluate_risks(project)


def invalidate_project_cache(doc, method=None):
    """Hook target — clears velocity + forecast cache for a project."""
    project = getattr(doc, "project", None) or getattr(doc, "name", None)
    if not project:
        return
    for n in (3, 6, 12):
        frappe.cache().delete_value(f"vt_velocity:{project}:{n}")
    frappe.cache().delete_value(f"vt_forecast:{project}")
```

- [ ] **Step 2: Modify `exec_analytics.py` — add clamp_int to get_kpi_trend**

Full updated `exec_analytics.py`:

```python
import frappe
from vernon_tasks.task.services.okr_rollup_service import get_okr_rollup as _okr
from vernon_tasks.task.services.kpi_trend_service import (
    get_kpi_trend as _kpi_trend,
    list_kpis as _list_kpis,
)
from vernon_tasks.task.services.health_score_service import get_health_score as _health
from vernon_tasks.task.api.security import clamp_int

_ALLOWED_ROLES = ("VT Manager", "System Manager")


def _guard():
    if not set(frappe.get_roles()) & set(_ALLOWED_ROLES):
        frappe.throw("Not authorized", frappe.PermissionError)


@frappe.whitelist()
def get_okr_rollup(period=None):
    _guard()
    return _okr(period)


@frappe.whitelist()
def list_kpis():
    _guard()
    return _list_kpis()


@frappe.whitelist()
def get_kpi_trend(kpi_definition, periods=12):
    _guard()
    periods = clamp_int(periods, 1, 24, "periods")
    return _kpi_trend(kpi_definition, periods)


@frappe.whitelist()
def get_health_score():
    _guard()
    return _health()
```

- [ ] **Step 3: Modify `telemetry.py` — add props size cap**

Full updated `telemetry.py`:

```python
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

    cache_key = f"vt:tel:{user}:{frappe.utils.now()[:16]}"
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
```

- [ ] **Step 4: Run existing analytics and telemetry tests**

```bash
bench --site <site> run-tests --app vernon_tasks --module vernon_tasks.task.api.test_analytics
bench --site <site> run-tests --app vernon_tasks --module vernon_tasks.task.api.test_telemetry
```

Expected: all previously passing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add vernon_tasks/task/api/analytics.py \
        vernon_tasks/task/api/exec_analytics.py \
        vernon_tasks/task/api/telemetry.py
git commit -m "fix(security): clamp n/periods in analytics, cap props size in telemetry"
```

---

## Task 6: Security Headers via `after_request` Hook

**Files:**
- Modify: `vernon_tasks/hooks.py`

**Context:** Frappe v15 calls `after_request` hooks with the Werkzeug `Response` object after every request. We add headers only when the path starts with `/m` to scope them to the PWA shell.

- [ ] **Step 1: Add header constant and hook function to `hooks.py`**

Add the following block **at the top of `hooks.py`**, after the existing imports (after `from . import __version__ as app_version`):

```python
import frappe

_PWA_SECURITY_HEADERS = {
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "push=(self), notifications=(self)",
    "Content-Security-Policy": (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline'; "
        "connect-src 'self'; "
        "worker-src 'self';"
    ),
}


def add_pwa_security_headers(response):
    path = getattr(getattr(frappe, "local", None), "request", None)
    path = getattr(path, "path", "") if path else ""
    if path.startswith("/m"):
        for key, val in _PWA_SECURITY_HEADERS.items():
            response.headers.setdefault(key, val)
    return response
```

- [ ] **Step 2: Register `after_request` in `hooks.py`**

Add this line **after** the `website_route_rules` block in `hooks.py`:

```python
after_request = ["vernon_tasks.hooks.add_pwa_security_headers"]
```

Full updated `hooks.py`:

```python
from . import __version__ as app_version
import frappe

_PWA_SECURITY_HEADERS = {
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "push=(self), notifications=(self)",
    "Content-Security-Policy": (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline'; "
        "connect-src 'self'; "
        "worker-src 'self';"
    ),
}


def add_pwa_security_headers(response):
    path = getattr(getattr(frappe, "local", None), "request", None)
    path = getattr(path, "path", "") if path else ""
    if path.startswith("/m"):
        for key, val in _PWA_SECURITY_HEADERS.items():
            response.headers.setdefault(key, val)
    return response


app_name = "vernon_tasks"
app_title = "Vernon Tasks"
app_publisher = "Vernon Corp"
app_description = "Task and project management system with OKR, PDCA, and Agile"
app_email = "dev@vernoncorp.com"
app_license = "mit"
app_version = app_version

app_include_js = ["/assets/vernon_tasks/js/page_nav.js"]

required_apps = []

doc_events = {
    "VT Task": {
        "on_submit": "vernon_tasks.task.services.point_calculator.calculate_points",
        "on_update": [
            "vernon_tasks.task.services.scheduling_engine.on_task_update",
            "vernon_tasks.task.api.analytics.invalidate_project_cache",
        ],
        "validate": "vernon_tasks.task.doctype.vt_task.vt_task.validate_permissions",
    },
    "VT Project": {
        "validate": "vernon_tasks.project.doctype.vt_project.vt_project.validate_team",
    },
    "VT Sprint": {
        "on_update": "vernon_tasks.task.api.analytics.invalidate_project_cache",
    },
    "Notification Log": {
        "after_insert": "vernon_tasks.task.services.push_sender.send_push_for_notification",
    },
}

scheduler_events = {
    "daily": [
        "vernon_tasks.task.services.scheduling_engine.generate_recurring_tasks",
        "vernon_tasks.task.services.point_calculator.check_overdue_tasks",
        "vernon_tasks.workforce.doctype.daily_summary.daily_summary.generate_daily_summaries",
        "vernon_tasks.task.api.telemetry.purge_old_telemetry",
    ],
    "hourly": [
        "vernon_tasks.task.services.scheduling_engine.check_deadline_notifications",
    ],
}

website_route_rules = [
    {"from_route": "/m/<path:rest>", "to_route": "m"},
]

after_request = ["vernon_tasks.hooks.add_pwa_security_headers"]

fixtures = [
    {"dt": "Role", "filters": [["name", "in", ["VT Manager", "VT Leader", "VT Member"]]]},
    {"dt": "Workspace", "filters": [["name", "in", ["My Tasks", "My Projects", "Overview"]]]},
]
```

- [ ] **Step 3: Verify headers appear on a live request**

With your bench site running:

```bash
curl -s -I http://<site>:8000/m/ | grep -iE "x-frame|x-content|referrer|permissions|content-security"
```

Expected output (all 5 headers present):
```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: push=(self), notifications=(self)
Content-Security-Policy: default-src 'self'; ...
```

If headers are missing, Frappe's `after_request` hook may not fire for website pages on this version. Alternative: set headers in `www/m.py` via:
```python
# In get_context(), after building context.spa_html:
for key, val in _PWA_SECURITY_HEADERS.items():
    frappe.local.response[key] = val
```
(Import `_PWA_SECURITY_HEADERS` from hooks or redefine the dict locally in `www/m.py`.)

- [ ] **Step 4: Commit**

```bash
git add vernon_tasks/hooks.py
git commit -m "fix(security): add PWA security headers via after_request hook"
```

---

## Task 7: Run Full Test Suite + Open PR

- [ ] **Step 1: Run all Vernon Tasks tests**

```bash
bench --site <site> run-tests --app vernon_tasks
```

Expected: all tests pass (0 failures). Fix any failures before proceeding.

- [ ] **Step 2: Open PR**

```bash
git push origin HEAD
gh pr create \
  --title "fix(security): CSO hardening — rate limiting, input bounds, security headers" \
  --body "$(cat <<'EOF'
## Summary
- New `security.py` guard module: `require_login`, `rate_limit`, `clamp_int`, `max_str`
- Rate limiting on all mutation endpoints (complete/log_progress/snooze/subscribe/push_prefs)
- Input bounds on `notifications.list` limit/offset, `get_velocity_trend` n, `get_kpi_trend` periods
- Props size cap in `telemetry.log_event`
- Security headers (X-Frame-Options, CSP, etc.) injected on all /m/* responses

## Test plan
- [ ] `bench run-tests --module test_security` — 12 unit tests pass
- [ ] `bench run-tests --module test_notifications` — bounds tests pass
- [ ] All existing tests pass
- [ ] `curl -I /m/` shows 5 security headers
EOF
)"
```

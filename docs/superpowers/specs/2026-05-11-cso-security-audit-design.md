# CSO Security Audit — PWA APIs Design

**Date:** 2026-05-11  
**Scope:** Vernon Tasks PWA backend APIs (task/api/*.py) + SPA shell (www/m.py)  
**Goal:** Harden PWA APIs against abuse before company-wide rollout — rate limiting on mutations, input bounds validation, security response headers.

---

## Context

Ten PRs have shipped the Vernon Tasks PWA (P0.5 → P4b). The APIs are functional and role-gated, but were built for correctness first. Before wide rollout the CSO needs: rate limiting on write endpoints, bounded integer params, max-length string inputs, and security headers on the SPA shell.

Frappe v15 provides `frappe.cache()` (Redis) and `frappe.sessions.get_csrf_token()`. CSRF is already enforced by Frappe's whitelist mechanism for non-GET requests. This audit adds the missing layers above that baseline.

---

## Architecture

### Guard Module

New file: `vernon_tasks/task/api/security.py`

Single responsibility: reusable security helpers for all PWA API modules. No business logic. Four functions:

```python
require_login() -> None
    # Throws frappe.PermissionError if frappe.session.user == "Guest"

rate_limit(endpoint: str, max_calls: int, window_sec: int = 60) -> None
    # Per-user, per-endpoint Redis counter.
    # Key: "vt:rl:{user}:{endpoint}:{window_minute}"
    # Throws frappe.ValidationError("Rate limit exceeded") if count > max_calls

clamp_int(val, lo: int, hi: int, name: str = "param") -> int
    # Casts val to int, raises frappe.ValidationError if outside [lo, hi]

max_str(val: str, limit: int, name: str = "param") -> str
    # Returns val[:limit] — silent truncation (no throw) to avoid UX breakage
    # Caller can throw instead if preferred; annotated in docstring
```

Rate limit uses `frappe.cache().incrby()` + `frappe.cache().expire()` — same pattern as existing `telemetry.py`.

### Security Headers

`www/m.py` `get_context()` appends headers to `frappe.local.response`. Headers applied to every `/m/*` response:

| Header | Value |
|---|---|
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `push=(self), notifications=(self)` |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'self';` |

`unsafe-inline` required: Vite injects inline scripts in built index.html.

---

## Fix Matrix

Each API call lists exactly which guards are added and where.

### `task/api/my_work.py`

| Function | Fix |
|---|---|
| `detail(task_id)` | Add `require_login()` at top (before any DB call) |
| `search(query, priority, project, due_range)` | `query = max_str(query, 200, "query")` |

### `task/api/notifications.py`

| Function | Fix |
|---|---|
| `list(limit, offset, only_unread)` | `limit = clamp_int(limit, 1, 100, "limit")`, `offset = clamp_int(offset, 0, 10_000, "offset")` |

### `task/api/my_work_mutations.py`

| Function | Fix |
|---|---|
| `complete(task_id)` | `rate_limit("complete", 30, 60)` |
| `log_progress(task_id, hours, note)` | `rate_limit("log_progress", 20, 60)`, `note = max_str(note, 1000, "note")` |
| `snooze(task_id, days)` | `rate_limit("snooze", 10, 60)` |

### `task/api/push.py`

| Function | Fix |
|---|---|
| `subscribe(endpoint, p256dh, auth, user_agent)` | `endpoint = max_str(endpoint, 2048, "endpoint")`, `rate_limit("push_subscribe", 5, 60)` |

### `task/api/push_prefs.py`

| Function | Fix |
|---|---|
| `update_prefs(...)` | `rate_limit("push_prefs", 20, 60)` |

### `task/api/analytics.py`

| Function | Fix |
|---|---|
| `get_velocity_trend(project, n)` | `n = clamp_int(n, 1, 24, "n")` |

### `task/api/exec_analytics.py`

| Function | Fix |
|---|---|
| `get_kpi_trend(kpi_definition, periods)` | `periods = clamp_int(periods, 1, 24, "periods")` |

### `task/api/telemetry.py`

| Function | Fix |
|---|---|
| `log_event(event, props)` | `props_str` size-checked before insert: if serialized length > 2048, truncate props to `{}` |

---

## Data Flow

```
HTTP request
  └── Frappe CSRF check (existing, automatic)
      └── @frappe.whitelist() dispatcher
          └── API function
              ├── require_login()       ← new
              ├── rate_limit(...)       ← new (mutation endpoints only)
              ├── clamp_int / max_str   ← new (params with unbounded input)
              └── existing business logic
```

---

## Error Handling

- `require_login()` → `frappe.PermissionError` → HTTP 403
- `rate_limit()` → `frappe.ValidationError` → HTTP 417 (Frappe default for ValidationError)
- `clamp_int()` → `frappe.ValidationError` → HTTP 417
- `max_str()` → silent truncation (no exception)

Frontend already handles non-200 as generic error via `api/client.ts`. No frontend changes needed.

---

## Testing

New test file: `task/api/test_security.py`

Tests for `security.py` module:
1. `require_login` raises `PermissionError` for Guest
2. `require_login` passes for real user
3. `rate_limit` passes for first N calls
4. `rate_limit` raises after N+1 call
5. `clamp_int` returns value inside range
6. `clamp_int` raises below `lo`
7. `clamp_int` raises above `hi`
8. `max_str` truncates silently at limit

Integration: existing test files gain assertions that:
- `notifications.list(limit=0)` raises ValidationError
- `notifications.list(limit=101)` raises ValidationError
- `analytics.get_velocity_trend(project="x", n=0)` raises ValidationError
- `analytics.get_velocity_trend(project="x", n=25)` raises ValidationError

---

## Files Changed

| File | Action |
|---|---|
| `task/api/security.py` | **Create** — guard helpers |
| `task/api/test_security.py` | **Create** — unit + integration tests |
| `task/api/my_work.py` | **Modify** — require_login in detail(), max_str on query |
| `task/api/my_work_mutations.py` | **Modify** — rate_limit on all 3 mutations, max_str on note |
| `task/api/notifications.py` | **Modify** — clamp_int on limit/offset |
| `task/api/push.py` | **Modify** — max_str on endpoint, rate_limit on subscribe |
| `task/api/push_prefs.py` | **Modify** — rate_limit on update_prefs |
| `task/api/analytics.py` | **Modify** — clamp_int on n |
| `task/api/exec_analytics.py` | **Modify** — clamp_int on periods |
| `task/api/telemetry.py` | **Modify** — props size guard |
| `www/m.py` | **Modify** — security headers |

---

## Out of Scope

- DocType role/permission matrix audit
- VAPID key rotation mechanism
- Infrastructure-level WAF / nginx hardening
- Frontend input validation (Defense in depth; backend is authoritative)

# Vernon Tasks PWA — P1b Search + Notifications

**Date:** 2026-05-11
**Scope:** Phase P1b of Vernon Tasks PWA initiative
**Status:** Design approved
**Predecessors:** P0.5 (`#1`), P1a (`#2`) — both merged

## Context

P0.5 shipped foundation + read-only My Work. P1a shipped mutations + install
prompt. P1b closes out the P1 series with **search/filter on My Work** and a
**notifications screen** sourced from Frappe `Notification Log`.

## Goals

- IC can find any of their tasks by typing 1–2 words
- IC can filter list by priority, project, or due range
- IC sees a notifications screen with assignments / mentions / due reminders
- Unread badge on BottomNav "Saya" tab when notifications pending
- Polling refresh every 60s when tab visible (Frappe socket.io deferred)
- Tap notification linked to a task → navigate to task detail

Non-goals (deferred):

- Realtime push via socket.io
- Notification preferences/mute settings
- Search across projects/sprints (this is task-scoped only)
- Saved searches
- Full-text search backend (uses simple LIKE)

## Phase placement

| Phase | Scope | Status |
|-------|-------|--------|
| P0.5 | Foundation + My Work read-only | ✅ Merged (#1) |
| P1a | Mutations + Install prompt | ✅ Merged (#2) |
| **P1b** | **Search + Notifications (this spec)** | In progress |
| P2 | Dashboard + Analytics | Future |
| P3 | Leader views | Future |

## Architecture

### Repository additions

```
pwa/src/
  api/
    search.ts                       # fetchSearchResults
    search.test.ts
    notifications.ts                # list, markRead, markAllRead, countUnread
    notifications.test.ts
  components/
    SearchBar.tsx                   # text input + clear + filter button
    FilterSheet.tsx                 # bottom sheet w/ priority/project/range
    ActiveFilterChips.tsx           # compact pills below search bar
    NotificationRow.tsx             # one notification card
    BottomNav.tsx                   # MODIFY: unread dot on Saya
  hooks/
    useDebounce.ts
    useDebounce.test.ts
    useUnreadCount.ts
  pages/
    Notifications.tsx               # /m/me/notifications
    MyWork/List.tsx                 # MODIFY: integrate search
    Me.tsx                          # MODIFY: add "Notifikasi" link

vernon_tasks/task/api/
  my_work.py                        # extend with search()
  notifications.py                  # NEW
  test_my_work_search.py
  test_notifications.py
  telemetry.py                      # extend ALLOWED_EVENTS
```

### Backend: search

Add to `my_work.py`:

```python
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

    filters: list = [["assigned_to", "=", user], ["kanban_status", "!=", "Cancelled"]]
    if query:
        filters.append(["title", "like", f"%{query}%"])
    if priority:
        # Comma-separated list, e.g. "Tinggi,Sedang"
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
```

Reuses existing `_serialize` and `TASK_DOCTYPE`.

### Backend: notifications

`vernon_tasks/task/api/notifications.py`:

```python
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
        fields=["name", "subject", "email_content", "type", "document_type",
                "document_name", "read", "creation"],
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

### Frontend: search API

```typescript
// pwa/src/api/search.ts
import { api } from "./client";
import { TaskCard } from "./tasks";

export interface SearchFilters {
  query?: string;
  priority?: string[];
  project?: string;
  due_range?: "all" | "today" | "week" | "overdue";
}

export interface SearchResult {
  results: TaskCard[];
  total: number;
}

export function fetchSearchResults(f: SearchFilters): Promise<SearchResult> {
  const params = new URLSearchParams();
  if (f.query) params.set("query", f.query);
  if (f.priority?.length) params.set("priority", f.priority.join(","));
  if (f.project) params.set("project", f.project);
  if (f.due_range && f.due_range !== "all") params.set("due_range", f.due_range);
  const qs = params.toString();
  return api.get<SearchResult>(
    `/api/method/vernon_tasks.task.api.my_work.search${qs ? "?" + qs : ""}`,
  );
}
```

### Frontend: notifications API

```typescript
// pwa/src/api/notifications.ts
import { api } from "./client";

const BASE = "/api/method/vernon_tasks.task.api.notifications";

export interface Notification {
  name: string;
  subject: string;
  email_content?: string;
  type?: string;
  document_type?: string;
  document_name?: string;
  read: 0 | 1;
  creation: string;
}

export const listNotifications = (limit = 50, only_unread = false) =>
  api.get<{ results: Notification[] }>(
    `${BASE}.list?limit=${limit}&only_unread=${only_unread ? 1 : 0}`,
  );

export const markRead = (name: string) =>
  api.post<{ ok: boolean }>(`${BASE}.mark_read`, { name });

export const markAllRead = () =>
  api.post<{ ok: boolean }>(`${BASE}.mark_all_read`);

export const countUnread = () =>
  api.get<{ count: number }>(`${BASE}.count_unread`);
```

### Search UI flow

```
SearchBar visible in My Work header (sticky below greeting)
User types → useDebounce(300ms) → updates `searchState`
  - If query === "" AND no filters → useQuery(['my-work']) (existing P0.5)
  - Else → useQuery(['my-work-search', state], fetchSearchResults)
FilterSheet:
  - Opens via "Filter" button beside SearchBar
  - Chips for priority (multi-select)
  - Dropdown for project (fetched from /api/resource/VT Project)
  - Radio for due range
  - "Terapkan" closes + triggers refetch
  - "Reset" clears + closes
ActiveFilterChips below SearchBar:
  - Renders applied filters as removable pills
  - Tap × on pill → remove that one filter
```

Result rendering: flat list (no Today/Upcoming/Overdue grouping) since
search/filter pre-bucketing makes grouping confusing. Use existing
`TaskCardView` from `MyWork/List.tsx`.

### Notifications page (`/m/me/notifications`)

```
Header: "Notifikasi" + "Tandai semua" button (mark_all_read)
PullToRefresh
List of NotificationRow:
  - Icon by type: "Assignment" → 👤, "Mention" → 💬, default → 🔔
  - Subject (bold if unread)
  - Excerpt: strip_html(email_content).slice(0, 80) + "…"
  - fmtRelative(creation)
  - Unread indicator: 6px blue dot on left edge
  - Tap → markRead(name) optimistic + if document_type === "VT Task" nav to /m/work/<doc_name>
Empty: "Belum ada notifikasi"
Loading: 3 Skeleton rows
```

### Unread badge

```typescript
// pwa/src/hooks/useUnreadCount.ts
export function useUnreadCount() {
  return useQuery({
    queryKey: ["unread-count"],
    queryFn: () => countUnread().then((r) => r.count),
    refetchInterval: () =>
      document.visibilityState === "visible" ? 60_000 : false,
    staleTime: 30_000,
  });
}
```

Modify `BottomNav.tsx` to consume `useUnreadCount` and render an 8px red
circle absolutely positioned on the Saya tab's top-right corner when
`data > 0`.

### Telemetry events

Extend `ALLOWED_EVENTS` in backend `telemetry.py`:

```python
"search_query",
"filter_applied",
"notif_view",
"notif_tap",
"notif_mark_all_read",
```

Extend `TelemetryEvent` type in `pwa/src/telemetry.ts` similarly.

### Permissions

- `my_work.search` — owner-only filter via `assigned_to == frappe.session.user`
- `notifications.list` / `count_unread` — `for_user == frappe.session.user`
- `notifications.mark_read` — explicit ownership check before save
- `notifications.mark_all_read` — implicit (filter by user)

### Caching

- `my-work-search` cached in IDB keyed by serialized filter (last 5 entries)
- `count_unread` cached server-side 30s + react-query staleTime 30s
- Notifications list NOT cached offline (fresh data preferred for unread state)

### Error handling

| Failure | UX |
|---------|-----|
| Search 5xx | Toast "Pencarian gagal" + Retry |
| Search offline + cached hit | Render cached + StaleBadge |
| Search offline + no cache | EmptyState "Sambungkan internet untuk mencari" |
| Notifications 5xx | EmptyState retry |
| Mark-read 5xx | Rollback optimistic, toast "Gagal tandai" |
| Notification target task deleted | Toast "Tugas tidak ditemukan", do not navigate |

### Testing

#### Vitest

- `search.test.ts` — URL building w/ each filter combo
- `notifications.test.ts` — list/markRead/countUnread URL + body
- `useDebounce.test.ts` — debounce timing, latest value wins
- `useUnreadCount.test.ts` — visibility gating, returns count
- `SearchBar.test.tsx` — type input → debounced callback called
- `FilterSheet.test.tsx` — apply emits filter object, reset clears
- `NotificationRow.test.tsx` — renders unread bold + onClick fires

#### pytest

- `test_my_work_search.py` — query LIKE, priority list, project, each due_range, combined
- `test_notifications.py` — list permission, mark_read forbidden for other user, count_unread cache hit
- `test_mark_all_read_clears_unread` — count_unread before/after

#### Playwright (gated)

- Search "test" → result shows
- Open notifications → mark one read → unread count decrements

### Rollout

1. Build + deploy staging
2. Verify Notification Log has rows for pilot users (Frappe auto-creates from
   `_assign` events on VT Task)
3. Pilot week with new pilot members (or P0.5 pilot continuing)
4. Telemetry funnel:
   - `search_query` per active user per day
   - `notif_tap` rate
   - `notif_mark_all_read` rate
5. Company-wide release

## Open questions

None.

## References

- Spec P0.5: `docs/superpowers/specs/2026-05-11-vernon-pwa-foundation-design.md`
- Spec P1a: `docs/superpowers/specs/2026-05-11-vernon-pwa-p1a-mutations-design.md`
- Frappe Notification Log: standard DocType, fields `for_user`, `read`, `subject`, `email_content`, `document_type`, `document_name`, `type`

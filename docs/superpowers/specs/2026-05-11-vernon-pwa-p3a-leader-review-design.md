# Vernon Tasks PWA — P3a Leader Review Queue

**Date:** 2026-05-11
**Predecessors:** PRs #1–#4 (P0.5, P1a, P1b, P2)

## Goals

- Mobile review queue at `/m/leader` for VT Leader / VT Manager
- List tasks pending review (PDCA phase `CHECK`) in projects user leads
- Approve task inline with single tap
- Reject task with reason modal (required)
- BottomNav: conditional 5th "Leader" tab, visible only when user has leader role
- 3 telemetry events

Non-goals (deferred):

- Team workload + blocked tasks dashboard (P3b)
- Burndown / velocity / forecast / risk charts (P3b)
- Exec analytics — OKR / KPI / health (P3b)
- Team leaderboard for leaders (P3b)

## Existing endpoints reused

- `vernon_tasks.task.page.leader_review.leader_review.get_review_queue` → list of pending tasks
- `vernon_tasks.task.page.leader_review.leader_review.approve_task(task_name)`
- `vernon_tasks.task.page.leader_review.leader_review.reject_task(task_name, reason)`

## Backend addition

Extend `boot.py` to include user roles:

```python
@frappe.whitelist(allow_guest=True)
def boot():
    user = frappe.session.user
    if user == "Guest":
        return {"user": None, "csrf_token": None, "roles": []}
    return {
        "user": user,
        "csrf_token": frappe.sessions.get_csrf_token(),
        "roles": frappe.get_roles(user),
    }
```

Backward compatible: prior shape kept, new field added.

## Architecture

```
pwa/src/
  api/
    leader.ts                  # getReviewQueue, approveTask, rejectTask
    leader.test.ts
  auth/
    session.ts                 # MODIFY: Session.roles
  hooks/
    useIsLeader.ts             # probes session once, returns boolean
  components/
    BottomNav.tsx              # MODIFY: 5-col grid when leader
    RejectModal.tsx            # reason textarea + submit
    ReviewQueueRow.tsx         # one card with title/project/priority + Approve/Reject buttons
  pages/
    Leader.tsx                 # /m/leader page
  router.tsx                   # MODIFY: add /m/leader route

vernon_tasks/task/api/
  telemetry.py                 # MODIFY: 3 new events
  boot.py                      # MODIFY: include roles
```

## Backend: telemetry events

Append:

```
"leader_review_view",
"leader_approve",
"leader_reject",
```

## Frontend: leader API client

```typescript
// pwa/src/api/leader.ts
import { api } from "./client";

const PAGE = "vernon_tasks.task.page.leader_review.leader_review";

export interface ReviewItem {
  name: string;
  title: string;
  project: string;
  priority?: string;
  deadline?: string;
  assigned_to: string;
  pdca_phase: string;
  kanban_status: string;
  estimated_hours?: number;
  review_scheduled_date?: string;
}

export const fetchReviewQueue = () =>
  api.get<ReviewItem[]>(`/api/method/${PAGE}.get_review_queue`);

export const approveTask = (task_name: string) =>
  api.post<{ status: string }>(`/api/method/${PAGE}.approve_task`, { task_name });

export const rejectTask = (task_name: string, reason: string) =>
  api.post<{ status: string }>(`/api/method/${PAGE}.reject_task`, {
    task_name,
    reason,
  });
```

## Frontend: useIsLeader

```typescript
import { useEffect, useState } from "react";
import { probeSession } from "../auth/session";

const LEADER_ROLES = ["VT Leader", "VT Manager"];

export function useIsLeader(): boolean | null {
  const [isLeader, setIsLeader] = useState<boolean | null>(null);
  useEffect(() => {
    probeSession()
      .then((s) => setIsLeader(s.roles?.some((r) => LEADER_ROLES.includes(r)) ?? false))
      .catch(() => setIsLeader(false));
  }, []);
  return isLeader;
}
```

## Session shape update

```typescript
export interface Session {
  user: string | null;
  csrf_token: string | null;
  roles?: string[];
}
```

Note: optional field for backward compat with old build.

## UI: page layout

```
┌──────────────────────────────┐
│ Leader Review                │
├──────────────────────────────┤
│ [Card 1]                     │
│   Title · Project · Critical │
│   Due: 11 Mei · Asgn: A      │
│   [Setujui] [Tolak]          │
├──────────────────────────────┤
│ [Card 2]                     │
│   …                          │
└──────────────────────────────┘
Empty: "Tidak ada review tertunda"
```

Sorted by priority (Critical / High / Medium / Low) — already provided by API.

## RejectModal

- Textarea, required, min 5 chars
- Submit → calls rejectTask + closes
- Cancel button + backdrop dismiss

## Approval flow

```
Tap Setujui
  → confirm dialog "Setujui tugas '<title>'?" (browser confirm)
  → on confirm: optimistic remove from list + show toast + call approveTask
  → on error: rollback + toast failed
Tap Tolak
  → open RejectModal pre-filled with task name
  → on submit: optimistic remove + call rejectTask
  → on error: rollback + toast failed
```

## BottomNav conditional 5-col

```typescript
const TABS_BASE = [
  { to: "/m/work", label: t("nav.tasks"), key: "tasks" },
  { to: "/m/dashboard", label: t("nav.dashboard"), key: "dashboard" },
  { to: "/m/analytics", label: t("nav.analytics"), key: "analytics" },
  { to: "/m/me", label: t("nav.me"), key: "me" },
];
const LEADER_TAB = { to: "/m/leader", label: t("nav.leader"), key: "leader" };

// in component:
const tabs = isLeader ? [...TABS_BASE, LEADER_TAB] : TABS_BASE;
const cols = tabs.length;
// gridTemplateColumns: `repeat(${cols}, 1fr)`
```

i18n: `"nav.leader": "Leader"`.

## Error handling

| Failure | UX |
|---|---|
| Empty queue | EmptyState "Tidak ada review tertunda" |
| 403 (not leader) | EmptyState "Akses leader diperlukan" |
| Offline | Banner via existing OfflineBanner; queue read-only (mutations disabled) |
| Approve 5xx | Rollback optimistic + toast "Gagal setujui" |
| Reject 5xx | Rollback + toast "Gagal tolak" |
| Reject empty reason | Modal stays open with inline error |

## Testing

### Vitest

- `leader.test.ts` — getReviewQueue URL, approve/reject body shape
- `useIsLeader.test.ts` — returns true for VT Leader, false for plain user
- `RejectModal.test.tsx` — submits trimmed reason, blocks empty
- `BottomNav` updated test — 4 tabs when guest, 5 when leader

### pytest

No new backend logic; `boot.boot` now returns roles. Add one test:

- `test_boot_includes_roles` — boot returns roles array for logged-in user

### Playwright (gated)

- Login as leader → /m/leader → see queue or empty state

## Bundle impact

- New page + components: ~10 KB
- Main bundle estimate: 306 KB (from 296)

## Rollout

1. Build + deploy staging
2. Pilot leaders run review flow on real CHECK-phase tasks
3. Telemetry funnel: views → approve / reject ratio
4. Company-wide

## Open questions

None.

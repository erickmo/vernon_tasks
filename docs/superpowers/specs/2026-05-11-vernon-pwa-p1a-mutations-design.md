# Vernon Tasks PWA — P1a Mutations + Install Prompt

**Date:** 2026-05-11
**Scope:** Phase P1a of Vernon Tasks PWA initiative
**Status:** Design approved (caveman brainstorm)
**Predecessor:** `2026-05-11-vernon-pwa-foundation-design.md` (P0.5 shipped)

## Context

P0.5 shipped the PWA shell, auth, read-only My Work list+detail, telemetry,
offline cache, and i18n. P1 was outlined as four features: task mutations,
install prompt, search/filter, and notifications screen.

This spec covers **P1a only** — task mutations (Complete / Log progress /
Snooze) plus a custom Add-to-Home-Screen prompt. Search and notifications go
to **P1b** in a separate ship.

## Goals

- IC can complete a task from the mobile PWA in < 3 taps from list view
- Optimistic UI with 5-second undo window via toast
- Online-only mutations (offline → disabled UI + toast)
- Custom install prompt fires after second successful complete
- iOS Safari fallback: instructions modal (no programmatic A2HS available)
- Permission gate on every mutation endpoint
- Telemetry coverage for funnel analysis

Non-goals:

- Offline mutation queue with conflict resolution (deferred indefinitely;
  research first)
- Task creation/edit/delete (admin-only on Desk for now)
- Search / filter UI (P1b)
- Notifications screen (P1b)
- Bulk operations / multi-select (long-press hook left as future)

## Phase placement

| Phase | Scope | Status |
|-------|-------|--------|
| P0.5 | Foundation + My Work read-only | ✅ Shipped |
| **P1a** | **Mutations + Install prompt (this spec)** | In progress |
| P1b | Search/filter + Notifications screen | Future |
| P2 | Dashboard + Analytics | Future |
| P3 | Leader views | Future |

## Architecture

### Repository additions

```
pwa/src/
  api/
    mutations.ts                  # complete, logProgress, snooze + undo wrapper
    mutations.test.ts
  components/
    SwipeRow.tsx                  # generic horizontal-swipe reveal primitive
    TaskActions.tsx               # complete / log / snooze action panel
    LogProgressModal.tsx          # hours + note form
    InstallPrompt.tsx             # custom A2HS banner
    IOSInstallModal.tsx           # iOS Safari "Add to Home Screen" steps
    components.test.tsx           # extended
  hooks/
    useInstallPrompt.ts           # captures beforeinstallprompt, exposes prompt fn
    useCompleteCounter.ts         # localStorage counter for prompt gating
    useUndoableMutation.ts        # 5s undo wrapper around react-query useMutation
  pages/MyWork/
    List.tsx                      # wire SwipeRow + TaskActions + InstallPrompt
    Detail.tsx                    # wire action bar (replace placeholder)

vernon_tasks/task/api/
  my_work_mutations.py            # complete, log_progress, snooze
  test_my_work_mutations.py
  telemetry.py                    # extend ALLOWED_EVENTS
```

### Backend: `my_work_mutations.py`

```python
import frappe
from frappe.utils import add_days, getdate, today, now_datetime

TASK_DOCTYPE = "VT Task"


def _check_access(task_id: str) -> "frappe.model.document.Document":
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
    doc = _check_access(task_id)
    if doc.kanban_status == "Done":
        return {"ok": True, "idempotent": True}
    doc.kanban_status = "Done"
    doc.completion_date = today()
    doc.save()
    return {"ok": True, "task_id": task_id}


@frappe.whitelist()
def log_progress(task_id: str, hours: float, note: str = "") -> dict:
    doc = _check_access(task_id)
    hours_f = float(hours)
    if hours_f <= 0 or hours_f > 24:
        frappe.throw("Hours must be in range (0, 24]")
    doc.actual_hours = (doc.actual_hours or 0) + hours_f
    doc.save()
    if note:
        frappe.get_doc({
            "doctype": "Comment",
            "comment_type": "Comment",
            "reference_doctype": TASK_DOCTYPE,
            "reference_name": task_id,
            "content": f"[Log {hours_f}h] {note}",
        }).insert(ignore_permissions=True)
    return {"ok": True, "actual_hours": doc.actual_hours}


@frappe.whitelist()
def snooze(task_id: str, days: int) -> dict:
    doc = _check_access(task_id)
    days_i = int(days)
    if days_i not in (1, 3, 7):
        frappe.throw("Days must be 1, 3, or 7")
    new_deadline = add_days(getdate(doc.deadline or today()), days_i)
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

### Frontend: `mutations.ts`

```typescript
import { api } from "./client";

const BASE = "/api/method/vernon_tasks.task.api.my_work_mutations";

export interface CompleteResult { ok: boolean; idempotent?: boolean; task_id?: string }
export interface LogResult { ok: boolean; actual_hours: number }
export interface SnoozeResult { ok: boolean; deadline: string }

export const completeTask = (task_id: string) =>
  api.post<CompleteResult>(`${BASE}.complete`, { task_id });

export const logProgress = (task_id: string, hours: number, note: string) =>
  api.post<LogResult>(`${BASE}.log_progress`, { task_id, hours, note });

export const snoozeTask = (task_id: string, days: 1 | 3 | 7) =>
  api.post<SnoozeResult>(`${BASE}.snooze`, { task_id, days });
```

### Undo pattern (`useUndoableMutation`)

```typescript
// Wraps react-query useMutation in a 5s setTimeout. Returns {trigger, cancel}.
// On trigger:
//   1. immediately run onOptimistic (caller updates UI)
//   2. show toast w/ "Batalkan" button + 5s countdown
//   3. on timeout: run real mutationFn; on success/error: surface result
//   4. on cancel (user taps undo): clearTimeout, run onRollback
// If component unmounts mid-wait: queue still completes (fire-and-forget)
```

### Swipe-reveal interaction (`SwipeRow`)

- Horizontal pan from card right edge
- Threshold: 80px to reveal, snap back if released under
- Reveals up to 3 action buttons (44pt min tap target)
- Spring back on outside tap
- Pointer events (works mouse + touch)
- Long-press not implemented in P1a (left for multi-select hook later)

### Task action surface

| Surface | Action | Behavior |
|---------|--------|----------|
| Checkbox left of title | Complete | Direct optimistic complete |
| Swipe left → "Selesai" | Complete | Same as checkbox |
| Swipe left → "Log" | Log progress | Opens LogProgressModal |
| Swipe left → "Tunda" | Snooze | Opens 3-button sheet (1d/3d/7d) |
| Detail page action bar | All three | Same handlers as list |

### Log progress modal

- Number input (step 0.25, min 0.25, max 8) labeled "Jam"
- Textarea (optional) labeled "Catatan"
- Submit → optimistic local hours bump + undo toast
- Cancel button + backdrop tap dismisses

### Install prompt

#### State machine

```
boot
  → if standalone display-mode: persistent_state = installed; never prompt
  → listen for beforeinstallprompt event; store deferredPrompt
  → vt_install_choice in localStorage: { accepted | dismissed | snoozed_until_ts }
on task_complete success
  → increment vt_complete_count
  → if count >= 2 AND no choice AND (no snooze OR snooze expired) AND deferredPrompt: show banner
  → if iOS Safari (no deferredPrompt, but A2HS possible): show IOSInstallModal once at same gate
banner actions
  → "Pasang" → call deferredPrompt.prompt(); record accepted/dismissed from userChoice
  → "Nanti" → snoozed_until_ts = now + 7d
  → close X → dismissed (never show again)
```

#### iOS Safari modal

Three-step illustrated instructions in id-ID:

1. "Tekan tombol Bagikan di Safari"
2. "Pilih 'Tambahkan ke Layar Utama'"
3. "Tekan 'Tambah' di pojok kanan atas"

Static SVGs (no external assets, base64-inline or minimal vector).

### Telemetry additions

Append to `ALLOWED_EVENTS` in `vernon_tasks/task/api/telemetry.py`:

```python
"task_complete",
"task_complete_undone",
"task_log",
"task_snooze",
"install_prompt_shown",
"install_accepted",
"install_dismissed",
"install_snoozed",
```

Emit from:

- `task_complete` / `_undone` → after API success / undo cancel
- `task_log` → after log_progress success (props: hours)
- `task_snooze` → after snooze success (props: days)
- `install_prompt_shown` (props: platform = "android" | "ios")
- `install_accepted` / `install_dismissed` / `install_snoozed`

### Permissions

Single helper `_check_access` in `my_work_mutations.py` covers all three
endpoints. Test asserts:

- Owner (`assigned_to`) can mutate
- Random user receives `PermissionError`
- Frappe role with `VT Task` write permission can mutate (e.g., Leader)

### Error handling

| Failure | Treatment |
|---------|-----------|
| `navigator.onLine === false` on action tap | Action disabled visually + Toast "Sambungkan internet dulu" |
| 403 from mutation | Rollback optimistic, Toast "Tidak ada akses" |
| 5xx | Rollback, Toast "Gagal. Coba lagi" w/ Retry action |
| Network drop during 5s undo wait | Rollback, Toast "Gagal sinkron" (queued mutation still triggers after expiry; if fetch fails it just rolls back) |
| User leaves page mid-undo | Pending mutations fire on unmount (fire-and-forget) |
| Install prompt missing on Android | Treat as iOS path (show manual instructions if installable) |

### Testing

#### Frontend (Vitest)

- `mutations.test.ts` — completeTask hits correct URL with payload; surfaces ApiError on 4xx/5xx
- `useUndoableMutation.test.ts` — undo within 5s cancels fetch; expiry fires fetch; double-trigger debounces
- `useCompleteCounter.test.ts` — increment / read / reset; ≥2 returns ready
- `useInstallPrompt.test.ts` — captures beforeinstallprompt; getter resolves; iOS detection
- `SwipeRow.test.tsx` — pan beyond threshold reveals; release under threshold snaps back
- `TaskActions.test.tsx` — each button calls correct handler
- `InstallPrompt.test.tsx` — hidden if standalone; visible after 2 completes; snooze persists
- `LogProgressModal.test.tsx` — validate hours range; submit calls logProgress

#### Backend (pytest via bench)

- `test_my_work_mutations.py`
  - `test_complete_marks_done` — status transitions, completion_date set
  - `test_complete_idempotent` — second call is no-op
  - `test_log_appends_hours_and_comment` — actual_hours sum, comment row exists
  - `test_log_rejects_invalid_hours` — 0, -1, 25 raise
  - `test_snooze_shifts_deadline` — +1d/+3d/+7d each verified
  - `test_snooze_rejects_invalid_days` — 2, 14 raise
  - `test_other_user_forbidden` — PermissionError for all three endpoints

#### Playwright smoke

- Login → open first task in Today section → tap Selesai → expect undo toast → wait 6s → task disappears from list

### Rollout

1. Build + deploy to staging
2. Smoke through pilot team's actual data (5–10 users from P0.5 pilot)
3. Watch telemetry funnel:
   - `task_complete` / day per user
   - `task_complete_undone` rate (< 10% target)
   - `install_prompt_shown` → `install_accepted` rate (≥ 25% target)
4. Company-wide release behind feature flag in `VT Settings` (default ON
   after pilot week)

## Open questions

None — all decisions captured. P1b will revisit search ergonomics + notif
polling cadence after this ships.

## References

- P0.5 spec: `docs/superpowers/specs/2026-05-11-vernon-pwa-foundation-design.md`
- P0.5 plan: `docs/superpowers/plans/2026-05-11-vernon-pwa-foundation.md`
- Apple HIG: A2HS guidance (Safari has no programmatic prompt)
- Chrome PWA: `beforeinstallprompt` lifecycle
- Material 3: swipe actions + snackbar undo pattern

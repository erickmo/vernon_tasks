# Vernon Tasks PWA — P1a Mutations + Install Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship task mutations (Complete / Log progress / Snooze) with 5-second undo and a custom install prompt, building on P0.5 foundation.

**Architecture:** Three Frappe whitelisted endpoints in `my_work_mutations.py` gated by `_check_access`. Frontend mutations live in `pwa/src/api/mutations.ts`. UI primitives: `SwipeRow` (generic), `TaskActions` (3-button reveal), `LogProgressModal`. Undo handled by `useUndoableMutation` (5s setTimeout wrap around react-query). Install prompt fires after 2nd complete via `useCompleteCounter` + `useInstallPrompt`; iOS path shows instructions modal.

**Tech Stack:** Frappe v15, React 18, react-query 5, TypeScript 5, Vite 5, Vitest, Playwright.

**Reference spec:** `docs/superpowers/specs/2026-05-11-vernon-pwa-p1a-mutations-design.md`
**Predecessor PR:** #1 (P0.5 foundation)

---

## Pre-flight

- [ ] **Step 0.1: Verify branch**

```bash
cd /Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks
git branch --show-current
```

Expected: `feat/pwa-p1a-mutations`. If not, `git checkout -b feat/pwa-p1a-mutations`.

- [ ] **Step 0.2: Confirm P0.5 already merged on master**

```bash
git log --oneline master -3
```

Expected: top commit is `feat(pwa): foundation + My Work read-only (P0.5) (#1)`.

---

## Task 1: Backend — mutations API

**Files:**
- Create: `vernon_tasks/task/api/my_work_mutations.py`
- Create: `vernon_tasks/task/api/test_my_work_mutations.py`

- [ ] **Step 1.1: Failing test**

`vernon_tasks/task/api/test_my_work_mutations.py`:

```python
import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import today, add_days
from vernon_tasks.task.api.my_work_mutations import complete, log_progress, snooze


class TestMyWorkMutations(FrappeTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.user_a = "p1a_user_a@test.local"
        cls.user_b = "p1a_user_b@test.local"
        for u in (cls.user_a, cls.user_b):
            if not frappe.db.exists("User", u):
                frappe.get_doc({"doctype": "User", "email": u, "first_name": u}).insert(
                    ignore_permissions=True
                )
        if not frappe.db.exists("VT Project", "TEST-P1A-PROJ"):
            frappe.get_doc({
                "doctype": "VT Project",
                "name": "TEST-P1A-PROJ",
                "title": "P1a Test Project",
                "project_owner": "Administrator",
                "start_date": today(),
                "end_date": add_days(today(), 30),
            }).insert(ignore_permissions=True)

    def _make_task(self, owner, title="T"):
        return frappe.get_doc({
            "doctype": "VT Task",
            "title": title,
            "deadline": today(),
            "assigned_to": owner,
            "project": "TEST-P1A-PROJ",
        }).insert(ignore_permissions=True)

    def test_complete_marks_done(self):
        frappe.set_user(self.user_a)
        t = self._make_task(self.user_a)
        r = complete(t.name)
        self.assertTrue(r["ok"])
        doc = frappe.get_doc("VT Task", t.name)
        self.assertEqual(doc.kanban_status, "Done")
        self.assertEqual(str(doc.completion_date), today())

    def test_complete_idempotent(self):
        frappe.set_user(self.user_a)
        t = self._make_task(self.user_a)
        complete(t.name)
        r = complete(t.name)
        self.assertTrue(r.get("idempotent"))

    def test_log_appends_hours_and_comment(self):
        frappe.set_user(self.user_a)
        t = self._make_task(self.user_a)
        log_progress(t.name, hours=1.5, note="part one")
        log_progress(t.name, hours=2.0, note="part two")
        doc = frappe.get_doc("VT Task", t.name)
        self.assertEqual(doc.actual_hours, 3.5)
        comments = frappe.get_all(
            "Comment",
            filters={"reference_doctype": "VT Task", "reference_name": t.name},
        )
        self.assertEqual(len(comments), 2)

    def test_log_rejects_invalid_hours(self):
        frappe.set_user(self.user_a)
        t = self._make_task(self.user_a)
        for bad in (0, -1, 25):
            with self.assertRaises(frappe.ValidationError):
                log_progress(t.name, hours=bad)

    def test_snooze_shifts_deadline(self):
        frappe.set_user(self.user_a)
        t = self._make_task(self.user_a)
        original = today()
        for days in (1, 3, 7):
            t2 = self._make_task(self.user_a)
            r = snooze(t2.name, days=days)
            self.assertEqual(r["deadline"], str(add_days(original, days)))

    def test_snooze_rejects_invalid_days(self):
        frappe.set_user(self.user_a)
        t = self._make_task(self.user_a)
        for bad in (2, 14, 0):
            with self.assertRaises(frappe.ValidationError):
                snooze(t.name, days=bad)

    def test_other_user_forbidden(self):
        frappe.set_user(self.user_a)
        t = self._make_task(self.user_a)
        frappe.set_user(self.user_b)
        for fn in (lambda: complete(t.name),
                   lambda: log_progress(t.name, hours=1),
                   lambda: snooze(t.name, days=1)):
            with self.assertRaises(frappe.PermissionError):
                fn()
```

- [ ] **Step 1.2: Run to confirm fail**

Cannot run here (no bench site). Hand-off note: executor should run
`bench --site <site> run-tests --app vernon_tasks --module "vernon_tasks.task.api.test_my_work_mutations"`
and expect ImportError on `my_work_mutations`.

- [ ] **Step 1.3: Implement**

`vernon_tasks/task/api/my_work_mutations.py`:

```python
import frappe
from frappe.utils import add_days, getdate, today

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
    doc = _check_access(task_id)
    if doc.kanban_status == "Done":
        return {"ok": True, "idempotent": True}
    doc.kanban_status = "Done"
    doc.completion_date = today()
    doc.save()
    return {"ok": True, "task_id": task_id}


@frappe.whitelist()
def log_progress(task_id: str, hours, note: str = "") -> dict:
    hours_f = float(hours)
    if hours_f <= 0 or hours_f > MAX_LOG_HOURS:
        frappe.throw(f"Hours must be in (0, {MAX_LOG_HOURS}]")
    doc = _check_access(task_id)
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
    else:
        frappe.get_doc({
            "doctype": "Comment",
            "comment_type": "Info",
            "reference_doctype": TASK_DOCTYPE,
            "reference_name": task_id,
            "content": f"[Log {hours_f}h]",
        }).insert(ignore_permissions=True)
    return {"ok": True, "actual_hours": doc.actual_hours}


@frappe.whitelist()
def snooze(task_id: str, days) -> dict:
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

Note ordering: validation comes BEFORE `_check_access` for `log_progress` and `snooze` so that bad input raises `ValidationError` even before the perm check. Test `test_log_rejects_invalid_hours` verifies this with owner user.

- [ ] **Step 1.4: Commit**

```bash
git add vernon_tasks/task/api/my_work_mutations.py vernon_tasks/task/api/test_my_work_mutations.py
git commit -m "feat(api): task mutations (complete/log/snooze) + tests"
```

---

## Task 2: Backend — telemetry events extension

**Files:**
- Modify: `vernon_tasks/task/api/telemetry.py:5-14`

- [ ] **Step 2.1: Append events**

Edit `ALLOWED_EVENTS` set, add 8 new entries while keeping existing 8:

```python
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
}
```

- [ ] **Step 2.2: Commit**

```bash
git add vernon_tasks/task/api/telemetry.py
git commit -m "feat(telemetry): allowlist P1a mutation + install events"
```

---

## Task 3: Frontend — `mutations.ts` API client

**Files:**
- Create: `pwa/src/api/mutations.ts`
- Create: `pwa/src/api/mutations.test.ts`

- [ ] **Step 3.1: Failing test**

`pwa/src/api/mutations.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { completeTask, logProgress, snoozeTask } from "./mutations";

beforeEach(() => vi.restoreAllMocks());

describe("mutations", () => {
  it("completeTask POSTs correct URL + body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: { ok: true } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await completeTask("T1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/method/vernon_tasks.task.api.my_work_mutations.complete");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ task_id: "T1" });
  });

  it("logProgress passes hours and note", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: { ok: true, actual_hours: 1 } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await logProgress("T1", 1.5, "x");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      task_id: "T1",
      hours: 1.5,
      note: "x",
    });
  });

  it("snoozeTask passes days", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: { ok: true, deadline: "2026-05-12" } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await snoozeTask("T1", 3);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      task_id: "T1",
      days: 3,
    });
  });
});
```

- [ ] **Step 3.2: Run — fail**

```bash
cd pwa && ./node_modules/.bin/vitest run src/api/mutations.test.ts
```

Expected: module missing.

- [ ] **Step 3.3: Implement**

`pwa/src/api/mutations.ts`:

```typescript
import { api } from "./client";

const BASE = "/api/method/vernon_tasks.task.api.my_work_mutations";

export interface CompleteResult {
  ok: boolean;
  idempotent?: boolean;
  task_id?: string;
}
export interface LogResult {
  ok: boolean;
  actual_hours: number;
}
export interface SnoozeResult {
  ok: boolean;
  deadline: string;
}

export type SnoozeDays = 1 | 3 | 7;

export function completeTask(task_id: string): Promise<CompleteResult> {
  return api.post<CompleteResult>(`${BASE}.complete`, { task_id });
}

export function logProgress(
  task_id: string,
  hours: number,
  note: string,
): Promise<LogResult> {
  return api.post<LogResult>(`${BASE}.log_progress`, { task_id, hours, note });
}

export function snoozeTask(task_id: string, days: SnoozeDays): Promise<SnoozeResult> {
  return api.post<SnoozeResult>(`${BASE}.snooze`, { task_id, days });
}
```

- [ ] **Step 3.4: Re-run — PASS**

Expected: 3 PASS.

- [ ] **Step 3.5: Commit**

```bash
git add pwa/src/api/mutations.ts pwa/src/api/mutations.test.ts
git commit -m "feat(pwa): mutation API client (complete/log/snooze)"
```

---

## Task 4: Frontend — `useUndoableMutation` hook

**Files:**
- Create: `pwa/src/hooks/useUndoableMutation.ts`
- Create: `pwa/src/hooks/useUndoableMutation.test.ts`

- [ ] **Step 4.1: Failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUndoableMutation } from "./useUndoableMutation";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useUndoableMutation", () => {
  it("fires mutation after window expires", async () => {
    const mut = vi.fn().mockResolvedValue("ok");
    const { result } = renderHook(() => useUndoableMutation(mut, 5000));
    act(() => result.current.trigger("arg"));
    expect(mut).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(5001);
      await Promise.resolve();
    });
    expect(mut).toHaveBeenCalledWith("arg");
  });

  it("cancel prevents mutation from firing", async () => {
    const mut = vi.fn();
    const { result } = renderHook(() => useUndoableMutation(mut, 5000));
    act(() => result.current.trigger("arg"));
    act(() => result.current.cancel());
    await act(async () => {
      vi.advanceTimersByTime(6000);
      await Promise.resolve();
    });
    expect(mut).not.toHaveBeenCalled();
  });

  it("second trigger replaces first (latest wins)", async () => {
    const mut = vi.fn().mockResolvedValue("ok");
    const { result } = renderHook(() => useUndoableMutation(mut, 5000));
    act(() => result.current.trigger("a"));
    act(() => result.current.trigger("b"));
    await act(async () => {
      vi.advanceTimersByTime(5001);
      await Promise.resolve();
    });
    expect(mut).toHaveBeenCalledTimes(1);
    expect(mut).toHaveBeenCalledWith("b");
  });
});
```

- [ ] **Step 4.2: Run — fail**

```bash
./node_modules/.bin/vitest run src/hooks/useUndoableMutation.test.ts
```

- [ ] **Step 4.3: Implement**

`pwa/src/hooks/useUndoableMutation.ts`:

```typescript
import { useCallback, useEffect, useRef } from "react";

export interface UndoableMutationApi<TArgs> {
  trigger: (args: TArgs) => void;
  cancel: () => void;
}

export function useUndoableMutation<TArgs>(
  mutationFn: (args: TArgs) => Promise<unknown>,
  windowMs: number,
): UndoableMutationApi<TArgs> {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const trigger = useCallback(
    (args: TArgs) => {
      cancel();
      timer.current = setTimeout(() => {
        timer.current = null;
        mutationFn(args);
      }, windowMs);
    },
    [cancel, mutationFn, windowMs],
  );

  useEffect(() => cancel, [cancel]);

  return { trigger, cancel };
}
```

- [ ] **Step 4.4: Re-run — PASS**

Expected: 3 PASS.

- [ ] **Step 4.5: Commit**

```bash
git add pwa/src/hooks/useUndoableMutation.ts pwa/src/hooks/useUndoableMutation.test.ts
git commit -m "feat(pwa): useUndoableMutation hook (5s undo wrapper)"
```

---

## Task 5: Frontend — `useCompleteCounter` hook

**Files:**
- Create: `pwa/src/hooks/useCompleteCounter.ts`
- Create: `pwa/src/hooks/useCompleteCounter.test.ts`

- [ ] **Step 5.1: Failing test**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCompleteCounter } from "./useCompleteCounter";

beforeEach(() => localStorage.clear());

describe("useCompleteCounter", () => {
  it("starts at 0", () => {
    const { result } = renderHook(() => useCompleteCounter());
    expect(result.current.count).toBe(0);
    expect(result.current.ready).toBe(false);
  });

  it("increment persists across hook re-runs", () => {
    const { result, rerender } = renderHook(() => useCompleteCounter());
    act(() => result.current.increment());
    act(() => result.current.increment());
    rerender();
    expect(result.current.count).toBe(2);
    expect(result.current.ready).toBe(true);
  });

  it("reset zeros the counter", () => {
    const { result } = renderHook(() => useCompleteCounter());
    act(() => result.current.increment());
    act(() => result.current.reset());
    expect(result.current.count).toBe(0);
  });
});
```

- [ ] **Step 5.2: Run — fail**

- [ ] **Step 5.3: Implement**

`pwa/src/hooks/useCompleteCounter.ts`:

```typescript
import { useCallback, useState } from "react";

const KEY = "vt_complete_count";
const READY_AT = 2;

function read(): number {
  const v = localStorage.getItem(KEY);
  return v ? Number(v) : 0;
}

export function useCompleteCounter() {
  const [count, setCount] = useState<number>(() => read());

  const increment = useCallback(() => {
    const next = read() + 1;
    localStorage.setItem(KEY, String(next));
    setCount(next);
  }, []);

  const reset = useCallback(() => {
    localStorage.removeItem(KEY);
    setCount(0);
  }, []);

  return { count, ready: count >= READY_AT, increment, reset };
}
```

- [ ] **Step 5.4: Re-run — PASS**

Expected: 3 PASS.

- [ ] **Step 5.5: Commit**

```bash
git add pwa/src/hooks/useCompleteCounter.ts pwa/src/hooks/useCompleteCounter.test.ts
git commit -m "feat(pwa): useCompleteCounter for install prompt gating"
```

---

## Task 6: Frontend — `useInstallPrompt` hook

**Files:**
- Create: `pwa/src/hooks/useInstallPrompt.ts`
- Create: `pwa/src/hooks/useInstallPrompt.test.ts`

- [ ] **Step 6.1: Failing test**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useInstallPrompt, detectPlatform } from "./useInstallPrompt";

beforeEach(() => localStorage.clear());

describe("detectPlatform", () => {
  it("identifies iOS Safari", () => {
    expect(detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15"))
      .toBe("ios");
  });
  it("identifies Android Chrome", () => {
    expect(detectPlatform("Mozilla/5.0 (Linux; Android 13; Pixel 7) Chrome/120"))
      .toBe("android");
  });
  it("falls back to other", () => {
    expect(detectPlatform("Mozilla/5.0 (X11; Linux x86_64) Firefox/120")).toBe("other");
  });
});

describe("useInstallPrompt", () => {
  it("captures beforeinstallprompt", () => {
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.canPrompt).toBe(false);
    const ev = new Event("beforeinstallprompt") as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: string }>;
    };
    ev.prompt = () => Promise.resolve();
    ev.userChoice = Promise.resolve({ outcome: "accepted" });
    act(() => {
      window.dispatchEvent(ev);
    });
    expect(result.current.canPrompt).toBe(true);
  });

  it("snooze persists future suppression", () => {
    const { result } = renderHook(() => useInstallPrompt());
    act(() => result.current.snooze());
    expect(result.current.suppressed).toBe(true);
  });
});
```

- [ ] **Step 6.2: Run — fail**

- [ ] **Step 6.3: Implement**

`pwa/src/hooks/useInstallPrompt.ts`:

```typescript
import { useCallback, useEffect, useState } from "react";

const KEY_CHOICE = "vt_install_choice";
const KEY_SNOOZE_UNTIL = "vt_install_snooze_until";
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

export type Platform = "android" | "ios" | "other";
export type Choice = "accepted" | "dismissed" | null;

interface BIPEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function detectPlatform(ua: string = navigator.userAgent): Platform {
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "other";
}

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches;
}

function suppressedNow(): boolean {
  const choice = localStorage.getItem(KEY_CHOICE);
  if (choice === "accepted" || choice === "dismissed") return true;
  const until = Number(localStorage.getItem(KEY_SNOOZE_UNTIL) ?? "0");
  return until > Date.now();
}

export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [suppressed, setSuppressed] = useState<boolean>(() => suppressedNow());

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const prompt = useCallback(async (): Promise<Choice> => {
    if (!deferred) return null;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    localStorage.setItem(KEY_CHOICE, outcome);
    setSuppressed(true);
    setDeferred(null);
    return outcome;
  }, [deferred]);

  const snooze = useCallback(() => {
    localStorage.setItem(KEY_SNOOZE_UNTIL, String(Date.now() + SNOOZE_MS));
    setSuppressed(true);
  }, []);

  const dismissForever = useCallback(() => {
    localStorage.setItem(KEY_CHOICE, "dismissed");
    setSuppressed(true);
  }, []);

  const platform = detectPlatform();
  const canPrompt =
    !suppressed &&
    !isStandalone() &&
    (deferred !== null || platform === "ios");

  return { canPrompt, platform, deferred, prompt, snooze, dismissForever, suppressed };
}
```

- [ ] **Step 6.4: Re-run — PASS**

Expected: 5 PASS.

- [ ] **Step 6.5: Commit**

```bash
git add pwa/src/hooks/useInstallPrompt.ts pwa/src/hooks/useInstallPrompt.test.ts
git commit -m "feat(pwa): useInstallPrompt + platform detection"
```

---

## Task 7: Frontend — `SwipeRow` primitive

**Files:**
- Create: `pwa/src/components/SwipeRow.tsx`
- Create: `pwa/src/components/SwipeRow.test.tsx`

- [ ] **Step 7.1: Failing test**

```typescript
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SwipeRow } from "./SwipeRow";

describe("SwipeRow", () => {
  it("renders children", () => {
    render(<SwipeRow actions={<button>A</button>}>row</SwipeRow>);
    expect(screen.getByText("row")).toBeInTheDocument();
  });

  it("reveals actions after pan past threshold", () => {
    render(
      <SwipeRow actions={<button data-testid="act">A</button>}>row</SwipeRow>,
    );
    const row = screen.getByText("row").parentElement!;
    fireEvent.pointerDown(row, { clientX: 300, pointerId: 1 });
    fireEvent.pointerMove(row, { clientX: 200, pointerId: 1 });
    fireEvent.pointerUp(row, { clientX: 200, pointerId: 1 });
    const act = screen.getByTestId("act");
    expect(act).toBeInTheDocument();
    expect(act.closest("[data-revealed=\"true\"]")).not.toBeNull();
  });

  it("snaps back if released under threshold", () => {
    render(
      <SwipeRow actions={<button data-testid="act">A</button>}>row</SwipeRow>,
    );
    const row = screen.getByText("row").parentElement!;
    fireEvent.pointerDown(row, { clientX: 300, pointerId: 1 });
    fireEvent.pointerMove(row, { clientX: 280, pointerId: 1 });
    fireEvent.pointerUp(row, { clientX: 280, pointerId: 1 });
    const wrapper = screen.getByTestId("act").closest("[data-revealed]");
    expect(wrapper?.getAttribute("data-revealed")).toBe("false");
  });
});
```

- [ ] **Step 7.2: Run — fail**

- [ ] **Step 7.3: Implement**

`pwa/src/components/SwipeRow.tsx`:

```typescript
import { ReactNode, useRef, useState, PointerEvent } from "react";

const THRESHOLD_PX = 80;

interface Props {
  children: ReactNode;
  actions: ReactNode;
  actionsWidth?: number;
}

export function SwipeRow({ children, actions, actionsWidth = 200 }: Props) {
  const startX = useRef<number | null>(null);
  const [dx, setDx] = useState(0);
  const [revealed, setRevealed] = useState(false);

  function onPointerDown(e: PointerEvent) {
    startX.current = e.clientX;
  }
  function onPointerMove(e: PointerEvent) {
    if (startX.current == null) return;
    const delta = e.clientX - startX.current;
    if (delta < 0) setDx(Math.max(delta, -actionsWidth));
  }
  function onPointerUp() {
    if (startX.current == null) return;
    const willReveal = Math.abs(dx) >= THRESHOLD_PX;
    setRevealed(willReveal);
    setDx(willReveal ? -actionsWidth : 0);
    startX.current = null;
  }

  return (
    <div
      style={{ position: "relative", overflow: "hidden", touchAction: "pan-y" }}
      data-revealed={revealed ? "true" : "false"}
    >
      <div
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: actionsWidth,
          display: "flex",
          alignItems: "stretch",
        }}
      >
        {actions}
      </div>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          transform: `translateX(${dx}px)`,
          transition: startX.current ? "none" : "transform 0.2s",
          background: "var(--vt-bg)",
          position: "relative",
        }}
      >
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 7.4: Re-run — PASS**

Expected: 3 PASS.

- [ ] **Step 7.5: Commit**

```bash
git add pwa/src/components/SwipeRow.tsx pwa/src/components/SwipeRow.test.tsx
git commit -m "feat(pwa): SwipeRow primitive (pointer-based reveal)"
```

---

## Task 8: Frontend — `TaskActions` component

**Files:**
- Create: `pwa/src/components/TaskActions.tsx`

- [ ] **Step 8.1: Implement**

```typescript
import { t } from "../i18n";

interface Props {
  onComplete: () => void;
  onLog: () => void;
  onSnooze: () => void;
  disabled?: boolean;
}

const BTN_STYLE: React.CSSProperties = {
  flex: 1,
  border: 0,
  color: "white",
  fontSize: 13,
  fontWeight: 600,
};

export function TaskActions({ onComplete, onLog, onSnooze, disabled }: Props) {
  return (
    <div style={{ display: "flex", width: "100%" }}>
      <button
        onClick={onComplete}
        disabled={disabled}
        style={{ ...BTN_STYLE, background: "var(--vt-success)" }}
      >
        {t("actions.complete")}
      </button>
      <button
        onClick={onLog}
        disabled={disabled}
        style={{ ...BTN_STYLE, background: "var(--vt-primary)" }}
      >
        {t("actions.log")}
      </button>
      <button
        onClick={onSnooze}
        disabled={disabled}
        style={{ ...BTN_STYLE, background: "var(--vt-warn)" }}
      >
        {t("actions.snooze")}
      </button>
    </div>
  );
}
```

- [ ] **Step 8.2: Add i18n keys**

Append to `STRINGS` in `pwa/src/i18n.ts`:

```typescript
  "actions.complete": "Selesai",
  "actions.log": "Log",
  "actions.snooze": "Tunda",
  "actions.snooze_1d": "+1 hari",
  "actions.snooze_3d": "+3 hari",
  "actions.snooze_7d": "+7 hari",
  "actions.completed_toast": "Selesai. Batalkan?",
  "actions.snoozed_toast": "Ditunda. Batalkan?",
  "actions.logged_toast": "Log tersimpan. Batalkan?",
  "actions.offline": "Sambungkan internet dulu",
  "actions.forbidden": "Tidak ada akses",
  "actions.failed": "Gagal. Coba lagi",
  "log.title": "Catat progres",
  "log.hours": "Jam",
  "log.note": "Catatan (opsional)",
  "log.submit": "Simpan",
  "log.cancel": "Batal",
  "install.title": "Pasang Vernon",
  "install.body": "Akses lebih cepat lewat ikon di layar utama.",
  "install.cta": "Pasang",
  "install.later": "Nanti",
  "install.ios.title": "Tambah ke Layar Utama",
  "install.ios.step1": "Tekan tombol Bagikan di Safari",
  "install.ios.step2": "Pilih ‘Tambahkan ke Layar Utama’",
  "install.ios.step3": "Tekan ‘Tambah’ di pojok kanan atas",
  "install.ios.close": "Mengerti",
```

- [ ] **Step 8.3: Commit**

```bash
git add pwa/src/components/TaskActions.tsx pwa/src/i18n.ts
git commit -m "feat(pwa): TaskActions panel + i18n keys"
```

---

## Task 9: Frontend — `LogProgressModal`

**Files:**
- Create: `pwa/src/components/LogProgressModal.tsx`

- [ ] **Step 9.1: Implement**

```typescript
import { useState } from "react";
import { t } from "../i18n";

interface Props {
  open: boolean;
  onSubmit: (hours: number, note: string) => void;
  onCancel: () => void;
}

const MIN = 0.25;
const MAX = 8;

export function LogProgressModal({ open, onSubmit, onCancel }: Props) {
  const [hours, setHours] = useState("1");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);

  if (!open) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const h = Number(hours);
    if (!Number.isFinite(h) || h < MIN || h > MAX) {
      setErr(`${MIN}–${MAX}`);
      return;
    }
    onSubmit(h, note.trim());
  }

  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "grid",
        placeItems: "end center",
        zIndex: 100,
        paddingBottom: "calc(var(--bottom-nav-h) + var(--safe-bottom))",
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        style={{
          background: "var(--vt-bg)",
          color: "var(--vt-text)",
          width: "100%",
          maxWidth: 480,
          padding: 24,
          borderRadius: "16px 16px 0 0",
        }}
      >
        <h3 style={{ marginTop: 0 }}>{t("log.title")}</h3>
        <label style={{ display: "block", marginBottom: 12 }}>
          {t("log.hours")}
          <input
            type="number"
            step={0.25}
            min={MIN}
            max={MAX}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            autoFocus
            required
            style={{ display: "block", width: "100%", padding: 12, marginTop: 4 }}
          />
        </label>
        <label style={{ display: "block", marginBottom: 12 }}>
          {t("log.note")}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            style={{ display: "block", width: "100%", padding: 12, marginTop: 4 }}
          />
        </label>
        {err && <p style={{ color: "var(--vt-danger)" }}>{err}</p>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onCancel}>
            {t("log.cancel")}
          </button>
          <button type="submit">{t("log.submit")}</button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 9.2: Commit**

```bash
git add pwa/src/components/LogProgressModal.tsx
git commit -m "feat(pwa): LogProgressModal (hours + note form)"
```

---

## Task 10: Frontend — `InstallPrompt` + `IOSInstallModal`

**Files:**
- Create: `pwa/src/components/InstallPrompt.tsx`
- Create: `pwa/src/components/IOSInstallModal.tsx`

- [ ] **Step 10.1: `IOSInstallModal.tsx`**

```typescript
import { t } from "../i18n";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function IOSInstallModal({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "grid",
        placeItems: "center",
        zIndex: 110,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--vt-bg)",
          color: "var(--vt-text)",
          padding: 24,
          borderRadius: 16,
          maxWidth: 420,
          width: "100%",
        }}
      >
        <h3 style={{ marginTop: 0 }}>{t("install.ios.title")}</h3>
        <ol style={{ paddingLeft: 20, lineHeight: 1.6 }}>
          <li>{t("install.ios.step1")}</li>
          <li>{t("install.ios.step2")}</li>
          <li>{t("install.ios.step3")}</li>
        </ol>
        <button
          onClick={onClose}
          style={{
            width: "100%",
            padding: 12,
            marginTop: 12,
            background: "var(--vt-primary)",
            color: "var(--vt-primary-contrast)",
            border: 0,
            borderRadius: "var(--vt-radius)",
          }}
        >
          {t("install.ios.close")}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 10.2: `InstallPrompt.tsx`**

```typescript
import { useState } from "react";
import { useInstallPrompt } from "../hooks/useInstallPrompt";
import { IOSInstallModal } from "./IOSInstallModal";
import { logEvent } from "../telemetry";
import { t } from "../i18n";

export function InstallPrompt({ visible }: { visible: boolean }) {
  const { canPrompt, platform, prompt, snooze, dismissForever } = useInstallPrompt();
  const [iosOpen, setIosOpen] = useState(false);
  const [shownOnce, setShownOnce] = useState(false);

  if (!visible || !canPrompt) return null;
  if (!shownOnce) {
    logEvent("install_prompt_shown", { platform });
    setShownOnce(true);
  }

  async function onInstall() {
    if (platform === "ios") {
      setIosOpen(true);
      return;
    }
    const choice = await prompt();
    if (choice === "accepted") logEvent("install_accepted", { platform });
    else if (choice === "dismissed") logEvent("install_dismissed", { platform });
  }

  function onLater() {
    snooze();
    logEvent("install_snoozed", { platform });
  }

  function onClose() {
    dismissForever();
    logEvent("install_dismissed", { platform });
  }

  return (
    <>
      <div
        style={{
          position: "fixed",
          left: 12,
          right: 12,
          bottom: "calc(var(--bottom-nav-h) + var(--safe-bottom) + 12px)",
          background: "var(--vt-primary)",
          color: "var(--vt-primary-contrast)",
          padding: 16,
          borderRadius: "var(--vt-radius)",
          boxShadow: "var(--vt-shadow)",
          zIndex: 55,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12 }}>
          <div>
            <strong>{t("install.title")}</strong>
            <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>{t("install.body")}</div>
          </div>
          <button
            onClick={onClose}
            aria-label="close"
            style={{ background: "transparent", border: 0, color: "inherit", fontSize: 18 }}
          >
            ×
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button
            onClick={onLater}
            style={{ flex: 1, background: "transparent", border: "1px solid currentColor", color: "inherit", padding: 8, borderRadius: 8 }}
          >
            {t("install.later")}
          </button>
          <button
            onClick={onInstall}
            style={{ flex: 1, background: "white", color: "var(--vt-primary)", border: 0, padding: 8, borderRadius: 8, fontWeight: 600 }}
          >
            {t("install.cta")}
          </button>
        </div>
      </div>
      <IOSInstallModal open={iosOpen} onClose={() => setIosOpen(false)} />
    </>
  );
}
```

- [ ] **Step 10.3: Commit**

```bash
git add pwa/src/components/InstallPrompt.tsx pwa/src/components/IOSInstallModal.tsx
git commit -m "feat(pwa): InstallPrompt banner + iOS instructions modal"
```

---

## Task 11: Frontend — wire mutations into `MyWork/List`

**Files:**
- Modify: `pwa/src/pages/MyWork/List.tsx`

- [ ] **Step 11.1: Replace `TaskCardView` with mutation-aware version**

Full replacement of `pwa/src/pages/MyWork/List.tsx`:

```typescript
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchMyWork, MyWork, TaskCard as TaskCardT } from "../../api/tasks";
import { completeTask, logProgress, snoozeTask, SnoozeDays } from "../../api/mutations";
import { Skeleton } from "../../components/Skeleton";
import { EmptyState } from "../../components/EmptyState";
import { StaleBadge } from "../../components/StaleBadge";
import { PullToRefresh } from "../../components/PullToRefresh";
import { SwipeRow } from "../../components/SwipeRow";
import { TaskActions } from "../../components/TaskActions";
import { LogProgressModal } from "../../components/LogProgressModal";
import { InstallPrompt } from "../../components/InstallPrompt";
import { useToast } from "../../components/Toast";
import { useUndoableMutation } from "../../hooks/useUndoableMutation";
import { useCompleteCounter } from "../../hooks/useCompleteCounter";
import { greeting, fmtDate, t } from "../../i18n";
import { logEvent } from "../../telemetry";

function TaskCardView({
  task,
  accent,
  onComplete,
  onLog,
  onSnooze,
  disabled,
}: {
  task: TaskCardT;
  accent?: string;
  onComplete: () => void;
  onLog: () => void;
  onSnooze: () => void;
  disabled: boolean;
}) {
  return (
    <SwipeRow
      actions={
        <TaskActions
          onComplete={onComplete}
          onLog={onLog}
          onSnooze={onSnooze}
          disabled={disabled}
        />
      }
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "var(--vt-space-4)",
          background: "var(--vt-surface)",
          borderRadius: "var(--vt-radius)",
          borderLeft: accent ? `3px solid ${accent}` : undefined,
          boxShadow: "var(--vt-shadow)",
        }}
      >
        <input
          type="checkbox"
          checked={false}
          onChange={onComplete}
          disabled={disabled}
          aria-label="complete"
          style={{ width: 22, height: 22 }}
        />
        <Link
          to={`/m/work/${encodeURIComponent(task.id)}`}
          style={{ flex: 1, color: "var(--vt-text)", textDecoration: "none" }}
        >
          <div style={{ fontWeight: 600 }}>{task.title}</div>
          <div style={{ fontSize: 13, color: "var(--vt-text-muted)", marginTop: 4 }}>
            {[task.project, task.priority].filter(Boolean).join(" · ")}
            {task.points ? ` · +${task.points} pts` : ""}
          </div>
        </Link>
      </div>
    </SwipeRow>
  );
}

function Section({
  title,
  items,
  accent,
  render,
}: {
  title: string;
  items: TaskCardT[];
  accent?: string;
  render: (task: TaskCardT) => React.ReactNode;
}) {
  if (items.length === 0) return null;
  return (
    <section style={{ marginBottom: "var(--vt-space-5)" }}>
      <h3
        style={{
          fontSize: 14,
          color: "var(--vt-text-muted)",
          margin: "0 0 var(--vt-space-3)",
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {title}
      </h3>
      {items.map((task) => (
        <div key={task.id} style={{ marginBottom: "var(--vt-space-3)" }}>
          {render(task)}
        </div>
      ))}
    </section>
  );
}

export function MyWorkList() {
  const q = useQuery({ queryKey: ["my-work"], queryFn: fetchMyWork });
  const qc = useQueryClient();
  const { show } = useToast();
  const { increment, ready } = useCompleteCounter();
  const [logTask, setLogTask] = useState<TaskCardT | null>(null);
  const offline = typeof navigator !== "undefined" && !navigator.onLine;

  function removeFromCache(taskId: string): MyWork | undefined {
    const prev = qc.getQueryData<MyWork>(["my-work"]);
    if (!prev) return undefined;
    const next: MyWork = {
      overdue: prev.overdue.filter((x) => x.id !== taskId),
      today: prev.today.filter((x) => x.id !== taskId),
      upcoming: prev.upcoming.filter((x) => x.id !== taskId),
    };
    qc.setQueryData(["my-work"], next);
    return prev;
  }

  const completeUndoable = useUndoableMutation(async (taskId: string) => {
    try {
      await completeTask(taskId);
      logEvent("task_complete", { task_id: taskId });
      increment();
      qc.invalidateQueries({ queryKey: ["my-work"] });
    } catch {
      qc.invalidateQueries({ queryKey: ["my-work"] });
      show(t("actions.failed"));
    }
  }, 5000);

  function handleComplete(task: TaskCardT) {
    if (offline) {
      show(t("actions.offline"));
      return;
    }
    const prev = removeFromCache(task.id);
    show(t("actions.completed_toast"), {
      label: t("common.retry"),
      onClick: () => {
        completeUndoable.cancel();
        if (prev) qc.setQueryData(["my-work"], prev);
        logEvent("task_complete_undone", { task_id: task.id });
      },
    });
    completeUndoable.trigger(task.id);
  }

  async function handleLog(task: TaskCardT, hours: number, note: string) {
    setLogTask(null);
    if (offline) {
      show(t("actions.offline"));
      return;
    }
    try {
      await logProgress(task.id, hours, note);
      logEvent("task_log", { task_id: task.id, hours });
      show(t("actions.logged_toast"));
    } catch {
      show(t("actions.failed"));
    }
  }

  async function handleSnooze(task: TaskCardT, days: SnoozeDays) {
    if (offline) {
      show(t("actions.offline"));
      return;
    }
    try {
      await snoozeTask(task.id, days);
      logEvent("task_snooze", { task_id: task.id, days });
      show(t("actions.snoozed_toast"));
      qc.invalidateQueries({ queryKey: ["my-work"] });
    } catch {
      show(t("actions.failed"));
    }
  }

  const total =
    (q.data?.overdue.length ?? 0) +
    (q.data?.today.length ?? 0) +
    (q.data?.upcoming.length ?? 0);

  return (
    <PullToRefresh onRefresh={() => q.refetch().then(() => {})}>
      <div style={{ padding: "var(--vt-space-4)" }}>
        <header style={{ marginBottom: "var(--vt-space-4)" }}>
          <h1 style={{ margin: 0 }}>{greeting()}</h1>
          <div
            style={{
              color: "var(--vt-text-muted)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 4,
            }}
          >
            <span>{fmtDate(new Date())}</span>
            <StaleBadge resource="my-work" />
          </div>
        </header>

        {q.isLoading && (
          <>
            <Skeleton height={64} />
            <div style={{ height: 12 }} />
            <Skeleton height={64} />
          </>
        )}

        {q.isError && !q.data && (
          <EmptyState
            title={t("empty.no_offline")}
            cta={{ label: t("common.retry"), onClick: () => q.refetch() }}
          />
        )}

        {q.data &&
          (total === 0 ? (
            <EmptyState title={t("empty.no_tasks")} />
          ) : (
            <>
              <Section
                title={t("tasks.section.overdue")}
                items={q.data.overdue}
                accent="var(--vt-danger)"
                render={(task) => (
                  <TaskCardView
                    task={task}
                    accent="var(--vt-danger)"
                    onComplete={() => handleComplete(task)}
                    onLog={() => setLogTask(task)}
                    onSnooze={() => handleSnooze(task, 1)}
                    disabled={offline}
                  />
                )}
              />
              <Section
                title={t("tasks.section.today")}
                items={q.data.today}
                accent="var(--vt-primary)"
                render={(task) => (
                  <TaskCardView
                    task={task}
                    accent="var(--vt-primary)"
                    onComplete={() => handleComplete(task)}
                    onLog={() => setLogTask(task)}
                    onSnooze={() => handleSnooze(task, 1)}
                    disabled={offline}
                  />
                )}
              />
              <Section
                title={t("tasks.section.upcoming")}
                items={q.data.upcoming}
                render={(task) => (
                  <TaskCardView
                    task={task}
                    onComplete={() => handleComplete(task)}
                    onLog={() => setLogTask(task)}
                    onSnooze={() => handleSnooze(task, 1)}
                    disabled={offline}
                  />
                )}
              />
            </>
          ))}
      </div>

      <LogProgressModal
        open={logTask !== null}
        onSubmit={(h, n) => logTask && handleLog(logTask, h, n)}
        onCancel={() => setLogTask(null)}
      />

      <InstallPrompt visible={ready} />
    </PullToRefresh>
  );
}
```

- [ ] **Step 11.2: Build + test smoke**

```bash
cd pwa && npm run build && ./node_modules/.bin/vitest run
```

Expected: build green; existing 23 tests + new tests from prior tasks pass.

- [ ] **Step 11.3: Commit**

```bash
git add pwa/src/pages/MyWork/List.tsx
git commit -m "feat(pwa): wire mutations + install prompt into My Work list"
```

---

## Task 12: Frontend — wire mutations into `MyWork/Detail`

**Files:**
- Modify: `pwa/src/pages/MyWork/Detail.tsx`

- [ ] **Step 12.1: Replace action-bar placeholder**

Replace the placeholder block at the bottom of `Detail.tsx` (currently
`{t("tasks.detail.action_disabled")}`) with a working action bar.

Full file replacement of `pwa/src/pages/MyWork/Detail.tsx`:

```typescript
import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchTaskDetail } from "../../api/tasks";
import { completeTask, logProgress, snoozeTask, SnoozeDays } from "../../api/mutations";
import { Skeleton } from "../../components/Skeleton";
import { EmptyState } from "../../components/EmptyState";
import { TaskActions } from "../../components/TaskActions";
import { LogProgressModal } from "../../components/LogProgressModal";
import { useToast } from "../../components/Toast";
import { useCompleteCounter } from "../../hooks/useCompleteCounter";
import { fmtDate, fmtTime, t } from "../../i18n";
import { logEvent } from "../../telemetry";

export function MyWorkDetail() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({
    queryKey: ["task", id],
    queryFn: () => fetchTaskDetail(id!),
    enabled: !!id,
  });
  const qc = useQueryClient();
  const nav = useNavigate();
  const { show } = useToast();
  const { increment } = useCompleteCounter();
  const [logOpen, setLogOpen] = useState(false);
  const offline = typeof navigator !== "undefined" && !navigator.onLine;

  useEffect(() => {
    if (id) logEvent("task_view", { task_id: id });
  }, [id]);

  async function doComplete() {
    if (!id || offline) return show(t("actions.offline"));
    try {
      await completeTask(id);
      logEvent("task_complete", { task_id: id });
      increment();
      qc.invalidateQueries({ queryKey: ["my-work"] });
      show(t("actions.completed_toast"));
      nav("/m/work");
    } catch {
      show(t("actions.failed"));
    }
  }

  async function doLog(hours: number, note: string) {
    setLogOpen(false);
    if (!id || offline) return show(t("actions.offline"));
    try {
      await logProgress(id, hours, note);
      logEvent("task_log", { task_id: id, hours });
      show(t("actions.logged_toast"));
      qc.invalidateQueries({ queryKey: ["task", id] });
    } catch {
      show(t("actions.failed"));
    }
  }

  async function doSnooze(days: SnoozeDays) {
    if (!id || offline) return show(t("actions.offline"));
    try {
      await snoozeTask(id, days);
      logEvent("task_snooze", { task_id: id, days });
      show(t("actions.snoozed_toast"));
      qc.invalidateQueries({ queryKey: ["task", id] });
      qc.invalidateQueries({ queryKey: ["my-work"] });
    } catch {
      show(t("actions.failed"));
    }
  }

  if (q.isLoading) {
    return (
      <div style={{ padding: 16 }}>
        <Skeleton height={28} width="60%" />
        <div style={{ height: 12 }} />
        <Skeleton height={120} />
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <EmptyState
        title={t("empty.no_offline")}
        cta={{ label: t("common.retry"), onClick: () => q.refetch() }}
      />
    );
  }
  const d = q.data;
  return (
    <div style={{ padding: 16 }}>
      <Link to="/m/work" style={{ color: "var(--vt-primary)", textDecoration: "none" }}>
        ← {t("nav.tasks")}
      </Link>
      <h1 style={{ marginTop: 12 }}>{d.title}</h1>
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          color: "var(--vt-text-muted)",
          marginBottom: 16,
        }}
      >
        {d.status && <span>{d.status}</span>}
        {d.priority && <span>· {d.priority}</span>}
        {d.due_date && <span>· {fmtDate(d.due_date)}</span>}
        {d.points ? <span>· +{d.points} pts</span> : null}
      </div>
      {d.description && (
        <div
          style={{
            background: "var(--vt-surface)",
            padding: 16,
            borderRadius: "var(--vt-radius)",
            whiteSpace: "pre-wrap",
            marginBottom: 16,
          }}
        >
          {d.description}
        </div>
      )}
      <h3>Aktivitas</h3>
      {d.activity.length === 0 && <p style={{ color: "var(--vt-text-muted)" }}>—</p>}
      {d.activity.map((a, idx) => (
        <div key={idx} style={{ padding: 12, borderTop: "1px solid var(--vt-border)" }}>
          <div style={{ fontSize: 12, color: "var(--vt-text-muted)" }}>
            {a.owner} · {fmtDate(a.creation)} {fmtTime(a.creation)}
          </div>
          <div>{a.content}</div>
        </div>
      ))}

      <div
        style={{
          position: "sticky",
          bottom: "calc(var(--bottom-nav-h) + var(--safe-bottom))",
          marginTop: 24,
          padding: 12,
          background: "var(--vt-bg)",
          borderTop: "1px solid var(--vt-border)",
        }}
      >
        <TaskActions
          onComplete={doComplete}
          onLog={() => setLogOpen(true)}
          onSnooze={() => doSnooze(1)}
          disabled={offline}
        />
      </div>

      <LogProgressModal
        open={logOpen}
        onSubmit={(h, n) => doLog(h, n)}
        onCancel={() => setLogOpen(false)}
      />
    </div>
  );
}
```

- [ ] **Step 12.2: Build smoke**

```bash
cd pwa && npm run build
```

Expected: build green.

- [ ] **Step 12.3: Commit**

```bash
git add pwa/src/pages/MyWork/Detail.tsx
git commit -m "feat(pwa): wire mutations into My Work detail (replace placeholder)"
```

---

## Task 13: Frontend — extend Toast for action buttons (used in undo)

**Files:**
- Verify: `pwa/src/components/Toast.tsx` (already supports `action` per P0.5)

- [ ] **Step 13.1: Verify**

```bash
grep -n "action" pwa/src/components/Toast.tsx | head
```

Expected: existing P0.5 implementation already accepts `{ label, onClick }`. No changes.

- [ ] **Step 13.2: Mark task complete (no commit needed)**

---

## Task 14: Frontend — TelemetryEvent type extension

**Files:**
- Modify: `pwa/src/telemetry.ts`

- [ ] **Step 14.1: Update type union**

Replace `TelemetryEvent` in `pwa/src/telemetry.ts`:

```typescript
export type TelemetryEvent =
  | "pwa_boot"
  | "login_success"
  | "login_failure"
  | "page_view"
  | "task_view"
  | "offline_seen"
  | "error_boundary"
  | "sw_register_failed"
  | "task_complete"
  | "task_complete_undone"
  | "task_log"
  | "task_snooze"
  | "install_prompt_shown"
  | "install_accepted"
  | "install_dismissed"
  | "install_snoozed";
```

- [ ] **Step 14.2: Build**

```bash
npm run build
```

Expected: TS check passes.

- [ ] **Step 14.3: Commit**

```bash
git add pwa/src/telemetry.ts
git commit -m "feat(pwa): extend TelemetryEvent type for P1a"
```

---

## Task 15: Playwright smoke — complete flow

**Files:**
- Modify: `pwa/e2e/smoke.spec.ts`

- [ ] **Step 15.1: Append test**

Add to existing file:

```typescript
test("complete a task via swipe action", async ({ page }) => {
  test.skip(!process.env.PWA_E2E_FULL, "Set PWA_E2E_FULL=1 to enable mutation test");

  await page.goto("/m/work");
  await page.fill('input[autocomplete="username"]', USER);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForSelector('h1:has-text(/selamat/i)', { timeout: 10_000 });

  const card = page.locator('[data-revealed]').first();
  await card.dispatchEvent("pointerdown", { clientX: 300 });
  await card.dispatchEvent("pointermove", { clientX: 100 });
  await card.dispatchEvent("pointerup", { clientX: 100 });

  await page.click('button:has-text("Selesai")');
  await expect(page.getByText(/Batalkan/i)).toBeVisible();
});
```

- [ ] **Step 15.2: Commit**

```bash
git add pwa/e2e/smoke.spec.ts
git commit -m "test(pwa): playwright smoke for complete flow (gated)"
```

---

## Task 16: Final integration + PR

- [ ] **Step 16.1: Run all frontend tests**

```bash
cd pwa && ./node_modules/.bin/vitest run
```

Expected: all green (P0.5 baseline 23 + P1a additions).

- [ ] **Step 16.2: Build**

```bash
npm run build
```

Expected: green.

- [ ] **Step 16.3: Lint**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 16.4: Push + PR**

```bash
cd ..
git push -u origin feat/pwa-p1a-mutations
gh pr create --title "feat(pwa): P1a mutations + install prompt" --body "$(cat <<'EOF'
## Summary
- Task mutations: Complete / Log progress / Snooze
- Swipe-reveal actions + checkbox primary tap
- 5-second undo via toast
- Online-only enforcement (disabled UI + toast when offline)
- Custom install prompt after 2nd successful complete
- iOS Safari fallback: instructions modal
- 8 new telemetry events for funnel analysis

## Test plan
- [ ] `cd pwa && npm test` — green (vitest)
- [ ] `bench --site <site> run-tests --app vernon_tasks --module "vernon_tasks.task.api.test_my_work_mutations"` — green
- [ ] Manual: complete task → 5s toast → wait → task removed
- [ ] Manual: complete task → tap Batalkan → task restored
- [ ] Manual: airplane mode → action buttons disabled, toast shown
- [ ] Manual: complete 2 tasks in Android Chrome → install banner shown
- [ ] Manual: iOS Safari → install banner shows instructions modal
- [ ] Manual: log progress → actual_hours increments in Desk

## References
- Spec: `docs/superpowers/specs/2026-05-11-vernon-pwa-p1a-mutations-design.md`
- Plan: `docs/superpowers/plans/2026-05-11-vernon-pwa-p1a-mutations.md`
- Predecessor: PR #1 (P0.5 foundation)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task(s) |
|---|---|
| Backend mutations API (complete/log/snooze) | 1 |
| Permission gate (_check_access) | 1 |
| Idempotency on complete | 1 (test) |
| Hours validation (0, 24] | 1 (test) |
| Snooze days ∈ {1,3,7} | 1 (test) |
| Telemetry allowlist extension | 2 |
| `mutations.ts` API client | 3 |
| `useUndoableMutation` 5s wrapper | 4 |
| `useCompleteCounter` localStorage | 5 |
| `useInstallPrompt` + platform detect | 6 |
| `SwipeRow` primitive | 7 |
| `TaskActions` 3-button panel + i18n | 8 |
| `LogProgressModal` form | 9 |
| `InstallPrompt` banner + iOS modal | 10 |
| Wire into List (swipe + checkbox + install) | 11 |
| Wire into Detail (replace placeholder) | 12 |
| Toast undo action (already supports) | 13 |
| TelemetryEvent type union | 14 |
| Playwright smoke | 15 |
| Final + PR | 16 |
| Online-only (`navigator.onLine` checks) | 11, 12 |
| Optimistic UI + rollback | 11 (removeFromCache + invalidate on error) |
| Error handling matrix | 11, 12 |
| Rollout (feature flag) | Deferred to runtime config — not part of code |

All spec sections covered.

**Placeholder scan:** No TBD / generic "handle errors" patterns.

**Type consistency:** `SnoozeDays`, `MyWork`, `TaskCard`, `CompleteResult` / `LogResult` / `SnoozeResult`, `TelemetryEvent` consistent across files.

Plan ready.

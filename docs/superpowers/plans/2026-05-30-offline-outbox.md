# Offline Outbox Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute this plan task-by-task in the current session, dispatching each bite-sized TDD task to a fresh subagent. Each task is self-contained (write failing test → run red → implement → run green → commit). Do NOT batch tasks; one red/green/commit cycle per task.

## Goal

Let task mutations (complete / log_progress / snooze / create_task) be **queued** while offline instead of being blocked with a toast, then **drained** automatically on reconnect or manually via a "Sync now" button. No optimistic UI — queued actions surface as a pending count in an upgraded `OfflineBanner`. Wire the existing-but-never-fired `offline_seen` telemetry event and add three new outbox events.

## Architecture

| File | Responsibility | Action |
|---|---|---|
| `pwa/src/cache/outbox.ts` | IndexedDB-backed FIFO queue (`enqueue`, `list`, `remove`, `count`, `update`) under idb-keyval key `vt:outbox:queue`. | create |
| `pwa/src/hooks/useOnline.ts` | Shared online/offline state replacing ad-hoc `navigator.onLine` checks. | create |
| `pwa/src/sync/outboxRunner.ts` | Drains the outbox: dispatcher registry `kind → fn(payload)`, FIFO by `createdAt`, single-flight module flag, retain+increment `attempts` on failure, move to `failed` after `MAX_ATTEMPTS=5`, collect affected query keys, return drain result. | create |
| `pwa/src/hooks/useOutbox.ts` | React binding: `pendingCount`, `failedCount`, `syncing`, `syncNow()`, `retryFailed()`; auto-drains on `online` false→true transition; invalidates query keys after drain. | create |
| `pwa/src/components/OfflineBanner.tsx` | Upgraded: offline message AND pending/failed counts + "Sync now" / "Coba lagi" buttons (visible whenever pending or failed > 0, even online). Fires `offline_seen`. | modify |
| `pwa/src/mobile/pages/MyWork/List.tsx` | Replace offline toast-and-abort branches in `handleComplete` / `handleLog` / `handleSnooze` with `enqueue`. | modify |
| `pwa/src/components/QuickAddTaskModal.tsx` | Replace direct `createTask` call with online-or-enqueue branch. | modify |
| `pwa/src/telemetry.ts` | Add `outbox_enqueue`, `outbox_drain_start`, `outbox_drain_done` to `TelemetryEvent` union (`offline_seen` already exists). | modify |

**Data shape (per spec §2):**

```ts
export type OutboxKind = "complete" | "log_progress" | "snooze" | "create_task";
export interface OutboxEntry {
  id: string;            // crypto.randomUUID()
  kind: OutboxKind;
  payload: Record<string, unknown>;
  createdAt: number;     // epoch ms
  attempts: number;
  lastError?: string;
  failed?: boolean;      // true once attempts >= MAX_ATTEMPTS
}
```

**Drain flow (per spec §4):** trigger on online false→true OR `syncNow()` → FIFO by `createdAt` → per entry call dispatcher; success removes entry + collects its query keys; failure increments `attempts`, stores `lastError`, keeps entry, and stops the run (does not block head forever because a poison entry crossing `MAX_ATTEMPTS` is flagged `failed` and skipped on subsequent drains) → single-flight module flag prevents overlapping drains → after run, invalidate collected keys once + stamp last-sync.

## Tech Stack

- TypeScript, React 18, `@tanstack/react-query` v5, `idb-keyval` v6, Vitest (`happy-dom`, globals, `setupFiles: ./src/test-setup.ts` which loads `fake-indexeddb/auto`), `@testing-library/react`.
- Test runner: `cd pwa && pnpm vitest run <path>`.
- idb-keyval is backed by `fake-indexeddb/auto` in tests (real round-trip, no `vi.mock` needed for idb — matches `cache.test.ts`). Hooks/APIs are mocked with `vi.mock` (matches `QuickAddTaskModal.test.tsx`, `List.test.tsx`).
- `crypto.randomUUID` is available in happy-dom (verified).
- Existing API methods (exact paths, do not change):
  - complete: `POST /api/method/vernon_tasks.task.api.my_work_mutations.complete` `{ task_id }`
  - log_progress: `POST …my_work_mutations.log_progress` `{ task_id, hours, note }`
  - snooze: `POST …my_work_mutations.snooze` `{ task_id, days }`
  - create_task: `POST /api/method/vernon_tasks.api.projects.create_task` `{ project, title, ... }`
- Query key invalidated after drain: `["my-work"]`.
- IMPORTANT: verify exact mutation function names/paths in `pwa/src/api/mutations.ts` (or wherever completeTask/logProgress/snoozeTask live) and the `SnoozeDays` type before writing the dispatcher registry; adapt imports to the real module.

---

## Task 1 — `cache/outbox.ts`: IDB queue round-trip

**Files**
- create `pwa/src/cache/outbox.ts`
- create `pwa/src/cache/outbox.test.ts`

### Write failing test

`pwa/src/cache/outbox.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { clear } from "idb-keyval";
import {
  enqueue,
  listOutbox,
  removeEntry,
  outboxCount,
  updateEntry,
  OutboxEntry,
} from "./outbox";

beforeEach(async () => {
  await clear();
});

describe("outbox", () => {
  it("enqueue returns an entry with id, attempts=0, createdAt", async () => {
    const e = await enqueue("complete", { task_id: "T1" });
    expect(e.id).toBeTruthy();
    expect(e.kind).toBe("complete");
    expect(e.payload).toEqual({ task_id: "T1" });
    expect(e.attempts).toBe(0);
    expect(typeof e.createdAt).toBe("number");
  });

  it("enqueue then list returns the entry; count reflects it", async () => {
    await enqueue("snooze", { task_id: "T1", days: 1 });
    const all = await listOutbox();
    expect(all).toHaveLength(1);
    expect(all[0].kind).toBe("snooze");
    expect(await outboxCount()).toBe(1);
  });

  it("list returns FIFO order by createdAt", async () => {
    const a = await enqueue("complete", { task_id: "A" });
    const b = await enqueue("complete", { task_id: "B" });
    const all = await listOutbox();
    expect(all.map((x) => x.id)).toEqual([a.id, b.id]);
    expect(all[0].createdAt).toBeLessThanOrEqual(all[1].createdAt);
  });

  it("removeEntry removes only the matching id", async () => {
    const a = await enqueue("complete", { task_id: "A" });
    await enqueue("complete", { task_id: "B" });
    await removeEntry(a.id);
    const all = await listOutbox();
    expect(all).toHaveLength(1);
    expect(all[0].payload).toEqual({ task_id: "B" });
  });

  it("updateEntry persists a patched entry", async () => {
    const a = await enqueue("complete", { task_id: "A" });
    const patched: OutboxEntry = { ...a, attempts: 3, lastError: "boom", failed: true };
    await updateEntry(patched);
    const all = await listOutbox();
    expect(all[0].attempts).toBe(3);
    expect(all[0].lastError).toBe("boom");
    expect(all[0].failed).toBe(true);
  });

  it("count is 0 on empty queue", async () => {
    expect(await outboxCount()).toBe(0);
  });
});
```

### Run it (expect fail)

```
cd pwa && pnpm vitest run src/cache/outbox.test.ts
```

Expected: fails to resolve `./outbox` (module does not exist).

### Implement

`pwa/src/cache/outbox.ts`:

```ts
import { get, set } from "idb-keyval";

const KEY = "vt:outbox:queue";

export type OutboxKind = "complete" | "log_progress" | "snooze" | "create_task";

export interface OutboxEntry {
  id: string;
  kind: OutboxKind;
  payload: Record<string, unknown>;
  createdAt: number;
  attempts: number;
  lastError?: string;
  failed?: boolean;
}

async function readAll(): Promise<OutboxEntry[]> {
  return ((await get(KEY)) as OutboxEntry[] | undefined) ?? [];
}

async function writeAll(entries: OutboxEntry[]): Promise<void> {
  await set(KEY, entries);
}

export async function enqueue(
  kind: OutboxKind,
  payload: Record<string, unknown>,
): Promise<OutboxEntry> {
  const entry: OutboxEntry = {
    id: crypto.randomUUID(),
    kind,
    payload,
    createdAt: Date.now(),
    attempts: 0,
  };
  const all = await readAll();
  all.push(entry);
  all.sort((a, b) => a.createdAt - b.createdAt);
  await writeAll(all);
  return entry;
}

export async function listOutbox(): Promise<OutboxEntry[]> {
  const all = await readAll();
  return [...all].sort((a, b) => a.createdAt - b.createdAt);
}

export async function removeEntry(id: string): Promise<void> {
  const all = await readAll();
  await writeAll(all.filter((e) => e.id !== id));
}

export async function updateEntry(entry: OutboxEntry): Promise<void> {
  const all = await readAll();
  await writeAll(all.map((e) => (e.id === entry.id ? entry : e)));
}

export async function outboxCount(): Promise<number> {
  return (await readAll()).length;
}
```

### Run pass / Commit

```
cd pwa && pnpm vitest run src/cache/outbox.test.ts
git commit -m "feat(outbox): add IndexedDB-backed pending-mutation queue"
```

---

## Task 2 — `hooks/useOnline.ts`: shared online state

**Files**: create `pwa/src/hooks/useOnline.ts` + `pwa/src/hooks/useOnline.test.ts`

### Write failing test

```ts
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOnline } from "./useOnline";

function setOnLine(value: boolean) {
  Object.defineProperty(navigator, "onLine", { value, configurable: true });
}

describe("useOnline", () => {
  it("returns initial navigator.onLine", () => {
    setOnLine(true);
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(true);
  });
  it("updates to false on offline event", () => {
    setOnLine(true);
    const { result } = renderHook(() => useOnline());
    act(() => { setOnLine(false); window.dispatchEvent(new Event("offline")); });
    expect(result.current).toBe(false);
  });
  it("updates to true on online event", () => {
    setOnLine(false);
    const { result } = renderHook(() => useOnline());
    act(() => { setOnLine(true); window.dispatchEvent(new Event("online")); });
    expect(result.current).toBe(true);
  });
});
```

Run: `cd pwa && pnpm vitest run src/hooks/useOnline.test.ts` → FAIL (unresolved import).

### Implement

```ts
import { useEffect, useState } from "react";

export function useOnline(): boolean {
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}
```

Run pass. Commit: `feat(outbox): add useOnline shared connectivity hook`

---

## Task 3 — `telemetry.ts`: add outbox events to the union

**Files**: modify `pwa/src/telemetry.ts` + create `pwa/src/telemetry.outbox.test.ts`

### Failing test

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { logEvent } from "./telemetry";
import { api } from "./api/client";

vi.mock("./api/client", () => ({ api: { post: vi.fn().mockResolvedValue({}) } }));

describe("telemetry outbox events", () => {
  beforeEach(() => vi.clearAllMocks());
  it("logs outbox_enqueue with kind", () => {
    logEvent("outbox_enqueue", { kind: "complete" });
    expect(api.post).toHaveBeenCalledWith(
      "/api/method/vernon_tasks.task.api.telemetry.log_event",
      { event: "outbox_enqueue", props: { kind: "complete" } },
    );
  });
  it("logs outbox_drain_start and outbox_drain_done", () => {
    logEvent("outbox_drain_start", { count: 2 });
    logEvent("outbox_drain_done", { ok: 2, failed: 0 });
    expect(api.post).toHaveBeenCalledTimes(2);
  });
});
```

NOTE: verify the EXACT shape `logEvent` posts (the `{ event, props }` body and the telemetry endpoint path) by reading `telemetry.ts` — adapt the assertion to the real shape if different. Run → FAIL (TS rejects `"outbox_enqueue"`).

### Implement

In `pwa/src/telemetry.ts`, extend the `TelemetryEvent` union (after `"offline_seen"`):

```ts
  | "offline_seen"
  | "outbox_enqueue"
  | "outbox_drain_start"
  | "outbox_drain_done"
```

Run pass. Commit: `feat(outbox): add outbox telemetry events to union`

---

## Task 4 — `sync/outboxRunner.ts`: drain, retry, single-flight, MAX_ATTEMPTS

**Files**: create `pwa/src/sync/outboxRunner.ts` + `pwa/src/sync/outboxRunner.test.ts`

The runner owns the dispatcher registry (`kind → fn`) wired to the real API functions, the single-flight flag, and the FIFO drain loop. It returns the set of affected query keys (the hook invalidates). It stamps last-sync via `cache/sync-time`.

### Failing test

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { clear } from "idb-keyval";
import { enqueue, listOutbox } from "../cache/outbox";
import { drainOutbox, MAX_ATTEMPTS, __setDispatchers } from "./outboxRunner";

const complete = vi.fn();
const logp = vi.fn();
const snooze = vi.fn();
const create = vi.fn();

beforeEach(async () => {
  await clear();
  vi.clearAllMocks();
  __setDispatchers({
    complete: (p) => complete(p),
    log_progress: (p) => logp(p),
    snooze: (p) => snooze(p),
    create_task: (p) => create(p),
  });
});

describe("outboxRunner", () => {
  it("drains FIFO, calls dispatcher per entry, removes on success", async () => {
    complete.mockResolvedValue({ ok: true });
    await enqueue("complete", { task_id: "A" });
    await enqueue("complete", { task_id: "B" });
    const res = await drainOutbox();
    expect(complete).toHaveBeenCalledTimes(2);
    expect(complete.mock.calls[0][0]).toEqual({ task_id: "A" });
    expect(complete.mock.calls[1][0]).toEqual({ task_id: "B" });
    expect(res.ok).toBe(2);
    expect(res.failed).toBe(0);
    expect(await listOutbox()).toHaveLength(0);
    expect(res.affectedKeys).toContainEqual(["my-work"]);
  });

  it("retains + increments attempts and stores lastError on failure, then stops the run", async () => {
    complete.mockRejectedValueOnce(new Error("net down"));
    await enqueue("complete", { task_id: "A" });
    await enqueue("complete", { task_id: "B" });
    const res = await drainOutbox();
    expect(res.ok).toBe(0);
    const all = await listOutbox();
    expect(all).toHaveLength(2);
    expect(all[0].attempts).toBe(1);
    expect(all[0].lastError).toContain("net down");
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("flags entry failed once attempts reach MAX_ATTEMPTS and skips it next drain", async () => {
    complete.mockRejectedValue(new Error("boom"));
    await enqueue("complete", { task_id: "A" });
    for (let i = 0; i < MAX_ATTEMPTS; i++) { await drainOutbox(); }
    const all = await listOutbox();
    expect(all[0].attempts).toBe(MAX_ATTEMPTS);
    expect(all[0].failed).toBe(true);
    complete.mockClear();
    const res = await drainOutbox();
    expect(complete).not.toHaveBeenCalled();
    expect(res.failed).toBe(1);
  });

  it("is single-flight: a second concurrent drain is a no-op", async () => {
    let resolve!: () => void;
    complete.mockReturnValue(new Promise<void>((r) => (resolve = () => r())));
    await enqueue("complete", { task_id: "A" });
    const first = drainOutbox();
    const second = await drainOutbox();
    expect(second.skipped).toBe(true);
    resolve();
    await first;
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("returns ok=0 failed=0 skipped=false on empty queue", async () => {
    const res = await drainOutbox();
    expect(res).toMatchObject({ ok: 0, failed: 0, skipped: false });
  });
});
```

Run → FAIL (unresolved import).

### Implement

```ts
import { completeTask, logProgress, snoozeTask, SnoozeDays } from "../api/mutations";
import { createTask } from "../mobile/pages/Project/api";
import { listOutbox, removeEntry, updateEntry, OutboxEntry, OutboxKind } from "../cache/outbox";
import { stamp } from "../cache/sync-time";
import { logEvent } from "../telemetry";

export const MAX_ATTEMPTS = 5;

type Dispatcher = (payload: Record<string, unknown>) => Promise<unknown>;

const defaultDispatchers: Record<OutboxKind, Dispatcher> = {
  complete: (p) => completeTask(p.task_id as string),
  log_progress: (p) => logProgress(p.task_id as string, p.hours as number, p.note as string),
  snooze: (p) => snoozeTask(p.task_id as string, p.days as SnoozeDays),
  create_task: (p) => createTask(p as { project: string; title: string }),
};

let dispatchers = defaultDispatchers;

export function __setDispatchers(d: Record<OutboxKind, Dispatcher>): void {
  dispatchers = d;
}

const KEYS_BY_KIND: Record<OutboxKind, unknown[][]> = {
  complete: [["my-work"]],
  log_progress: [["my-work"]],
  snooze: [["my-work"]],
  create_task: [["my-work"]],
};

export interface DrainResult {
  ok: number;
  failed: number;
  skipped: boolean;
  affectedKeys: unknown[][];
}

let draining = false;

export async function drainOutbox(): Promise<DrainResult> {
  if (draining) return { ok: 0, failed: 0, skipped: true, affectedKeys: [] };
  draining = true;
  try {
    const entries = await listOutbox();
    const pending = entries.filter((e) => !e.failed);
    let ok = 0;
    const affected: unknown[][] = [];
    if (entries.length > 0) logEvent("outbox_drain_start", { count: pending.length });

    for (const entry of pending) {
      try {
        await dispatchers[entry.kind](entry.payload);
        await removeEntry(entry.id);
        ok += 1;
        for (const k of KEYS_BY_KIND[entry.kind]) affected.push(k);
      } catch (err) {
        const next: OutboxEntry = {
          ...entry,
          attempts: entry.attempts + 1,
          lastError: err instanceof Error ? err.message : String(err),
        };
        if (next.attempts >= MAX_ATTEMPTS) next.failed = true;
        await updateEntry(next);
        break;
      }
    }

    const remaining = await listOutbox();
    const failed = remaining.filter((e) => e.failed).length;
    if (entries.length > 0) { logEvent("outbox_drain_done", { ok, failed }); stamp("outbox"); }

    const seen = new Set<string>();
    const affectedKeys = affected.filter((k) => {
      const s = JSON.stringify(k);
      if (seen.has(s)) return false;
      seen.add(s);
      return true;
    });
    return { ok, failed, skipped: false, affectedKeys };
  } finally {
    draining = false;
  }
}

export async function retryFailed(): Promise<void> {
  const entries = await listOutbox();
  for (const e of entries.filter((x) => x.failed)) {
    await updateEntry({ ...e, failed: false, attempts: 0, lastError: undefined });
  }
}
```

Run pass. Commit: `feat(outbox): add drain runner with FIFO retry, single-flight, MAX_ATTEMPTS`

---

## Task 5 — `hooks/useOutbox.ts`: React binding + auto-drain on reconnect

**Files**: create `pwa/src/hooks/useOutbox.ts` + `pwa/src/hooks/useOutbox.test.tsx`

### Failing test

```tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clear } from "idb-keyval";
import React from "react";
import { enqueue } from "../cache/outbox";
import { useOutbox } from "./useOutbox";

const drainOutbox = vi.fn();
vi.mock("../sync/outboxRunner", () => ({
  drainOutbox: (...a: unknown[]) => drainOutbox(...a),
  retryFailed: vi.fn().mockResolvedValue(undefined),
}));

function wrap() {
  const qc = new QueryClient();
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { Wrapper, qc };
}
function setOnLine(v: boolean) {
  Object.defineProperty(navigator, "onLine", { value: v, configurable: true });
}

beforeEach(async () => {
  await clear();
  vi.clearAllMocks();
  setOnLine(true);
  drainOutbox.mockResolvedValue({ ok: 0, failed: 0, skipped: false, affectedKeys: [] });
});

describe("useOutbox", () => {
  it("reports pendingCount from the queue", async () => {
    await enqueue("complete", { task_id: "A" });
    const { Wrapper } = wrap();
    const { result } = renderHook(() => useOutbox(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.pendingCount).toBe(1));
  });
  it("syncNow calls drainOutbox and invalidates affected keys", async () => {
    await enqueue("complete", { task_id: "A" });
    drainOutbox.mockResolvedValue({ ok: 1, failed: 0, skipped: false, affectedKeys: [["my-work"]] });
    const { Wrapper, qc } = wrap();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useOutbox(), { wrapper: Wrapper });
    await act(async () => { await result.current.syncNow(); });
    expect(drainOutbox).toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith({ queryKey: ["my-work"] });
  });
  it("auto-drains when online transitions false->true", async () => {
    setOnLine(false);
    const { Wrapper } = wrap();
    renderHook(() => useOutbox(), { wrapper: Wrapper });
    drainOutbox.mockClear();
    await act(async () => { setOnLine(true); window.dispatchEvent(new Event("online")); });
    await waitFor(() => expect(drainOutbox).toHaveBeenCalled());
  });
  it("syncing flips true during drain then false", async () => {
    let resolve!: (v: unknown) => void;
    drainOutbox.mockReturnValue(new Promise((r) => (resolve = r)));
    const { Wrapper } = wrap();
    const { result } = renderHook(() => useOutbox(), { wrapper: Wrapper });
    let p: Promise<void>;
    act(() => { p = result.current.syncNow(); });
    await waitFor(() => expect(result.current.syncing).toBe(true));
    await act(async () => { resolve({ ok: 0, failed: 0, skipped: false, affectedKeys: [] }); await p; });
    expect(result.current.syncing).toBe(false);
  });
});
```

Run → FAIL.

### Implement

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { listOutbox } from "../cache/outbox";
import { drainOutbox, retryFailed } from "../sync/outboxRunner";
import { useOnline } from "./useOnline";

export interface OutboxApi {
  pendingCount: number;
  failedCount: number;
  syncing: boolean;
  syncNow: () => Promise<void>;
  retry: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useOutbox(): OutboxApi {
  const qc = useQueryClient();
  const online = useOnline();
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const prevOnline = useRef(online);

  const refresh = useCallback(async () => {
    const all = await listOutbox();
    setPendingCount(all.filter((e) => !e.failed).length);
    setFailedCount(all.filter((e) => e.failed).length);
  }, []);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await drainOutbox();
      if (!res.skipped) {
        for (const key of res.affectedKeys) qc.invalidateQueries({ queryKey: key as unknown[] });
      }
    } finally {
      setSyncing(false);
      await refresh();
    }
  }, [qc, refresh]);

  const retry = useCallback(async () => {
    await retryFailed();
    await refresh();
    await syncNow();
  }, [refresh, syncNow]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (online && !prevOnline.current) void syncNow();
    prevOnline.current = online;
  }, [online, syncNow]);

  return { pendingCount, failedCount, syncing, syncNow, retry, refresh };
}
```

Run pass. Commit: `feat(outbox): add useOutbox hook with auto-drain on reconnect`

---

## Task 6 — `OfflineBanner.tsx`: pending count + Sync now + offline_seen

**Files**: modify `pwa/src/components/OfflineBanner.tsx` + `pwa/src/components/OfflineBanner.test.tsx`

Banner uses `useOnline()` + `useOutbox()`. Visible when offline OR pending>0 OR failed>0; null otherwise. Fires `offline_seen` first time offline shows. Keeps `role="status"`; Sync is a real `<button>`.

### Failing test

```tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OfflineBanner } from "./OfflineBanner";

const logEvent = vi.fn();
vi.mock("../telemetry", () => ({ logEvent: (...a: unknown[]) => logEvent(...a) }));

const syncNow = vi.fn().mockResolvedValue(undefined);
const retry = vi.fn().mockResolvedValue(undefined);
let outbox = { pendingCount: 0, failedCount: 0, syncing: false, syncNow, retry };
vi.mock("../hooks/useOutbox", () => ({ useOutbox: () => outbox }));

let online = true;
vi.mock("../hooks/useOnline", () => ({ useOnline: () => online }));

beforeEach(() => {
  vi.clearAllMocks();
  online = true;
  outbox = { pendingCount: 0, failedCount: 0, syncing: false, syncNow, retry };
});

describe("OfflineBanner", () => {
  it("renders null when online and nothing pending", () => {
    const { container } = render(<OfflineBanner />);
    expect(container.firstChild).toBeNull();
  });
  it("renders offline message with danger background when offline", () => {
    online = false;
    render(<OfflineBanner />);
    const banner = screen.getByRole("status");
    const style = banner.getAttribute("style") ?? "";
    expect(style).toContain("var(--vt-danger)");
    expect(style).toContain("#fff");
    expect(screen.getByText(/Mode offline/i)).toBeInTheDocument();
  });
  it("fires offline_seen when shown offline", () => {
    online = false;
    render(<OfflineBanner />);
    expect(logEvent).toHaveBeenCalledWith("offline_seen", {});
  });
  it("shows pending count and a Sync now button when pending > 0 (even online)", () => {
    outbox = { ...outbox, pendingCount: 3 };
    render(<OfflineBanner />);
    expect(screen.getByText(/3 aksi menunggu/i)).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: /sync/i });
    fireEvent.click(btn);
    expect(syncNow).toHaveBeenCalled();
  });
  it("disables Sync button and shows spinner text while syncing", () => {
    outbox = { ...outbox, pendingCount: 2, syncing: true };
    render(<OfflineBanner />);
    const btn = screen.getByRole("button", { name: /menyinkronkan/i });
    expect(btn).toBeDisabled();
  });
  it("shows failed count with a retry button when failed > 0", () => {
    outbox = { ...outbox, failedCount: 1 };
    render(<OfflineBanner />);
    expect(screen.getByText(/1 gagal/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /coba lagi/i }));
    expect(retry).toHaveBeenCalled();
  });
});
```

Run → FAIL.

### Implement

```tsx
import { useEffect, useRef } from "react";
import { fmtTime } from "../i18n";
import { useOnline } from "../hooks/useOnline";
import { useOutbox } from "../hooks/useOutbox";
import { logEvent } from "../telemetry";

export function OfflineBanner() {
  const online = useOnline();
  const { pendingCount, failedCount, syncing, syncNow, retry } = useOutbox();
  const sinceRef = useRef<Date | null>(null);
  const seenOffline = useRef(false);

  if (!online && sinceRef.current === null) sinceRef.current = new Date();
  if (online) sinceRef.current = null;

  useEffect(() => {
    if (!online && !seenOffline.current) { seenOffline.current = true; logEvent("offline_seen", {}); }
    if (online) seenOffline.current = false;
  }, [online]);

  const visible = !online || pendingCount > 0 || failedCount > 0;
  if (!visible) return null;

  const btnStyle = {
    background: "rgba(255,255,255,0.2)", color: "#fff",
    border: "1px solid rgba(255,255,255,0.5)", borderRadius: 6,
    padding: "2px 10px", fontSize: 12, fontWeight: 600,
  } as const;

  return (
    <div
      role="status"
      style={{
        position: "sticky", top: 0, zIndex: 20,
        background: "var(--vt-danger)", color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: 12, flexWrap: "wrap", textAlign: "center",
        padding: "var(--vt-space-2)", fontSize: 13,
      }}
    >
      {!online && pendingCount === 0 && failedCount === 0 && (
        <span>Mode offline · terakhir sinkron {sinceRef.current ? fmtTime(sinceRef.current) : "—"}</span>
      )}
      {!online && (pendingCount > 0 || failedCount > 0) && <span>Mode offline</span>}
      {pendingCount > 0 && (
        <>
          <span>{`${pendingCount} aksi menunggu`}</span>
          <button type="button" onClick={() => void syncNow()} disabled={syncing}
            aria-label={syncing ? "Menyinkronkan…" : "Sync now"}
            style={{ ...btnStyle, cursor: syncing ? "default" : "pointer" }}>
            {syncing ? "Menyinkronkan…" : "Sync now"}
          </button>
        </>
      )}
      {failedCount > 0 && (
        <>
          <span>{`${failedCount} gagal`}</span>
          <button type="button" onClick={() => void retry()} aria-label="Coba lagi"
            style={{ ...btnStyle, cursor: "pointer" }}>Coba lagi</button>
        </>
      )}
    </div>
  );
}
```

NOTE: the legacy `components.test.tsx` may render `OfflineBanner` bare; it now needs a `QueryClientProvider` (via `useOutbox`→`useQueryClient`). Fix that wrapper in Task 9 if it fails.

Run pass. Commit: `feat(outbox): upgrade OfflineBanner with pending count and Sync now`

---

## Task 7 — `MyWork/List.tsx`: enqueue interception for complete/log/snooze

**Files**: modify `pwa/src/mobile/pages/MyWork/List.tsx` + `pwa/src/mobile/pages/MyWork/List.test.tsx` + `pwa/src/i18n.ts`

Replace the three offline `show(t("actions.offline"))`-and-return branches with `enqueue(...)` + a "saved offline" toast + `outbox_enqueue` telemetry. Online paths unchanged (complete keeps the undo window). Use `useOnline()` for the `offline` flag. Add i18n `actions.queued` = `"Disimpan, akan dikirim saat online"`. CRITICAL: read the real `handleComplete/handleLog/handleSnooze` + the offline-disable on the checkbox/TaskActions; ensure offline clicks reach the handlers (the checkbox/actions must NOT be `disabled` offline, else the enqueue path never fires).

### Failing test (append to List.test.tsx)

```tsx
const enqueueMock = vi.fn().mockResolvedValue({ id: "x" });
vi.mock("../../../cache/outbox", () => ({ enqueue: (...a: unknown[]) => enqueueMock(...a) }));
vi.mock("../../../hooks/useOutbox", () => ({
  useOutbox: () => ({ pendingCount: 0, failedCount: 0, syncing: false, syncNow: vi.fn(), retry: vi.fn(), refresh: vi.fn() }),
}));

describe("MyWorkList offline enqueue", () => {
  it("enqueues a complete instead of blocking when offline", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: { overdue: [], today: [{ id: "T1", title: "Buat laporan" }], upcoming: [] } }), { status: 200 }),
    ));
    wrap(<MyWorkList />);
    await waitFor(() => expect(screen.getByText("Buat laporan")).toBeInTheDocument());
    fireEvent.click(screen.getAllByLabelText("complete")[0]);
    await waitFor(() => expect(enqueueMock).toHaveBeenCalledWith("complete", { task_id: "T1" }));
  });
});
```

(Add `Object.defineProperty(navigator,"onLine",{value:true,configurable:true})` in the existing `beforeEach` so other tests stay online.)

Run → FAIL.

### Implement

1. Imports: `import { enqueue } from "../../../cache/outbox";` `import { useOnline } from "../../../hooks/useOnline";`
2. Replace offline derivation: `const online = useOnline(); const offline = !online;`
3. `handleComplete` offline branch:
```ts
  if (offline) {
    void enqueue("complete", { task_id: task.id });
    logEvent("outbox_enqueue", { kind: "complete" });
    removeFromCache(task.id);
    show(t("actions.queued"));
    return;
  }
```
4. `handleLog` offline branch:
```ts
  if (offline) {
    await enqueue("log_progress", { task_id: task.id, hours, note });
    logEvent("outbox_enqueue", { kind: "log_progress" });
    show(t("actions.queued"));
    return;
  }
```
5. `handleSnooze` offline branch:
```ts
  if (offline) {
    await enqueue("snooze", { task_id: task.id, days });
    logEvent("outbox_enqueue", { kind: "snooze" });
    show(t("actions.queued"));
    return;
  }
```
6. `i18n.ts` add: `"actions.queued": "Disimpan, akan dikirim saat online",`
7. Ensure the complete checkbox + TaskActions are NOT disabled when offline (pass `disabled={false}`), so offline clicks reach the handlers.

Run pass. Commit: `feat(outbox): enqueue MyWork complete/log/snooze when offline`

---

## Task 8 — `QuickAddTaskModal.tsx`: enqueue create_task when offline

**Files**: modify `pwa/src/components/QuickAddTaskModal.tsx` + `pwa/src/components/QuickAddTaskModal.test.tsx`

### Failing test (append)

```tsx
const enqueueMock = vi.fn().mockResolvedValue({ id: "x" });
vi.mock("../cache/outbox", () => ({ enqueue: (...a: unknown[]) => enqueueMock(...a) }));
let online = true;
vi.mock("../hooks/useOnline", () => ({ useOnline: () => online }));

it("enqueues create_task instead of calling API when offline", async () => {
  online = false;
  const onCreated = vi.fn();
  render(<QuickAddTaskModal projects={projects} onClose={vi.fn()} onCreated={onCreated} />);
  fireEvent.change(screen.getByLabelText(/proyek/i), { target: { value: "PROJ-001" } });
  fireEvent.change(screen.getByLabelText(/judul/i), { target: { value: "Tugas Z" } });
  fireEvent.click(screen.getByRole("button", { name: "Tambah" }));
  await waitFor(() => expect(enqueueMock).toHaveBeenCalledWith("create_task", { project: "PROJ-001", title: "Tugas Z" }));
  await waitFor(() => expect(onCreated).toHaveBeenCalled());
  expect(createTask).not.toHaveBeenCalled();
});
```

(Add `online = true;` reset in the existing `beforeEach`.) Run → FAIL.

### Implement

Imports: `import { enqueue } from "../cache/outbox";` `import { useOnline } from "../hooks/useOnline";`
Add `const online = useOnline();`; update `handleSubmit`:
```ts
  const payload = { project, title: title.trim() };
  if (!online) {
    await enqueue("create_task", payload);
    logEvent("outbox_enqueue", { kind: "create_task" });
  } else {
    await createTask(payload);
    logEvent("quick_add_task_submit", { project });
  }
  onCreated();
```

Run pass. Commit: `feat(outbox): enqueue create_task from QuickAddTaskModal when offline`

---

## Task 9 — Final verification gate

Run:
```
cd pwa && pnpm vitest run
cd pwa && NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit
cd pwa && NODE_OPTIONS=--max-old-space-size=4096 pnpm build
```
Fix legacy `components.test.tsx` OfflineBanner mount (wrap in QueryClientProvider or mock useOnline/useOutbox). Commit any fixes: `test(outbox): verify full suite, tsc, and build pass`

---

## Self-Review — spec section → task mapping

- §1 outbox.ts → T1; useOnline → T2; outboxRunner → T4; useOutbox → T5; OfflineBanner → T6.
- §2 OutboxEntry + single key → T1; kind→dispatcher registry → T4.
- §3 enqueue MyWork → T7; QuickAdd create_task → T8; comment/non-task stay online-only (untouched, deliberate).
- §4 auto-drain reconnect → T5; manual Sync now → T5+T6; FIFO → T1+T4; success/failure/attempts/lastError/stop → T4; single-flight → T4; MAX_ATTEMPTS=5 → T4; invalidate keys + stamp → T4+T5.
- §5 banner states (offline msg / pending / failed / null / a11y) → T6.
- §6 telemetry events → T3 (union) + T4/T6/T7/T8 (fire).
- §7 tests per module → T1,T2,T4,T6,T7; gate → T9.
- §8 out-of-scope (no optimistic, no conflict resolution, no SW background-sync, no comment queue) honored.

import { completeTask, logProgress, snoozeTask, SnoozeDays } from "../api/mutations";
import { createTask } from "../mobile/pages/Project/api";
import { listOutbox, removeEntry, updateEntry, OutboxEntry, OutboxKind } from "../cache/outbox";
import { stamp } from "../cache/sync-time";
import { logEvent } from "../telemetry";

export const MAX_ATTEMPTS = 5;

type Dispatcher = (payload: Record<string, unknown>) => Promise<unknown>;

/**
 * Maps each outbox kind to the real API call that replays it online.
 * Payload fields mirror the args captured at enqueue time in MyWork/QuickAdd.
 */
const defaultDispatchers: Record<OutboxKind, Dispatcher> = {
  complete: (p) => completeTask(p.task_id as string),
  log_progress: (p) => logProgress(p.task_id as string, p.hours as number, p.note as string),
  snooze: (p) => snoozeTask(p.task_id as string, p.days as SnoozeDays),
  create_task: (p) => createTask(p as { project: string; title: string }),
};

let dispatchers = defaultDispatchers;

/** Test seam: override the dispatcher registry. */
export function __setDispatchers(d: Record<OutboxKind, Dispatcher>): void {
  dispatchers = d;
}

/** React-query keys to invalidate after a successful replay, per kind. */
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

// Module-level single-flight flag preventing overlapping drains.
let draining = false;

/**
 * Drain the outbox FIFO. Success removes the entry and collects its query
 * keys; failure increments attempts, stores lastError, keeps the entry and
 * stops the run. An entry crossing MAX_ATTEMPTS is flagged `failed` so it is
 * skipped on subsequent drains (poison-message guard).
 * @returns counts plus the de-duplicated query keys the caller must invalidate.
 */
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
        // Flag as poison once it exhausts retries so it never blocks the head.
        if (next.attempts >= MAX_ATTEMPTS) next.failed = true;
        await updateEntry(next);
        break;
      }
    }

    const remaining = await listOutbox();
    const failed = remaining.filter((e) => e.failed).length;
    if (entries.length > 0) {
      logEvent("outbox_drain_done", { ok, failed });
      stamp("outbox");
    }

    // De-duplicate query keys so the hook invalidates each one once.
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

/** Reset all failed entries back to pending so the next drain retries them. */
export async function retryFailed(): Promise<void> {
  const entries = await listOutbox();
  for (const e of entries.filter((x) => x.failed)) {
    await updateEntry({ ...e, failed: false, attempts: 0, lastError: undefined });
  }
}

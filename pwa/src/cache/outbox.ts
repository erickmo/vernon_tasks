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

/** Read the full queue from IndexedDB, defaulting to an empty list. */
async function readAll(): Promise<OutboxEntry[]> {
  return ((await get(KEY)) as OutboxEntry[] | undefined) ?? [];
}

/** Persist the full queue to IndexedDB under the single outbox key. */
async function writeAll(entries: OutboxEntry[]): Promise<void> {
  await set(KEY, entries);
}

/**
 * Append a pending mutation to the outbox.
 * @param kind mutation type the drain runner will dispatch
 * @param payload arguments needed to replay the mutation when online
 * @returns the stored entry (with generated id, attempts=0, createdAt)
 */
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

/** Return all queued entries in FIFO order by createdAt. */
export async function listOutbox(): Promise<OutboxEntry[]> {
  const all = await readAll();
  return [...all].sort((a, b) => a.createdAt - b.createdAt);
}

/** Remove the entry with the matching id (no-op if absent). */
export async function removeEntry(id: string): Promise<void> {
  const all = await readAll();
  await writeAll(all.filter((e) => e.id !== id));
}

/** Replace the stored entry sharing the same id with the patched version. */
export async function updateEntry(entry: OutboxEntry): Promise<void> {
  const all = await readAll();
  await writeAll(all.map((e) => (e.id === entry.id ? entry : e)));
}

/** Number of entries currently in the queue (pending + failed). */
export async function outboxCount(): Promise<number> {
  return (await readAll()).length;
}

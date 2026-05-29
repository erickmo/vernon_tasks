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

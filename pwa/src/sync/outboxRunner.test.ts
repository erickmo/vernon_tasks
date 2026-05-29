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

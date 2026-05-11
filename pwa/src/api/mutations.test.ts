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
      new Response(
        JSON.stringify({ message: { ok: true, actual_hours: 1 } }),
        { status: 200 },
      ),
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
      new Response(
        JSON.stringify({ message: { ok: true, deadline: "2026-05-12" } }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    await snoozeTask("T1", 3);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      task_id: "T1",
      days: 3,
    });
  });
});

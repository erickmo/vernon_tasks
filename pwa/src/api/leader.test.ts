import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchReviewQueue, approveTask, rejectTask } from "./leader";

beforeEach(() => vi.restoreAllMocks());

describe("leader api", () => {
  it("fetchReviewQueue hits get_review_queue", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: [] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await fetchReviewQueue();
    expect(fetchMock.mock.calls[0][0]).toContain("get_review_queue");
  });

  it("approveTask POSTs task_name", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: { status: "ok" } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await approveTask("T1");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ task_name: "T1" });
  });

  it("rejectTask POSTs task_name + reason", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: { status: "ok" } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await rejectTask("T1", "incomplete");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      task_name: "T1",
      reason: "incomplete",
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchMyWork } from "./tasks";

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("tasks api", () => {
  it("fetchMyWork returns groups + stamps cache", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: { overdue: [], today: [{ id: "T1", title: "x" }], upcoming: [] },
          }),
          { status: 200 },
        ),
      ),
    );
    const r = await fetchMyWork();
    expect(r.today).toHaveLength(1);
    expect(localStorage.getItem("vt_sync:my-work")).toBeTruthy();
  });

  it("fetchMyWork falls back to cache on network fail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: { overdue: [], today: [{ id: "T1", title: "x" }], upcoming: [] },
          }),
          { status: 200 },
        ),
      ),
    );
    await fetchMyWork();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const r = await fetchMyWork();
    expect(r.today).toHaveLength(1);
  });
});

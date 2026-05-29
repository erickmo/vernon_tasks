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

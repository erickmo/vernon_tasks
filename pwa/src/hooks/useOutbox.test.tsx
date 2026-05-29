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

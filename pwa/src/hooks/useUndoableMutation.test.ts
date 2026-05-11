import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUndoableMutation } from "./useUndoableMutation";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useUndoableMutation", () => {
  it("fires mutation after window expires", async () => {
    const mut = vi.fn().mockResolvedValue("ok");
    const { result } = renderHook(() => useUndoableMutation(mut, 5000));
    act(() => result.current.trigger("arg"));
    expect(mut).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(5001);
      await Promise.resolve();
    });
    expect(mut).toHaveBeenCalledWith("arg");
  });

  it("cancel prevents mutation from firing", async () => {
    const mut = vi.fn();
    const { result } = renderHook(() => useUndoableMutation(mut, 5000));
    act(() => result.current.trigger("arg"));
    act(() => result.current.cancel());
    await act(async () => {
      vi.advanceTimersByTime(6000);
      await Promise.resolve();
    });
    expect(mut).not.toHaveBeenCalled();
  });

  it("second trigger replaces first (latest wins)", async () => {
    const mut = vi.fn().mockResolvedValue("ok");
    const { result } = renderHook(() => useUndoableMutation(mut, 5000));
    act(() => result.current.trigger("a"));
    act(() => result.current.trigger("b"));
    await act(async () => {
      vi.advanceTimersByTime(5001);
      await Promise.resolve();
    });
    expect(mut).toHaveBeenCalledTimes(1);
    expect(mut).toHaveBeenCalledWith("b");
  });
});

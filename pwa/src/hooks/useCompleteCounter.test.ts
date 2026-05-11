import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCompleteCounter } from "./useCompleteCounter";

beforeEach(() => localStorage.clear());

describe("useCompleteCounter", () => {
  it("starts at 0", () => {
    const { result } = renderHook(() => useCompleteCounter());
    expect(result.current.count).toBe(0);
    expect(result.current.ready).toBe(false);
  });

  it("increment persists across hook re-runs", () => {
    const { result, rerender } = renderHook(() => useCompleteCounter());
    act(() => result.current.increment());
    act(() => result.current.increment());
    rerender();
    expect(result.current.count).toBe(2);
    expect(result.current.ready).toBe(true);
  });

  it("reset zeros the counter", () => {
    const { result } = renderHook(() => useCompleteCounter());
    act(() => result.current.increment());
    act(() => result.current.reset());
    expect(result.current.count).toBe(0);
  });
});

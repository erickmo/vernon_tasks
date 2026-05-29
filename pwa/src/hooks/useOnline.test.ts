import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOnline } from "./useOnline";

function setOnLine(value: boolean) {
  Object.defineProperty(navigator, "onLine", { value, configurable: true });
}

describe("useOnline", () => {
  it("returns initial navigator.onLine", () => {
    setOnLine(true);
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(true);
  });
  it("updates to false on offline event", () => {
    setOnLine(true);
    const { result } = renderHook(() => useOnline());
    act(() => { setOnLine(false); window.dispatchEvent(new Event("offline")); });
    expect(result.current).toBe(false);
  });
  it("updates to true on online event", () => {
    setOnLine(false);
    const { result } = renderHook(() => useOnline());
    act(() => { setOnLine(true); window.dispatchEvent(new Event("online")); });
    expect(result.current).toBe(true);
  });
});

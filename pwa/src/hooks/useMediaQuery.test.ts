import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeAll, vi } from "vitest";
import { useMediaQuery } from "./useMediaQuery";

describe("useMediaQuery", () => {
  let listeners: Map<string, EventListener>;

  beforeAll(() => {
    listeners = new Map();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn((query: string) => ({
        matches: false,
        media: query,
        addEventListener: (_: string, cb: EventListener) => {
          listeners.set(query, cb);
        },
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it("returns false when media does not match", () => {
    const { result } = renderHook(() => useMediaQuery(768));
    expect(result.current).toBe(false);
  });

  it("updates when media changes", () => {
    const { result } = renderHook(() => useMediaQuery(768));
    act(() => {
      const cb = listeners.get("(min-width: 768px)");
      cb?.({ matches: true } as MediaQueryListEvent);
    });
    expect(result.current).toBe(true);
  });

  it("returns true when matchMedia initially matches", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn((query: string) => ({
        matches: true,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    const { result } = renderHook(() => useMediaQuery(768));
    expect(result.current).toBe(true);
  });

  it("cleans up listener on unmount", () => {
    const removeEventListenerSpy = vi.fn();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: removeEventListenerSpy,
        dispatchEvent: vi.fn(),
      })),
    });
    const { unmount } = renderHook(() => useMediaQuery(768));
    unmount();
    expect(removeEventListenerSpy).toHaveBeenCalledWith("change", expect.any(Function));
  });
});

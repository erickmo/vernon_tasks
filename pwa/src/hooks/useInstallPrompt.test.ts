import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useInstallPrompt, detectPlatform } from "./useInstallPrompt";

beforeEach(() => localStorage.clear());

describe("detectPlatform", () => {
  it("identifies iOS Safari", () => {
    expect(
      detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15"),
    ).toBe("ios");
  });

  it("identifies Android Chrome", () => {
    expect(detectPlatform("Mozilla/5.0 (Linux; Android 13; Pixel 7) Chrome/120")).toBe(
      "android",
    );
  });

  it("falls back to other", () => {
    expect(detectPlatform("Mozilla/5.0 (X11; Linux x86_64) Firefox/120")).toBe("other");
  });
});

describe("useInstallPrompt", () => {
  it("captures beforeinstallprompt", () => {
    const { result } = renderHook(() => useInstallPrompt());
    const ev = new Event("beforeinstallprompt") as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: string }>;
    };
    ev.prompt = () => Promise.resolve();
    ev.userChoice = Promise.resolve({ outcome: "accepted" });
    act(() => {
      window.dispatchEvent(ev);
    });
    expect(result.current.deferred).not.toBeNull();
  });

  it("snooze persists future suppression", () => {
    const { result } = renderHook(() => useInstallPrompt());
    act(() => result.current.snooze());
    expect(result.current.suppressed).toBe(true);
  });
});

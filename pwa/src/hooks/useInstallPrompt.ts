import { useCallback, useEffect, useState } from "react";

const KEY_CHOICE = "vt_install_choice";
const KEY_SNOOZE_UNTIL = "vt_install_snooze_until";
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

export type Platform = "android" | "ios" | "other";
export type Choice = "accepted" | "dismissed" | null;

interface BIPEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function detectPlatform(ua: string = navigator.userAgent): Platform {
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "other";
}

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches;
}

function suppressedNow(): boolean {
  const choice = localStorage.getItem(KEY_CHOICE);
  if (choice === "accepted" || choice === "dismissed") return true;
  const until = Number(localStorage.getItem(KEY_SNOOZE_UNTIL) ?? "0");
  return until > Date.now();
}

export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [suppressed, setSuppressed] = useState<boolean>(() => suppressedNow());

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const prompt = useCallback(async (): Promise<Choice> => {
    if (!deferred) return null;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    localStorage.setItem(KEY_CHOICE, outcome);
    setSuppressed(true);
    setDeferred(null);
    return outcome;
  }, [deferred]);

  const snooze = useCallback(() => {
    localStorage.setItem(KEY_SNOOZE_UNTIL, String(Date.now() + SNOOZE_MS));
    setSuppressed(true);
  }, []);

  const dismissForever = useCallback(() => {
    localStorage.setItem(KEY_CHOICE, "dismissed");
    setSuppressed(true);
  }, []);

  const platform = detectPlatform();
  const canPrompt =
    !suppressed && !isStandalone() && (deferred !== null || platform === "ios");

  return { canPrompt, platform, deferred, prompt, snooze, dismissForever, suppressed };
}

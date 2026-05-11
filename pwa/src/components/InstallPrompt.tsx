import { useState } from "react";
import { useInstallPrompt } from "../hooks/useInstallPrompt";
import { IOSInstallModal } from "./IOSInstallModal";
import { logEvent } from "../telemetry";
import { t } from "../i18n";

export function InstallPrompt({ visible }: { visible: boolean }) {
  const { canPrompt, platform, prompt, snooze, dismissForever } = useInstallPrompt();
  const [iosOpen, setIosOpen] = useState(false);
  const [shownOnce, setShownOnce] = useState(false);

  if (!visible || !canPrompt) return null;
  if (!shownOnce) {
    logEvent("install_prompt_shown", { platform });
    setShownOnce(true);
  }

  async function onInstall() {
    if (platform === "ios") {
      setIosOpen(true);
      return;
    }
    const choice = await prompt();
    if (choice === "accepted") logEvent("install_accepted", { platform });
    else if (choice === "dismissed") logEvent("install_dismissed", { platform });
  }

  function onLater() {
    snooze();
    logEvent("install_snoozed", { platform });
  }

  function onClose() {
    dismissForever();
    logEvent("install_dismissed", { platform });
  }

  return (
    <>
      <div
        style={{
          position: "fixed",
          left: 12,
          right: 12,
          bottom: "calc(var(--bottom-nav-h) + var(--safe-bottom) + 12px)",
          background: "var(--vt-primary)",
          color: "var(--vt-primary-contrast)",
          padding: 16,
          borderRadius: "var(--vt-radius)",
          boxShadow: "var(--vt-shadow)",
          zIndex: 55,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12 }}>
          <div>
            <strong>{t("install.title")}</strong>
            <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>
              {t("install.body")}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="close"
            style={{ background: "transparent", border: 0, color: "inherit", fontSize: 18 }}
          >
            ×
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button
            onClick={onLater}
            style={{
              flex: 1,
              background: "transparent",
              border: "1px solid currentColor",
              color: "inherit",
              padding: 8,
              borderRadius: 8,
            }}
          >
            {t("install.later")}
          </button>
          <button
            onClick={onInstall}
            style={{
              flex: 1,
              background: "white",
              color: "var(--vt-primary)",
              border: 0,
              padding: 8,
              borderRadius: 8,
              fontWeight: 600,
            }}
          >
            {t("install.cta")}
          </button>
        </div>
      </div>
      <IOSInstallModal open={iosOpen} onClose={() => setIosOpen(false)} />
    </>
  );
}

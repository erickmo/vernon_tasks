import { usePush } from "../hooks/usePush";
import { logEvent } from "../telemetry";
import { useToast } from "./Toast";
import { t } from "../i18n";

function isIOS(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches;
}

export function PushToggle() {
  const { state, turnOn, turnOff } = usePush();
  const { show } = useToast();

  if (state === "unsupported") {
    return (
      <p style={{ color: "var(--vt-text-muted)", fontSize: 13, marginTop: 12 }}>
        {t("push.unsupported")}
      </p>
    );
  }

  async function onToggle(target: "on" | "off") {
    logEvent("push_subscribe_attempt", { target });
    try {
      if (target === "on") {
        await turnOn();
        logEvent("push_subscribed", {});
      } else {
        await turnOff();
        logEvent("push_unsubscribed", {});
      }
    } catch {
      show(t("push.failed"));
    }
  }

  const iosHint = isIOS() && !isStandalone();

  return (
    <div
      style={{
        padding: "var(--vt-space-4)",
        background: "var(--vt-surface)",
        borderRadius: "var(--vt-radius)",
        marginTop: "var(--vt-space-3)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{t("push.title")}</div>
          <div
            style={{
              fontSize: 13,
              color: "var(--vt-text-muted)",
              marginTop: 4,
            }}
          >
            {state === "on"
              ? t("push.status_on")
              : state === "denied"
                ? t("push.status_denied")
                : t("push.status_off")}
          </div>
        </div>
        {state !== "denied" && state !== "loading" && (
          <button
            onClick={() => onToggle(state === "on" ? "off" : "on")}
            style={{
              padding: "8px 14px",
              borderRadius: 999,
              border: 0,
              background: state === "on" ? "var(--vt-text-muted)" : "var(--vt-primary)",
              color: "white",
              fontWeight: 600,
            }}
          >
            {state === "on" ? t("push.turn_off") : t("push.turn_on")}
          </button>
        )}
      </div>
      {iosHint && (
        <p style={{ marginTop: 12, fontSize: 12, color: "var(--vt-warn)" }}>
          {t("push.ios_hint")}
        </p>
      )}
    </div>
  );
}

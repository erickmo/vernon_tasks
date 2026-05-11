import { t } from "../i18n";

interface Props {
  onComplete: () => void;
  onLog: () => void;
  onSnooze: () => void;
  disabled?: boolean;
}

const BTN_STYLE: React.CSSProperties = {
  flex: 1,
  border: 0,
  color: "white",
  fontSize: 13,
  fontWeight: 600,
};

export function TaskActions({ onComplete, onLog, onSnooze, disabled }: Props) {
  return (
    <div style={{ display: "flex", width: "100%" }}>
      <button
        onClick={onComplete}
        disabled={disabled}
        style={{ ...BTN_STYLE, background: "var(--vt-success)" }}
      >
        {t("actions.complete")}
      </button>
      <button
        onClick={onLog}
        disabled={disabled}
        style={{ ...BTN_STYLE, background: "var(--vt-primary)" }}
      >
        {t("actions.log")}
      </button>
      <button
        onClick={onSnooze}
        disabled={disabled}
        style={{ ...BTN_STYLE, background: "var(--vt-warn)" }}
      >
        {t("actions.snooze")}
      </button>
    </div>
  );
}

import { useState } from "react";
import { t } from "../i18n";

interface Props {
  open: boolean;
  taskTitle?: string;
  onSubmit: (reason: string) => void;
  onCancel: () => void;
}

const MIN_REASON = 5;

export function RejectModal({ open, taskTitle, onSubmit, onCancel }: Props) {
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);

  if (!open) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = reason.trim();
    if (trimmed.length < MIN_REASON) {
      setErr(t("reject.too_short"));
      return;
    }
    onSubmit(trimmed);
    setReason("");
    setErr(null);
  }

  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "grid",
        placeItems: "end center",
        zIndex: 100,
        paddingBottom: "calc(var(--bottom-nav-h) + var(--safe-bottom))",
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        style={{
          background: "var(--vt-bg)",
          color: "var(--vt-text)",
          width: "100%",
          maxWidth: 480,
          padding: 24,
          borderRadius: "16px 16px 0 0",
        }}
      >
        <h3 style={{ marginTop: 0 }}>{t("reject.title")}</h3>
        {taskTitle && (
          <p style={{ fontSize: 13, color: "var(--vt-text-muted)" }}>{taskTitle}</p>
        )}
        <p style={{ fontSize: 13, color: "var(--vt-text-muted)" }}>{t("reject.body")}</p>
        <textarea
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          placeholder={t("reject.placeholder")}
          style={{ width: "100%", padding: 12, marginTop: 4, fontSize: 14 }}
        />
        {err && <p style={{ color: "var(--vt-danger)", fontSize: 13 }}>{err}</p>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <button type="button" onClick={onCancel}>
            {t("reject.cancel")}
          </button>
          <button
            type="submit"
            style={{
              background: "var(--vt-danger)",
              color: "white",
              border: 0,
              padding: "10px 16px",
              borderRadius: "var(--vt-radius)",
              fontWeight: 600,
            }}
          >
            {t("reject.submit")}
          </button>
        </div>
      </form>
    </div>
  );
}

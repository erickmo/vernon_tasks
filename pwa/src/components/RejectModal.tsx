import { useState } from "react";
import { t } from "../i18n";
import { Modal } from "./ui/Modal";

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
    <Modal open={open} onClose={onCancel} variant="sheet" zIndex={100} labelledBy="reject-title">
      <div style={{ maxWidth: 480, margin: "0 auto", padding: 24 }}>
        <h3 id="reject-title" style={{ marginTop: 0 }}>{t("reject.title")}</h3>
        {taskTitle && (
          <p style={{ fontSize: 13, color: "var(--vt-text-muted)" }}>{taskTitle}</p>
        )}
        <p style={{ fontSize: 13, color: "var(--vt-text-muted)" }}>{t("reject.body")}</p>
        <form onSubmit={submit}>
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
    </Modal>
  );
}

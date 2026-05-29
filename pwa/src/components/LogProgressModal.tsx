import { useState } from "react";
import { t } from "../i18n";
import { Modal } from "./ui/Modal";

interface Props {
  open: boolean;
  onSubmit: (hours: number, note: string) => void;
  onCancel: () => void;
}

const MIN = 0.25;
const MAX = 8;

export function LogProgressModal({ open, onSubmit, onCancel }: Props) {
  const [hours, setHours] = useState("1");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const h = Number(hours);
    if (!Number.isFinite(h) || h < MIN || h > MAX) {
      setErr(`${MIN}–${MAX}`);
      return;
    }
    onSubmit(h, note.trim());
  }

  return (
    <Modal open={open} onClose={onCancel} variant="sheet" zIndex={100} labelledBy="logprogress-title">
      <div style={{ maxWidth: 480, margin: "0 auto", padding: 24 }}>
        <h3 id="logprogress-title" style={{ marginTop: 0 }}>{t("log.title")}</h3>
        <form onSubmit={submit}>
          <label style={{ display: "block", marginBottom: 12 }}>
            {t("log.hours")}
            <input
              type="number"
              step={0.25}
              min={MIN}
              max={MAX}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              autoFocus
              required
              style={{ display: "block", width: "100%", padding: 12, marginTop: 4 }}
            />
          </label>
          <label style={{ display: "block", marginBottom: 12 }}>
            {t("log.note")}
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              style={{ display: "block", width: "100%", padding: 12, marginTop: 4 }}
            />
          </label>
          {err && <p style={{ color: "var(--vt-danger)" }}>{err}</p>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" onClick={onCancel}>
              {t("log.cancel")}
            </button>
            <button type="submit">{t("log.submit")}</button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

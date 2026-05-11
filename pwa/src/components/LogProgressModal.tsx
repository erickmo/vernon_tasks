import { useState } from "react";
import { t } from "../i18n";

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

  if (!open) return null;

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
        <h3 style={{ marginTop: 0 }}>{t("log.title")}</h3>
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
  );
}

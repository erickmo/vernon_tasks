import { useState } from "react";
import { login } from "../auth/session";
import { t } from "../i18n";
import { Modal } from "./ui/Modal";

interface Props {
  open: boolean;
  onResolve: (ok: boolean) => void;
}

export function ReloginModal({ open, onResolve }: Props) {
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const usr = localStorage.getItem("vt_last_user") ?? "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const s = await login(usr, pwd);
      if (!s.user) throw new Error();
      onResolve(true);
    } catch {
      setErr(t("login.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={() => onResolve(false)} variant="center" zIndex={100} busy={busy} labelledBy="relogin-title">
      <form
        onSubmit={submit}
        style={{
          background: "var(--vt-bg)",
          color: "var(--vt-text)",
          padding: 24,
          borderRadius: 16,
          maxWidth: 420,
          width: "100%",
        }}
      >
        <h3 id="relogin-title" style={{ marginTop: 0 }}>{t("relogin.title")}</h3>
        <p style={{ color: "var(--vt-text-muted)" }}>{t("relogin.body")}</p>
        <p style={{ fontSize: 13 }}>{usr}</p>
        <input
          type="password"
          autoFocus
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          required
          style={{ width: "100%", padding: 12, marginBottom: 12 }}
        />
        {err && <p style={{ color: "var(--vt-danger)" }}>{err}</p>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={() => onResolve(false)} disabled={busy}>
            {t("logout")}
          </button>
          <button type="submit" disabled={busy}>
            {busy ? t("common.loading") : t("login.submit")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

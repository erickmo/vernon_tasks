import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { login } from "./session";
import { t } from "../i18n";

export function LoginPage() {
  const [usr, setUsr] = useState(() => localStorage.getItem("vt_last_user") ?? "");
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") ?? "/m/work";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const s = await login(usr, pwd);
      if (!s.user) throw new Error("guest");
      localStorage.setItem("vt_last_user", usr);
      nav(next, { replace: true });
    } catch {
      setErr(t("login.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: "var(--vt-space-5)", maxWidth: 420, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0 }}>{t("login.title")}</h1>
      <form onSubmit={onSubmit}>
        <label style={{ display: "block", marginBottom: "var(--vt-space-3)" }}>
          {t("login.username")}
          <input
            value={usr}
            onChange={(e) => setUsr(e.target.value)}
            autoComplete="username"
            required
            style={{ display: "block", width: "100%", padding: "var(--vt-space-3)", marginTop: 4 }}
          />
        </label>
        <label style={{ display: "block", marginBottom: "var(--vt-space-4)" }}>
          {t("login.password")}
          <input
            type="password"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            autoComplete="current-password"
            required
            style={{ display: "block", width: "100%", padding: "var(--vt-space-3)", marginTop: 4 }}
          />
        </label>
        {err && <p style={{ color: "var(--vt-danger)" }}>{err}</p>}
        <button disabled={busy} type="submit" style={{ width: "100%", padding: "var(--vt-space-3)" }}>
          {busy ? t("common.loading") : t("login.submit")}
        </button>
      </form>
    </div>
  );
}

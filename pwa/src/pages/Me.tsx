import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { logout, probeSession } from "../auth/session";
import { t } from "../i18n";

export function MePage() {
  const [user, setUser] = useState<string | null>(null);
  const nav = useNavigate();

  useEffect(() => {
    probeSession().then((s) => setUser(s.user));
  }, []);

  async function doLogout() {
    await logout();
    nav("/m/login", { replace: true });
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>{t("nav.me")}</h1>
      <p style={{ color: "var(--vt-text-muted)" }}>{user ?? "—"}</p>
      <button onClick={doLogout} style={{ marginTop: 24, padding: 12 }}>
        {t("logout")}
      </button>
    </div>
  );
}

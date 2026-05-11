import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { logout, probeSession } from "../auth/session";
import { useUnreadCount } from "../hooks/useUnreadCount";
import { t } from "../i18n";

export function MePage() {
  const [user, setUser] = useState<string | null>(null);
  const nav = useNavigate();
  const unread = useUnreadCount();

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

      <Link
        to="/m/me/notifications"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "var(--vt-space-4)",
          marginTop: "var(--vt-space-4)",
          background: "var(--vt-surface)",
          borderRadius: "var(--vt-radius)",
          color: "var(--vt-text)",
          textDecoration: "none",
        }}
      >
        <span>{t("notif.link")}</span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            color: "var(--vt-text-muted)",
          }}
        >
          {unread.data && unread.data > 0 ? (
            <span
              style={{
                background: "var(--vt-danger)",
                color: "white",
                fontSize: 12,
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: 999,
              }}
            >
              {unread.data}
            </span>
          ) : null}
          →
        </span>
      </Link>

      <button onClick={doLogout} style={{ marginTop: 24, padding: 12 }}>
        {t("logout")}
      </button>
    </div>
  );
}

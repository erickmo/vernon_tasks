import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { logout, probeSession } from "../auth/session";
import { useUnreadCount } from "../hooks/useUnreadCount";
import { PushToggle } from "../components/PushToggle";
import { t } from "../i18n";

function getInitials(name: string | null): string {
  if (!name) return "?";
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

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
    <div style={{ background: "var(--vt-primary-light)", minHeight: "100%" }}>
      {/* Sticky gradient header */}
      <header
        style={{
          background: "var(--vt-primary-light)",
          padding: "var(--vt-space-4)",
          position: "sticky",
          top: 0,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        {/* Avatar circle */}
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "rgba(149,97,171,0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 22,
            fontWeight: 700,
            color: "var(--vt-primary-dark)",
            flexShrink: 0,
            border: "2px solid var(--vt-primary)",
          }}
        >
          {getInitials(user)}
        </div>
        <div>
          <div style={{ color: "var(--vt-primary-dark)", fontWeight: 700, fontSize: 18 }}>
            {user ?? "—"}
          </div>
          <div style={{ color: "var(--vt-text-muted)", fontSize: 13 }}>
            Akun
          </div>
        </div>
      </header>

      {/* Content */}
      <div style={{ padding: "var(--vt-space-4)" }}>
        {/* Settings card */}
        <div
          style={{
            background: "white",
            borderRadius: "var(--vt-radius)",
            boxShadow: "0 1px 6px rgba(149,97,171,0.08)",
            overflow: "hidden",
            marginBottom: "var(--vt-space-4)",
          }}
        >
          {/* Section label */}
          <div
            style={{
              padding: "var(--vt-space-2) var(--vt-space-4)",
              fontSize: 11,
              fontWeight: 700,
              color: "var(--vt-primary)",
              textTransform: "uppercase",
              letterSpacing: 0.8,
              borderBottom: "1px solid var(--vt-border)",
            }}
          >
            Notifikasi
          </div>

          {/* Notification link row */}
          <Link
            to="/m/me/notifications"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "var(--vt-space-4)",
              borderBottom: "1px solid var(--vt-border)",
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

          {/* PushToggle row */}
          <div style={{ padding: "var(--vt-space-4)" }}>
            <PushToggle />
          </div>
        </div>

        {/* Logout button */}
        <button
          onClick={doLogout}
          style={{
            width: "100%",
            padding: "var(--vt-space-4)",
            background: "white",
            color: "var(--vt-danger)",
            border: "1px solid var(--vt-danger)",
            borderRadius: "var(--vt-radius)",
            fontWeight: 600,
            fontSize: 15,
            cursor: "pointer",
          }}
        >
          {t("logout")}
        </button>
      </div>
    </div>
  );
}

import { NavLink } from "react-router-dom";
import { t } from "../i18n";
import { useUnreadCount } from "../hooks/useUnreadCount";

const TABS = [
  { to: "/m/work", label: t("nav.tasks"), key: "tasks" },
  { to: "/m/dashboard", label: t("nav.dashboard"), key: "dashboard" },
  { to: "/m/analytics", label: t("nav.analytics"), key: "analytics" },
  { to: "/m/me", label: t("nav.me"), key: "me" },
] as const;

export function BottomNav() {
  const unread = useUnreadCount();

  return (
    <nav
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        height: "calc(var(--bottom-nav-h) + var(--safe-bottom))",
        paddingBottom: "var(--safe-bottom)",
        background: "var(--vt-bg)",
        borderTop: "1px solid var(--vt-border)",
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        zIndex: 40,
      }}
    >
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          style={({ isActive }) => ({
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: isActive ? "var(--vt-primary)" : "var(--vt-text-muted)",
            textDecoration: "none",
            fontSize: 13,
            fontWeight: 600,
            position: "relative",
          })}
        >
          <span style={{ position: "relative" }}>
            {tab.label}
            {tab.key === "me" && unread.data && unread.data > 0 ? (
              <span
                aria-label={`${unread.data} unread`}
                style={{
                  position: "absolute",
                  top: -4,
                  right: -10,
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "var(--vt-danger)",
                }}
              />
            ) : null}
          </span>
        </NavLink>
      ))}
    </nav>
  );
}

import { NavLink } from "react-router-dom";
import { t } from "../i18n";
import { useUnreadCount } from "../hooks/useUnreadCount";
import { useIsLeader } from "../hooks/useIsLeader";
import { Badge } from "./ui/Badge";

const TABS_BASE = [
  { to: "/m/project", label: t("nav.tasks"), key: "tasks" },
  { to: "/m/dashboard", label: t("nav.dashboard"), key: "dashboard" },
  { to: "/m/reports", label: t("nav.reports"), key: "reports" },
  { to: "/m/me", label: t("nav.me"), key: "me" },
] as const;

const LEADER_TAB = { to: "/m/leader", label: t("nav.leader"), key: "leader" } as const;

export function BottomNav() {
  const unread = useUnreadCount();
  const isLeader = useIsLeader();
  const tabs = isLeader ? [...TABS_BASE, LEADER_TAB] : TABS_BASE;

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
        gridTemplateColumns: `repeat(${tabs.length}, 1fr)`,
        zIndex: 40,
      }}
    >
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          style={({ isActive }) => ({
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: isActive ? "var(--vt-primary)" : "var(--vt-text-muted)",
            textDecoration: "none",
            fontSize: 12,
            fontWeight: 600,
            minHeight: 48,
            position: "relative",
          })}
        >
          <span style={{ position: "relative" }}>
            {tab.label}
            {tab.key === "me" && unread.data && unread.data > 0 ? (
              <span style={{ position: "absolute", top: -4, right: -10 }}>
                <Badge variant="dot" ariaLabel={`${unread.data} unread`} />
              </span>
            ) : null}
          </span>
        </NavLink>
      ))}
    </nav>
  );
}

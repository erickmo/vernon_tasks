import { NavLink, useLocation, useSearchParams, useNavigate } from "react-router-dom";
import { useIsLeader } from "../hooks/useIsLeader";
import { useUnreadCount } from "../hooks/useUnreadCount";

const NAV1_BASE = [
  { to: "/m/dashboard", label: "Dashboard", key: "dashboard" },
  { to: "/m/leader",    label: "Leader",    key: "leader",  leaderOnly: true },
  { to: "/m/work",      label: "Work",      key: "work" },
  { to: "/m/analytics", label: "Analytics", key: "analytics" },
  { to: "/m/me",        label: "Me",        key: "me" },
] as const;

type Nav1Key = typeof NAV1_BASE[number]["key"];

const NAV2: Partial<Record<Nav1Key, { label: string; tab: string }[]>> = {
  analytics: [
    { label: "Leaderboard", tab: "leaderboard" },
    { label: "Velocity",    tab: "velocity" },
    { label: "Streak",      tab: "streak" },
  ],
  leader: [
    { label: "Review Queue", tab: "review" },
    { label: "Sprint",       tab: "sprint" },
    { label: "Executive",    tab: "exec" },
  ],
  me: [
    { label: "Profile",       tab: "profile" },
    { label: "Notifications", tab: "notifications" },
    { label: "Push Settings", tab: "push" },
  ],
};

const ME_TAB_ROUTES: Record<string, string> = {
  profile:       "/m/me",
  notifications: "/m/me/notifications",
  push:          "/m/me/notifications/settings",
};

export function TopNav() {
  const isLeader = useIsLeader();
  const unread = useUnreadCount();
  const loc = useLocation();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  const activeKey = (NAV1_BASE.find((n) => {
    if (n.key === "me") return loc.pathname.startsWith("/m/me");
    if (n.key === "leader") return loc.pathname.startsWith("/m/leader");
    return loc.pathname.startsWith(n.to);
  })?.key ?? "dashboard") as Nav1Key;

  const submenus = NAV2[activeKey] ?? [];
  const activeTab = params.get("tab") ?? submenus[0]?.tab ?? "";

  const nav1Items = NAV1_BASE.filter((n) =>
    "leaderOnly" in n && n.leaderOnly ? isLeader === true : true
  );

  function handleNav2Click(item: { label: string; tab: string }) {
    if (activeKey === "me") {
      const route = ME_TAB_ROUTES[item.tab];
      if (route) navigate(route);
    } else {
      setParams({ tab: item.tab }, { replace: true });
    }
  }

  return (
    <>
      <nav
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: "var(--top-nav1-h)",
          background: "#08010f",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          alignItems: "center",
          zIndex: 50,
        }}
      >
        <span
          style={{
            padding: "0 24px",
            fontSize: 16,
            fontWeight: 800,
            color: "#a855f7",
            letterSpacing: "-0.02em",
            whiteSpace: "nowrap",
            userSelect: "none",
          }}
        >
          ◆ Vernon
        </span>

        <div style={{ display: "flex", alignItems: "center", height: "100%", gap: 2 }}>
          {nav1Items.map((item) => {
            const isActive =
              item.key === "me"
                ? loc.pathname.startsWith("/m/me")
                : item.key === "leader"
                ? loc.pathname.startsWith("/m/leader")
                : loc.pathname.startsWith(item.to);

            return (
              <NavLink
                key={item.key}
                to={item.to}
                style={{
                  display: "flex",
                  alignItems: "center",
                  height: "100%",
                  padding: "0 14px",
                  fontSize: 14,
                  fontWeight: 600,
                  color: isActive ? "#a855f7" : "rgba(255,255,255,0.45)",
                  textDecoration: "none",
                  position: "relative",
                  borderBottom: isActive ? "2px solid #a855f7" : "2px solid transparent",
                  transition: "color 0.15s, border-color 0.15s",
                  boxSizing: "border-box",
                }}
              >
                {item.label}
                {item.key === "me" && unread.data && unread.data > 0 ? (
                  <span
                    style={{
                      position: "absolute",
                      top: 8,
                      right: 4,
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "#ffffff",
                      boxShadow: "0 0 0 2px #08010f",
                    }}
                  />
                ) : null}
              </NavLink>
            );
          })}
        </div>
      </nav>

      <div
        style={{
          position: "fixed",
          top: "var(--top-nav1-h)",
          left: 0,
          right: 0,
          height: "var(--top-nav2-h)",
          background: "rgba(255,255,255,0.03)",
          borderBottom: submenus.length > 0 ? "1px solid rgba(255,255,255,0.06)" : "none",
          display: "flex",
          alignItems: "center",
          zIndex: 49,
          padding: "0 16px",
          gap: 4,
          visibility: submenus.length > 0 ? "visible" : "hidden",
          pointerEvents: submenus.length > 0 ? "auto" : "none",
        }}
      >
        {submenus.map((item) => (
          <button
            key={item.tab}
            onClick={() => handleNav2Click(item)}
            style={{
              padding: "4px 12px",
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 999,
              border: "none",
              cursor: "pointer",
              background: activeTab === item.tab ? "rgba(168,85,247,0.18)" : "transparent",
              color: activeTab === item.tab ? "#a855f7" : "rgba(255,255,255,0.45)",
              transition: "background 0.15s, color 0.15s",
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  );
}

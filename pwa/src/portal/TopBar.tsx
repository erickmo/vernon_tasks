import { NavLink, Link } from "react-router-dom";
import * as permsHook from "../auth/usePermissions";
import * as telemetry from "../telemetry";
import { portalNav, filterNavByPermissions } from "./nav";
import { NotificationsFeatureGate } from "./notifications/NotificationsFeatureGate";
import { NotificationBell } from "./notifications/NotificationBell";
import { useNotificationCount } from "./notifications/hooks/useNotificationCount";
import { Badge } from "../components/ui/Badge";

const NOTIFICATIONS_NAV_KEY = "notifications";

function NavBadge() {
  const { data: count = 0 } = useNotificationCount();
  return <Badge variant="count" count={count} tone="danger" ariaLabel={`${count} unread notifications`} />;
}

export function TopBar() {
  const { hasPermission } = permsHook.usePermissions();
  const items = filterNavByPermissions(portalNav, hasPermission);

  return (
    <header className="portal-topbar" role="banner">
      <Link to="/portal" className="portal-topbar__logo">Vernon</Link>
      <nav className="portal-topbar__nav" aria-label="Primary">
        {items.map((it) => (
          <NavLink
            key={it.key}
            to={it.path}
            end={it.path === "/portal"}
            onClick={() => telemetry.trackPortalNavClick(it.key, it.path)}
          >
            {it.label}
            {it.key === NOTIFICATIONS_NAV_KEY && (
              <NotificationsFeatureGate>
                <NavBadge />
              </NotificationsFeatureGate>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="portal-topbar__spacer" />
      <button type="button" className="portal-topbar__search" aria-label="Search">⌘K</button>
      <NotificationsFeatureGate>
        <NotificationBell />
      </NotificationsFeatureGate>
      <button type="button" className="portal-topbar__profile" aria-label="Profile">👤</button>
    </header>
  );
}

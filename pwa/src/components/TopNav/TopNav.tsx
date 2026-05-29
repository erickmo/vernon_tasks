import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useUnreadCount } from "../../hooks/useUnreadCount";
import { getBreadcrumb, NAV2_ITEMS } from "./breadcrumb";
import { LogoMark } from "./icons";
import { NotificationDropdown } from "./NotificationDropdown";
import { AvatarDropdown } from "./AvatarDropdown";

// ── TopNav ─────────────────────────────────────────────────────────────────────
export function TopNav() {
  const loc = useLocation();
  const { data: unread = 0 } = useUnreadCount();

  const [username, setUsername] = useState<string | null>(
    (window as unknown as { frappe?: { session?: { user?: string } } }).frappe?.session?.user ?? null
  );

  useEffect(() => {
    if (username) return;
    import("../../auth/session").then(({ probeSession }) =>
      probeSession()
        .then((s) => { if (s.user) setUsername(s.user); })
        .catch(() => { /* session unavailable */ })
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- one-shot mount fetch, guarded by if (username) return

  const breadcrumb = getBreadcrumb(loc.pathname);

  return (
    <>
      {/* ── Navbar1 ── */}
      <header style={{
        position: "fixed", top: 0, left: 0, right: 0,
        height: "var(--top-nav1-h)",
        background: "var(--vt-nav-bg)",
        borderBottom: `1px solid var(--vt-nav-border)`,
        display: "flex", alignItems: "center",
        zIndex: 50,
        padding: "0 20px",
        gap: 0,
      }}>

        {/* Logo: mark + wordmark */}
        <Link to="/m/dashboard" style={{
          display: "flex", alignItems: "center", gap: 8,
          textDecoration: "none", flexShrink: 0,
          userSelect: "none",
        }}>
          <LogoMark />
          <span style={{
            fontSize: 14,
            fontWeight: 700,
            color: "var(--vt-nav-text)",
            letterSpacing: "-0.02em",
            fontFamily: "'Outfit', system-ui, sans-serif",
          }}>
            Vernon
          </span>
        </Link>

        {/* Divider */}
        <div aria-hidden style={{
          width: 1, height: 16,
          background: "var(--vt-nav-border)",
          margin: "0 14px",
          flexShrink: 0,
        }} />

        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            fontSize: 13, fontWeight: 400,
            color: "var(--vt-nav-muted)",
          }}>
            Vernon
          </span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="var(--vt-nav-muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span style={{
            fontSize: 13, fontWeight: 600,
            color: "var(--vt-nav-text)",
          }}>
            {breadcrumb}
          </span>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Right actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <NotificationDropdown unread={unread} />
          <AvatarDropdown username={username} />
        </div>
      </header>

      {/* ── Navbar2 ── */}
      <nav aria-label="Main menu" style={{
        position: "fixed",
        top: "var(--top-nav1-h)",
        left: 0, right: 0,
        height: "var(--top-nav2-h)",
        background: "var(--vt-nav-bg)",
        borderBottom: `1px solid var(--vt-nav-border)`,
        display: "flex", alignItems: "center",
        zIndex: 49,
        padding: "0 20px",
        gap: 2,
        overflowX: "auto",
        scrollbarWidth: "none",
      }}>
        {NAV2_ITEMS.map((item) => {
          const isActive = loc.pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              style={{
                display: "inline-flex", alignItems: "center",
                padding: "3px 10px",
                fontSize: 12, fontWeight: isActive ? 600 : 500,
                color: isActive ? "var(--vt-nav-text)" : "var(--vt-nav-muted)",
                textDecoration: "none",
                borderRadius: 6,
                background: isActive ? "var(--vt-nav-active)" : "transparent",
                border: isActive ? `1px solid var(--vt-nav-border)` : "1px solid transparent",
                transition: "all 0.15s",
                whiteSpace: "nowrap", flexShrink: 0,
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

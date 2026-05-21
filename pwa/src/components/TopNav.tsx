import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { logout } from "../auth/session";
import { useUnreadCount } from "../hooks/useUnreadCount";

// ── Constants ──────────────────────────────────────────────────────────────────
const NAV2_BG    = "#f1f5f9";
const PRIMARY    = "var(--vt-primary)";
const TEXT_MUTED = "var(--vt-text-muted)";
const BORDER     = "var(--vt-border)";

const BREADCRUMB_MAP: { prefix: string; label: string }[] = [
  { prefix: "/m/dashboard", label: "Dashboard" },
  { prefix: "/m/work",      label: "Work" },
  { prefix: "/m/analytics", label: "Analytics" },
  { prefix: "/m/leader",    label: "Leader" },
  { prefix: "/m/me",        label: "Me" },
];

function getBreadcrumb(pathname: string): string {
  const match = BREADCRUMB_MAP.find((r) => pathname.startsWith(r.prefix));
  return match?.label ?? "Vernon";
}

const NAV2_ITEMS = [
  { label: "Dashboard", to: "/m/dashboard" },
  { label: "Project",   to: "/m/work" },
  { label: "Report",    to: "/m/analytics" },
] as const;

// ── SVG icons ─────────────────────────────────────────────────────────────────
function IconBell({ size = 18, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function IconUser({ size = 18, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

// ── NotificationButton ─────────────────────────────────────────────────────────
function NotificationButton({
  unread,
  onNavigate,
}: {
  unread: number;
  onNavigate: () => void;
}) {
  return (
    <button
      onClick={onNavigate}
      aria-label={unread > 0 ? `${unread} notifikasi belum dibaca` : "Notifikasi"}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 34,
        height: 34,
        border: "none",
        background: "transparent",
        borderRadius: 8,
        cursor: "pointer",
        color: TEXT_MUTED,
        transition: "background 0.13s, color 0.13s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "var(--vt-primary-light)";
        (e.currentTarget as HTMLButtonElement).style.color = PRIMARY;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
        (e.currentTarget as HTMLButtonElement).style.color = TEXT_MUTED;
      }}
    >
      <IconBell />
      {unread > 0 && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: 5,
            right: 5,
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#ef4444",
            boxShadow: "0 0 0 2px var(--vt-bg)",
          }}
        />
      )}
    </button>
  );
}

// ── AvatarDropdown ─────────────────────────────────────────────────────────────
function AvatarDropdown({ username }: { username: string | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const nav = useNavigate();

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  async function handleLogout() {
    setOpen(false);
    await logout();
    nav("/m/login", { replace: true });
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Menu akun"
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 34,
          height: 34,
          border: "none",
          background: open ? "var(--vt-primary-light)" : "transparent",
          borderRadius: 8,
          cursor: "pointer",
          color: open ? PRIMARY : TEXT_MUTED,
          transition: "background 0.13s, color 0.13s",
        }}
      >
        <IconUser />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 160,
            background: "var(--vt-bg)",
            border: `1px solid ${BORDER}`,
            borderRadius: 8,
            boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
            zIndex: 200,
            overflow: "hidden",
          }}
        >
          {username && (
            <div
              style={{
                padding: "10px 14px 8px",
                fontSize: 11,
                color: TEXT_MUTED,
                borderBottom: `1px solid ${BORDER}`,
                fontWeight: 500,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {username}
            </div>
          )}
          <Link
            to="/m/me"
            onClick={() => setOpen(false)}
            style={{
              display: "block",
              padding: "9px 14px",
              fontSize: 13,
              color: "var(--vt-text)",
              textDecoration: "none",
              transition: "background 0.12s",
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLAnchorElement).style.background =
                "var(--vt-primary-light)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLAnchorElement).style.background = "transparent")
            }
          >
            Profil
          </Link>
          <button
            onClick={handleLogout}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "9px 14px",
              fontSize: 13,
              color: "#dc2626",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              borderTop: `1px solid ${BORDER}`,
              transition: "background 0.12s",
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.background = "#fef2f2")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.background = "transparent")
            }
          >
            Keluar
          </button>
        </div>
      )}
    </div>
  );
}

// ── TopNav ─────────────────────────────────────────────────────────────────────
export function TopNav() {
  const loc = useLocation();
  const nav = useNavigate();
  const { data: unread = 0 } = useUnreadCount();

  const [username, setUsername] = useState<string | null>(
    (window as unknown as { frappe_user?: string }).frappe_user ?? null
  );

  useEffect(() => {
    if (username) return;
    import("../auth/session").then(({ probeSession }) =>
      probeSession().then((s) => setUsername(s.user))
    );
  }, []);

  const breadcrumb = getBreadcrumb(loc.pathname);

  return (
    <>
      {/* ── Navbar1 (44px sticky) ── */}
      <header
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: "var(--top-nav1-h)",
          background: "var(--vt-bg)",
          borderBottom: `1px solid ${BORDER}`,
          display: "flex",
          alignItems: "center",
          zIndex: 50,
          padding: "0 20px",
        }}
      >
        {/* Logo */}
        <Link
          to="/m/dashboard"
          style={{
            fontFamily: "'Barlow Condensed', 'Outfit', system-ui, sans-serif",
            fontSize: 17,
            fontWeight: 900,
            color: PRIMARY,
            textDecoration: "none",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            flexShrink: 0,
            userSelect: "none",
          }}
        >
          Vernon
        </Link>

        {/* Divider */}
        <div
          aria-hidden
          style={{
            width: 1,
            height: 18,
            background: BORDER,
            margin: "0 14px",
            flexShrink: 0,
          }}
        />

        {/* Breadcrumb */}
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--vt-text)" }}>
          {breadcrumb}
        </span>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Notification bell */}
        <NotificationButton
          unread={unread}
          onNavigate={() => nav("/m/me/notifications")}
        />

        {/* Avatar dropdown */}
        <AvatarDropdown username={username} />
      </header>

      {/* ── Navbar2 (36px sticky below navbar1) ── */}
      <nav
        aria-label="Main menu"
        style={{
          position: "fixed",
          top: "var(--top-nav1-h)",
          left: 0,
          right: 0,
          height: "var(--top-nav2-h)",
          background: NAV2_BG,
          borderBottom: `1px solid ${BORDER}`,
          display: "flex",
          alignItems: "center",
          zIndex: 49,
          padding: "0 20px",
          gap: 4,
          overflowX: "auto",
          scrollbarWidth: "none",
        }}
      >
        {NAV2_ITEMS.map((item) => {
          const isActive = loc.pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              style={{
                display: "flex",
                alignItems: "center",
                height: "100%",
                padding: "0 12px",
                fontSize: 13,
                fontWeight: isActive ? 600 : 500,
                color: isActive ? "var(--vt-text)" : TEXT_MUTED,
                textDecoration: "none",
                borderBottom: isActive ? `2px solid ${PRIMARY}` : "2px solid transparent",
                transition: "color 0.14s, border-color 0.14s",
                whiteSpace: "nowrap",
                flexShrink: 0,
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

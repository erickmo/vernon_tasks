import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { logout } from "../auth/session";
import { useUnreadCount } from "../hooks/useUnreadCount";

// ── Design tokens ──────────────────────────────────────────────────────────────
const C_BG        = "#ffffff";
const C_SURFACE   = "#fafafa";
const C_BORDER    = "rgba(0,0,0,0.07)";
const C_TEXT      = "#0a0a0a";
const C_MUTED     = "#6b7280";
const C_PRIMARY   = "#7c4dab";
const C_PRIMARY_L = "#f3eeff";
const C_DANGER    = "#dc2626";
const C_DANGER_L  = "#fef2f2";
const SHADOW_SM   = "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)";
const SHADOW_MD   = "0 4px 16px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)";

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

// ── Helpers ────────────────────────────────────────────────────────────────────
function getInitials(username: string | null): string {
  if (!username) return "?";
  const local = username.split("@")[0];
  const parts = local.split(/[._-]/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

function getAvatarColor(username: string | null): string {
  if (!username) return C_PRIMARY;
  const colors = ["#7c4dab","#0ea5e9","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4"];
  let h = 0;
  for (let i = 0; i < username.length; i++) h = username.charCodeAt(i) + ((h << 5) - h);
  return colors[Math.abs(h) % colors.length];
}

// ── SVG icons ─────────────────────────────────────────────────────────────────
function IconBell({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function IconChevron({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// ── Logo mark ──────────────────────────────────────────────────────────────────
function LogoMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
      <rect width="22" height="22" rx="6" fill={C_PRIMARY} />
      <path d="M6 6l5 10 5-10" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── NotificationButton ─────────────────────────────────────────────────────────
function NotificationButton({ unread, onNavigate }: { unread: number; onNavigate: () => void }) {
  const [hovered, setHovered] = useState(false);
  const badgeCount = unread > 99 ? "99+" : unread > 0 ? String(unread) : null;
  return (
    <button
      onClick={onNavigate}
      aria-label={unread > 0 ? `${unread} notifikasi belum dibaca` : "Notifikasi"}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 32, height: 32,
        border: `1px solid ${hovered ? "rgba(0,0,0,0.12)" : C_BORDER}`,
        background: hovered ? C_SURFACE : C_BG,
        borderRadius: 8, cursor: "pointer",
        color: hovered ? C_TEXT : C_MUTED,
        transition: "all 0.15s",
        boxShadow: hovered ? SHADOW_SM : "none",
      }}
    >
      <IconBell />
      {badgeCount && (
        <span aria-hidden style={{
          position: "absolute", top: -5, right: -5,
          minWidth: 16, height: 16,
          padding: "0 3px",
          borderRadius: 99,
          background: "#ef4444",
          color: "#fff",
          fontSize: 9,
          fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: `0 0 0 2px ${C_BG}`,
          letterSpacing: "-0.02em",
        }}>
          {badgeCount}
        </span>
      )}
    </button>
  );
}

// ── AvatarDropdown ─────────────────────────────────────────────────────────────
function AvatarDropdown({ username }: { username: string | null }) {
  const [open, setOpen] = useState(false);
  const [profilHovered, setProfilHovered] = useState(false);
  const [keluarHovered, setKeluarHovered] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  const initials = getInitials(username);
  const avatarBg = getAvatarColor(username);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function handleLogout() {
    setOpen(false);
    try { await logout(); } catch { /* best-effort */ }
    nav("/m/login", { replace: true });
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Avatar button — initials circle */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Menu akun"
        aria-expanded={open}
        aria-haspopup="menu"
        style={{
          display: "flex", alignItems: "center", gap: 6,
          height: 32, padding: "0 8px 0 4px",
          border: `1px solid ${open ? "rgba(0,0,0,0.14)" : C_BORDER}`,
          background: open ? C_SURFACE : C_BG,
          borderRadius: 999, cursor: "pointer",
          transition: "all 0.15s",
          boxShadow: open ? SHADOW_SM : "none",
        }}
      >
        <span style={{
          width: 22, height: 22, borderRadius: "50%",
          background: avatarBg,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 9, fontWeight: 700, color: "#fff",
          letterSpacing: "0.04em", flexShrink: 0,
          fontFamily: "system-ui, sans-serif",
        }}>
          {initials}
        </span>
        <span style={{
          fontSize: 12, fontWeight: 500, color: C_TEXT,
          maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {username ? username.split("@")[0] : "Akun"}
        </span>
        <span style={{ color: C_MUTED, display: "flex", alignItems: "center" }}>
          <IconChevron />
        </span>
      </button>

      {open && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 6px)",
          right: 0,
          minWidth: 200,
          background: C_BG,
          border: `1px solid ${C_BORDER}`,
          borderRadius: 10,
          boxShadow: SHADOW_MD,
          zIndex: 200,
          overflow: "hidden",
        }}>
          {/* Header */}
          {username && (
            <div style={{
              padding: "12px 14px 10px",
              borderBottom: `1px solid ${C_BORDER}`,
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <span style={{
                width: 32, height: 32, borderRadius: "50%",
                background: avatarBg, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700, color: "#fff",
                letterSpacing: "0.04em",
              }}>
                {initials}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: 12, fontWeight: 600, color: C_TEXT,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {username.split("@")[0]}
                </div>
                <div style={{
                  fontSize: 11, color: C_MUTED, marginTop: 1,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {username}
                </div>
              </div>
            </div>
          )}

          {/* Menu items */}
          <div style={{ padding: "4px 0" }}>
            <Link
              to="/m/me"
              onClick={() => setOpen(false)}
              onMouseEnter={() => setProfilHovered(true)}
              onMouseLeave={() => setProfilHovered(false)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "7px 14px",
                fontSize: 13, color: C_TEXT,
                textDecoration: "none",
                background: profilHovered ? C_SURFACE : "transparent",
                transition: "background 0.1s",
              }}
            >
              Profil
            </Link>
          </div>

          {/* Danger zone */}
          <div style={{ borderTop: `1px solid ${C_BORDER}`, padding: "4px 0" }}>
            <button
              onClick={handleLogout}
              onMouseEnter={() => setKeluarHovered(true)}
              onMouseLeave={() => setKeluarHovered(false)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                width: "100%", padding: "7px 14px",
                fontSize: 13, color: C_DANGER,
                background: keluarHovered ? C_DANGER_L : "transparent",
                border: "none", cursor: "pointer",
                transition: "background 0.1s", textAlign: "left",
              }}
            >
              Keluar
            </button>
          </div>
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
    (window as unknown as { frappe?: { session?: { user?: string } } }).frappe?.session?.user ?? null
  );

  useEffect(() => {
    if (username) return;
    import("../auth/session").then(({ probeSession }) =>
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
        background: C_BG,
        borderBottom: `1px solid ${C_BORDER}`,
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
            color: C_TEXT,
            letterSpacing: "-0.02em",
            fontFamily: "'Outfit', system-ui, sans-serif",
          }}>
            Vernon
          </span>
        </Link>

        {/* Divider */}
        <div aria-hidden style={{
          width: 1, height: 16,
          background: C_BORDER,
          margin: "0 14px",
          flexShrink: 0,
        }} />

        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            fontSize: 13, fontWeight: 400,
            color: C_MUTED,
          }}>
            Vernon
          </span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke={C_MUTED} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span style={{
            fontSize: 13, fontWeight: 600,
            color: C_TEXT,
          }}>
            {breadcrumb}
          </span>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Right actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <NotificationButton
            unread={unread}
            onNavigate={() => nav("/m/me/notifications")}
          />
          <AvatarDropdown username={username} />
        </div>
      </header>

      {/* ── Navbar2 ── */}
      <nav aria-label="Main menu" style={{
        position: "fixed",
        top: "var(--top-nav1-h)",
        left: 0, right: 0,
        height: "var(--top-nav2-h)",
        background: C_BG,
        borderBottom: `1px solid ${C_BORDER}`,
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
                color: isActive ? C_TEXT : C_MUTED,
                textDecoration: "none",
                borderRadius: 6,
                background: isActive ? C_PRIMARY_L : "transparent",
                border: isActive ? `1px solid rgba(124,77,171,0.18)` : "1px solid transparent",
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

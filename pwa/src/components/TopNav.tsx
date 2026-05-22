import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { logout } from "../auth/session";
import { useUnreadCount } from "../hooks/useUnreadCount";
import {
  listNotifications,
  markRead,
  markAllRead,
  Notification,
} from "../api/notifications";
import { fmtRelative } from "../i18n";

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
const SHADOW_MD   = "0 4px 16px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)";

// ── Navbar surface tokens (on-primary) ─────────────────────────────────────────
const C_NAV_BG      = "linear-gradient(135deg, #6836a0 0%, #7c4dab 100%)";
const C_NAV_TEXT    = "#ffffff";
const C_NAV_MUTED   = "rgba(255,255,255,0.60)";
const C_NAV_BORDER  = "rgba(255,255,255,0.14)";
const C_NAV_ACTIVE  = "rgba(255,255,255,0.18)";

const BREADCRUMB_MAP: { prefix: string; label: string }[] = [
  { prefix: "/m/dashboard", label: "Dashboard" },
  { prefix: "/m/project",   label: "Project" },
  { prefix: "/m/work",      label: "Project" },
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
  { label: "Project",   to: "/m/project" },
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

function getAvatarColor(_username: string | null): string {
  return C_PRIMARY;
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

// ── NotificationDropdown ───────────────────────────────────────────────────────
function notifIcon(type?: string): string {
  if (type === "Assignment") return "👤";
  if (type === "Mention") return "💬";
  if (type === "Alert") return "⚠️";
  return "🔔";
}

function stripHtml(html?: string): string {
  if (!html) return "";
  return html.replace(/<[^>]+>/g, "").trim();
}

function NotificationDropdown({ unread }: { unread: number }) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  const qc = useQueryClient();
  const badgeCount = unread > 99 ? "99+" : unread > 0 ? String(unread) : null;

  const q = useQuery({
    queryKey: ["notifications", "dropdown"],
    queryFn: () => listNotifications(10, false).then((r) => r.results),
    enabled: open,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function handleTap(n: Notification) {
    if (n.read === 0) {
      qc.setQueryData<Notification[]>(["notifications", "dropdown"], (prev) =>
        prev?.map((x) => (x.name === n.name ? { ...x, read: 1 as const } : x)),
      );
      qc.invalidateQueries({ queryKey: ["unread-count"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      try { await markRead(n.name); } catch { /* best-effort */ }
    }
    setOpen(false);
    if (n.document_type === "VT Task" && n.document_name) {
      nav(`/m/work/${encodeURIComponent(n.document_name)}`);
    } else {
      nav("/m/me/notifications");
    }
  }

  async function handleMarkAll() {
    qc.setQueryData<Notification[]>(["notifications", "dropdown"], (prev) =>
      prev?.map((x) => ({ ...x, read: 1 as const })),
    );
    qc.invalidateQueries({ queryKey: ["unread-count"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
    try { await markAllRead(); } catch { /* best-effort */ }
  }

  const items = q.data ?? [];
  const hasUnread = items.some((n) => n.read === 0);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={unread > 0 ? `${unread} notifikasi belum dibaca` : "Notifikasi"}
        aria-expanded={open}
        aria-haspopup="menu"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: "relative",
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 32, height: 32,
          border: `1px solid ${open || hovered ? "rgba(255,255,255,0.30)" : C_NAV_BORDER}`,
          background: open || hovered ? C_NAV_ACTIVE : "transparent",
          borderRadius: 8, cursor: "pointer",
          color: open || hovered ? C_NAV_TEXT : C_NAV_MUTED,
          transition: "all 0.15s",
          boxShadow: "none",
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
            boxShadow: `0 0 0 2px #6836a0`,
            letterSpacing: "-0.02em",
          }}>
            {badgeCount}
          </span>
        )}
      </button>

      {open && (
        <div role="menu" style={{
          position: "absolute",
          top: "calc(100% + 6px)",
          right: 0,
          width: 360,
          maxWidth: "calc(100vw - 32px)",
          background: C_BG,
          border: `1px solid ${C_BORDER}`,
          borderRadius: 10,
          boxShadow: SHADOW_MD,
          zIndex: 200,
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            padding: "10px 14px",
            borderBottom: `1px solid ${C_BORDER}`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C_TEXT }}>
              Notifikasi
            </span>
            <button
              onClick={handleMarkAll}
              disabled={!hasUnread}
              style={{
                fontSize: 11, fontWeight: 500,
                color: hasUnread ? C_PRIMARY : C_MUTED,
                background: "transparent", border: "none",
                cursor: hasUnread ? "pointer" : "default",
                padding: "2px 6px",
                opacity: hasUnread ? 1 : 0.5,
              }}
            >
              Tandai semua dibaca
            </button>
          </div>

          {/* Body */}
          <div style={{ maxHeight: 380, overflowY: "auto" }}>
            {q.isLoading && (
              <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: C_MUTED }}>
                Memuat…
              </div>
            )}
            {!q.isLoading && items.length === 0 && (
              <div style={{ padding: 24, textAlign: "center", fontSize: 12, color: C_MUTED }}>
                Belum ada notifikasi
              </div>
            )}
            {items.map((n) => {
              const isUnread = n.read === 0;
              const excerpt = stripHtml(n.email_content).slice(0, 80);
              const age = Date.now() - new Date(n.creation).getTime();
              return (
                <button
                  key={n.name}
                  onClick={() => handleTap(n)}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 10,
                    width: "100%", textAlign: "left",
                    padding: "10px 14px 10px 12px",
                    background: isUnread ? C_PRIMARY_L : "transparent",
                    border: "none",
                    borderBottom: `1px solid ${C_BORDER}`,
                    borderLeft: isUnread ? `3px solid ${C_PRIMARY}` : "3px solid transparent",
                    color: C_TEXT, cursor: "pointer",
                  }}
                >
                  {/* Unread dot */}
                  <span style={{
                    flexShrink: 0, marginTop: 3,
                    width: 7, height: 7, borderRadius: "50%",
                    background: isUnread ? C_PRIMARY : "transparent",
                    border: isUnread ? "none" : `1.5px solid ${C_MUTED}`,
                  }} />
                  <span style={{ fontSize: 16, flexShrink: 0, lineHeight: 1.2 }}>{notifIcon(n.type)}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 12,
                      fontWeight: isUnread ? 600 : 500,
                      color: C_TEXT,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {n.subject}
                    </div>
                    {excerpt && (
                      <div style={{
                        fontSize: 11, color: C_MUTED, marginTop: 2,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {excerpt}
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: isUnread ? C_PRIMARY : C_MUTED, marginTop: 3, fontWeight: isUnread ? 600 : 400 }}>
                      {fmtRelative(age)}
                    </div>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{ borderTop: `1px solid ${C_BORDER}` }}>
            <Link
              to="/m/me/notifications"
              onClick={() => setOpen(false)}
              style={{
                display: "block",
                padding: "8px 14px",
                fontSize: 12, fontWeight: 500,
                color: C_PRIMARY,
                textDecoration: "none",
                textAlign: "center",
              }}
            >
              Lihat semua notifikasi
            </Link>
          </div>
        </div>
      )}
    </div>
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
          border: `1px solid ${open ? "rgba(255,255,255,0.30)" : C_NAV_BORDER}`,
          background: open ? C_NAV_ACTIVE : "transparent",
          borderRadius: 999, cursor: "pointer",
          transition: "all 0.15s",
          boxShadow: "none",
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
          fontSize: 12, fontWeight: 500, color: C_NAV_TEXT,
          maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {username ? username.split("@")[0] : "Akun"}
        </span>
        <span style={{ color: C_NAV_MUTED, display: "flex", alignItems: "center" }}>
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
        background: C_NAV_BG,
        borderBottom: `1px solid ${C_NAV_BORDER}`,
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
            color: C_NAV_TEXT,
            letterSpacing: "-0.02em",
            fontFamily: "'Outfit', system-ui, sans-serif",
          }}>
            Vernon
          </span>
        </Link>

        {/* Divider */}
        <div aria-hidden style={{
          width: 1, height: 16,
          background: C_NAV_BORDER,
          margin: "0 14px",
          flexShrink: 0,
        }} />

        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            fontSize: 13, fontWeight: 400,
            color: C_NAV_MUTED,
          }}>
            Vernon
          </span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke={C_NAV_MUTED} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span style={{
            fontSize: 13, fontWeight: 600,
            color: C_NAV_TEXT,
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
        background: C_NAV_BG,
        borderBottom: `1px solid ${C_NAV_BORDER}`,
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
                color: isActive ? C_NAV_TEXT : C_NAV_MUTED,
                textDecoration: "none",
                borderRadius: 6,
                background: isActive ? C_NAV_ACTIVE : "transparent",
                border: isActive ? `1px solid ${C_NAV_BORDER}` : "1px solid transparent",
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

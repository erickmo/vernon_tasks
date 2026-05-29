import { useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { logout } from "../../auth/session";
import { useDismiss } from "../../hooks/useDismiss";
import { getInitials } from "./breadcrumb";
import { IconChevron } from "./icons";

const SHADOW_MD = "0 4px 16px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)";

// ── AvatarDropdown ─────────────────────────────────────────────────────────────
export function AvatarDropdown({ username }: { username: string | null }) {
  const [open, setOpen] = useState(false);
  const [profilHovered, setProfilHovered] = useState(false);
  const [keluarHovered, setKeluarHovered] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  const initials = getInitials(username);
  const avatarBg = "var(--vt-primary)";

  useDismiss(ref, () => setOpen(false), open);

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
          border: `1px solid ${open ? "rgba(255,255,255,0.30)" : "var(--vt-nav-border)"}`,
          background: open ? "var(--vt-nav-active)" : "transparent",
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
          fontSize: 12, fontWeight: 500, color: "var(--vt-nav-text)",
          maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {username ? username.split("@")[0] : "Akun"}
        </span>
        <span style={{ color: "var(--vt-nav-muted)", display: "flex", alignItems: "center" }}>
          <IconChevron />
        </span>
      </button>

      {open && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 6px)",
          right: 0,
          minWidth: 200,
          background: "var(--vt-bg)",
          border: `1px solid var(--vt-border)`,
          borderRadius: 10,
          boxShadow: SHADOW_MD,
          zIndex: 200,
          overflow: "hidden",
        }}>
          {/* Header */}
          {username && (
            <div style={{
              padding: "12px 14px 10px",
              borderBottom: `1px solid var(--vt-border)`,
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
                  fontSize: 12, fontWeight: 600, color: "var(--vt-text)",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {username.split("@")[0]}
                </div>
                <div style={{
                  fontSize: 11, color: "var(--vt-text-muted)", marginTop: 1,
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
                fontSize: 13, color: "var(--vt-text)",
                textDecoration: "none",
                background: profilHovered ? "var(--vt-surface)" : "transparent",
                transition: "background 0.1s",
              }}
            >
              Profil
            </Link>
          </div>

          {/* Danger zone */}
          <div style={{ borderTop: `1px solid var(--vt-border)`, padding: "4px 0" }}>
            <button
              onClick={handleLogout}
              onMouseEnter={() => setKeluarHovered(true)}
              onMouseLeave={() => setKeluarHovered(false)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                width: "100%", padding: "7px 14px",
                fontSize: 13, color: "var(--vt-danger)",
                background: keluarHovered ? "#fef2f2" : "transparent",
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

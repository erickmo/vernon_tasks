import { useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listNotifications,
  markRead,
  markAllRead,
  Notification,
} from "../../api/notifications";
import { fmtRelative } from "../../i18n";
import { Badge } from "../ui/Badge";
import { useDismiss } from "../../hooks/useDismiss";
import { IconBell } from "./icons";

const SHADOW_MD = "0 4px 16px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)";

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

export function NotificationDropdown({ unread }: { unread: number }) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["notifications", "dropdown"],
    queryFn: () => listNotifications(10, false).then((r) => r.results),
    enabled: open,
    staleTime: 30_000,
  });

  useDismiss(ref, () => setOpen(false), open);

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
          border: `1px solid ${open || hovered ? "rgba(255,255,255,0.30)" : "var(--vt-nav-border)"}`,
          background: open || hovered ? "var(--vt-nav-active)" : "transparent",
          borderRadius: 8, cursor: "pointer",
          color: open || hovered ? "var(--vt-nav-text)" : "var(--vt-nav-muted)",
          transition: "all 0.15s",
          boxShadow: "none",
        }}
      >
        <IconBell />
        <span aria-hidden style={{ position: "absolute", top: -5, right: -5 }}>
          <Badge variant="count" count={unread} ring ariaLabel={`${unread} unread`} />
        </span>
      </button>

      {open && (
        <div role="menu" style={{
          position: "absolute",
          top: "calc(100% + 6px)",
          right: 0,
          width: 360,
          maxWidth: "calc(100vw - 32px)",
          background: "var(--vt-bg)",
          border: `1px solid var(--vt-border)`,
          borderRadius: 10,
          boxShadow: SHADOW_MD,
          zIndex: 200,
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            padding: "10px 14px",
            borderBottom: `1px solid var(--vt-border)`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--vt-text)" }}>
              Notifikasi
            </span>
            <button
              onClick={handleMarkAll}
              disabled={!hasUnread}
              style={{
                fontSize: 11, fontWeight: 500,
                color: hasUnread ? "var(--vt-primary)" : "var(--vt-text-muted)",
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
              <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "var(--vt-text-muted)" }}>
                Memuat…
              </div>
            )}
            {!q.isLoading && items.length === 0 && (
              <div style={{ padding: 24, textAlign: "center", fontSize: 12, color: "var(--vt-text-muted)" }}>
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
                    background: isUnread ? "var(--vt-primary-light)" : "transparent",
                    border: "none",
                    borderBottom: `1px solid var(--vt-border)`,
                    borderLeft: isUnread ? `3px solid var(--vt-primary)` : "3px solid transparent",
                    color: "var(--vt-text)", cursor: "pointer",
                  }}
                >
                  {/* Unread dot */}
                  <span style={{
                    flexShrink: 0, marginTop: 3,
                    width: 7, height: 7, borderRadius: "50%",
                    background: isUnread ? "var(--vt-primary)" : "transparent",
                    border: isUnread ? "none" : `1.5px solid var(--vt-text-muted)`,
                  }} />
                  <span style={{ fontSize: 16, flexShrink: 0, lineHeight: 1.2 }}>{notifIcon(n.type)}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 12,
                      fontWeight: isUnread ? 600 : 500,
                      color: "var(--vt-text)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {n.subject}
                    </div>
                    {excerpt && (
                      <div style={{
                        fontSize: 11, color: "var(--vt-text-muted)", marginTop: 2,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {excerpt}
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: isUnread ? "var(--vt-primary)" : "var(--vt-text-muted)", marginTop: 3, fontWeight: isUnread ? 600 : 400 }}>
                      {fmtRelative(age)}
                    </div>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{ borderTop: `1px solid var(--vt-border)` }}>
            <Link
              to="/m/me/notifications"
              onClick={() => setOpen(false)}
              style={{
                display: "block",
                padding: "8px 14px",
                fontSize: 12, fontWeight: 500,
                color: "var(--vt-primary)",
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

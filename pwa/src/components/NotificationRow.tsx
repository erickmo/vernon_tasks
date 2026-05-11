import { Notification } from "../api/notifications";
import { fmtRelative } from "../i18n";

function iconFor(type?: string): string {
  if (type === "Assignment") return "👤";
  if (type === "Mention") return "💬";
  if (type === "Alert") return "⚠️";
  return "🔔";
}

function strip(html?: string): string {
  if (!html) return "";
  return html.replace(/<[^>]+>/g, "").trim();
}

interface Props {
  notification: Notification;
  onClick: () => void;
}

export function NotificationRow({ notification: n, onClick }: Props) {
  const unread = n.read === 0;
  const excerpt = strip(n.email_content).slice(0, 80);
  const age = Date.now() - new Date(n.creation).getTime();
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        gap: 12,
        width: "100%",
        textAlign: "left",
        padding: "var(--vt-space-3)",
        background: unread ? "var(--vt-surface)" : "transparent",
        border: 0,
        borderBottom: "1px solid var(--vt-border)",
        color: "var(--vt-text)",
        cursor: "pointer",
        position: "relative",
      }}
    >
      {unread && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: 4,
            top: "50%",
            transform: "translateY(-50%)",
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--vt-primary)",
          }}
        />
      )}
      <span style={{ fontSize: 22, marginLeft: 12 }}>{iconFor(n.type)}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: unread ? 700 : 400,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {n.subject}
        </div>
        {excerpt && (
          <div
            style={{
              fontSize: 13,
              color: "var(--vt-text-muted)",
              marginTop: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {excerpt}
          </div>
        )}
        <div style={{ fontSize: 12, color: "var(--vt-text-muted)", marginTop: 4 }}>
          {fmtRelative(age)}
        </div>
      </span>
    </button>
  );
}

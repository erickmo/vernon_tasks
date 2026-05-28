import { Link } from "react-router-dom";
import type { NextAction } from "../../../../api/dashboard";
import { logEvent } from "../../../../telemetry";
import { fmtDateShort, priorityColor, TOKENS } from "./shared";

interface Props {
  items: NextAction[];
}

export function NextActionsList({ items }: Props) {
  if (items.length === 0) {
    return (
      <div
        style={{
          background: TOKENS.CARD,
          borderRadius: 10,
          boxShadow: TOKENS.SHADOW,
          padding: "18px 16px",
          textAlign: "center",
          fontSize: 12,
          color: TOKENS.TEXT3,
        }}
      >
        Tidak ada tindakan berikutnya.
      </div>
    );
  }

  return (
    <div
      style={{
        background: TOKENS.CARD,
        borderRadius: 10,
        boxShadow: TOKENS.SHADOW,
        overflow: "hidden",
      }}
    >
      {items.map((it, i) => (
        <Link
          key={it.id}
          to={`/m/work/${it.id}`}
          onClick={() => logEvent("dashboard_next_action_tap", { task_id: it.id })}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "11px 14px",
            borderBottom: i === items.length - 1 ? "none" : `1px solid ${TOKENS.BD}`,
            textDecoration: "none",
            color: TOKENS.TEXT,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: priorityColor(it.priority),
              flexShrink: 0,
            }}
          />
          <span style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: TOKENS.TEXT,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {it.title ?? it.id}
            </div>
            <div style={{ fontSize: 11, color: TOKENS.TEXT2, marginTop: 1 }}>
              {it.project ?? "—"}
            </div>
          </span>
          {it.deadline && (
            <span style={{ fontSize: 11, color: TOKENS.TEXT2, flexShrink: 0 }}>
              {fmtDateShort(it.deadline)}
            </span>
          )}
        </Link>
      ))}
      <Link
        to="/m/project"
        style={{
          display: "block",
          padding: "10px 14px",
          fontSize: 12,
          color: TOKENS.INDIGO,
          textDecoration: "none",
          textAlign: "center",
          fontWeight: 600,
          borderTop: `1px solid ${TOKENS.BD}`,
        }}
      >
        Lihat semua
      </Link>
    </div>
  );
}

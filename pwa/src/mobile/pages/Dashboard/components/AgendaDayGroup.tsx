import { Link } from "react-router-dom";
import type { AgendaDay } from "../../../../api/dashboard";
import { TOKENS } from "./shared";

interface Props {
  day: AgendaDay;
}

const TYPE_ICON: Record<string, string> = {
  task: "◈",
  meeting: "●",
  sprint_start: "◆",
  sprint_end: "◆",
};

export function AgendaDayGroup({ day }: Props) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: TOKENS.TEXT3,
          textTransform: "uppercase",
          letterSpacing: "0.10em",
          margin: "0 0 8px",
        }}
      >
        {day.label}
      </div>
      <div
        style={{
          background: TOKENS.CARD,
          borderRadius: 10,
          boxShadow: TOKENS.SHADOW,
          overflow: "hidden",
        }}
      >
        {day.items.map((it, i) => (
          <Link
            key={`${it.type}-${it.id}`}
            to={it.route}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "11px 14px",
              borderBottom: i === day.items.length - 1 ? "none" : `1px solid ${TOKENS.BD}`,
              textDecoration: "none",
              color: TOKENS.TEXT,
            }}
          >
            <span
              style={{
                width: 38,
                fontSize: 10,
                fontWeight: 600,
                color: TOKENS.TEXT2,
                flexShrink: 0,
                textAlign: "center",
              }}
            >
              {it.time ?? (it.type === "task" ? "EOD" : "—")}
            </span>
            <span style={{ fontSize: 14, color: TOKENS.PURPLE, width: 16, flexShrink: 0 }}>
              {TYPE_ICON[it.type] ?? "·"}
            </span>
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
              {it.project && (
                <div style={{ fontSize: 11, color: TOKENS.TEXT2, marginTop: 1 }}>{it.project}</div>
              )}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

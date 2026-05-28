import type { MeSprint } from "../../../../api/dashboard";
import { fmtDateShort, RISK_META, TOKENS } from "./shared";

interface Props {
  sprint: MeSprint;
}

export function SprintCommitmentCard({ sprint }: Props) {
  const pct = Math.max(0, Math.min(100, sprint.progress_pct));
  const riskMeta = RISK_META[sprint.risk];
  return (
    <div
      style={{
        background: TOKENS.CARD,
        borderRadius: 10,
        boxShadow: TOKENS.SHADOW,
        borderLeft: `3px solid ${TOKENS.PURPLE}`,
        padding: "14px 16px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: TOKENS.TEXT, lineHeight: 1.3 }}>
            {sprint.name}
          </div>
          <div style={{ fontSize: 11, color: TOKENS.TEXT2, marginTop: 2 }}>
            {fmtDateShort(sprint.start_date)} — {fmtDateShort(sprint.end_date)}
          </div>
        </div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "2px 8px",
            borderRadius: 99,
            background: riskMeta.bg,
            color: riskMeta.color,
            flexShrink: 0,
          }}
        >
          {riskMeta.label}
        </span>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 10, fontSize: 11, color: TOKENS.TEXT2 }}>
        <span>committed <b style={{ color: TOKENS.TEXT }}>{sprint.committed_points}</b></span>
        <span>·</span>
        <span>done <b style={{ color: TOKENS.TEXT }}>{sprint.done_points}</b></span>
        <span>·</span>
        <span style={{ color: TOKENS.PURPLE, fontWeight: 700 }}>{Math.round(pct)}%</span>
      </div>

      <div
        style={{
          height: 6,
          background: "#e2e8f0",
          borderRadius: 99,
          overflow: "hidden",
          marginTop: 8,
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${TOKENS.INDIGO}, ${TOKENS.PURPLE})`,
            transition: "width 0.6s",
          }}
        />
      </div>
    </div>
  );
}

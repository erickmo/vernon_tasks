import { Link } from "react-router-dom";
import type { ProjectCard as ProjectCardData } from "../../../../api/dashboard";
import { fmtDateShort, RISK_META, TOKENS } from "./shared";

interface Props {
  data: ProjectCardData;
}

const W = 200;
const H = 40;

function Burndown({ ideal, actual }: { ideal: number[]; actual: number[] }) {
  if (ideal.length < 2) return null;
  const max = Math.max(1, ...ideal, ...actual);
  const toPath = (arr: number[]) =>
    arr
      .map((v, i) => {
        const x = (i / (ideal.length - 1)) * W;
        const y = H - (v / max) * H;
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  return (
    <svg width={W} height={H} style={{ display: "block", marginTop: 6 }} aria-hidden>
      <path d={toPath(ideal)} stroke={TOKENS.TEXT3} strokeWidth={1} fill="none" strokeDasharray="3 3" />
      <path d={toPath(actual)} stroke={TOKENS.PURPLE} strokeWidth={1.6} fill="none" />
    </svg>
  );
}

export function ProjectCard({ data }: Props) {
  const risk = RISK_META[data.risk];
  return (
    <Link
      to={`/m/project/${data.id}`}
      style={{
        display: "block",
        background: TOKENS.CARD,
        borderRadius: 10,
        boxShadow: TOKENS.SHADOW,
        padding: "14px 16px",
        textDecoration: "none",
        color: TOKENS.TEXT,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: TOKENS.TEXT, lineHeight: 1.3 }}>
            {data.name}
          </div>
          {data.status && (
            <div style={{ fontSize: 10, color: TOKENS.TEXT3, marginTop: 2, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {data.status}
            </div>
          )}
        </div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "2px 8px",
            borderRadius: 99,
            background: risk.bg,
            color: risk.color,
            flexShrink: 0,
          }}
        >
          {risk.label}
        </span>
      </div>

      {data.sprint && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, color: TOKENS.TEXT2 }}>
            {data.sprint.name} · {fmtDateShort(data.sprint.start)} — {fmtDateShort(data.sprint.end)}
          </div>
          <Burndown ideal={data.sprint.burndown_ideal} actual={data.sprint.burndown_actual} />
        </div>
      )}

      <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 11, color: TOKENS.TEXT2 }}>
        <span><b style={{ color: TOKENS.TEXT }}>{data.pct_done.toFixed(0)}%</b> done</span>
        <span><b style={{ color: TOKENS.TEXT }}>{data.open_tasks}</b> open</span>
        <span>
          <b style={{ color: data.blockers > 0 ? TOKENS.RED : TOKENS.TEXT }}>{data.blockers}</b> blocker
        </span>
      </div>
    </Link>
  );
}

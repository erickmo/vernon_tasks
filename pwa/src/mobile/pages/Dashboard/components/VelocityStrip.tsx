import type { VelocityWeek } from "../../../../api/dashboard";
import { TOKENS } from "./shared";

interface Props {
  weeks: VelocityWeek[];
  delta: number;
}

const W = 160;
const H = 36;

export function VelocityStrip({ weeks, delta }: Props) {
  const values = weeks.map((w) => w.done);
  const max = Math.max(1, ...values);
  const points = values.map((v, i) => {
    const x = (i / Math.max(1, values.length - 1)) * W;
    const y = H - (v / max) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = values[values.length - 1] ?? 0;
  const deltaColor =
    delta > 0 ? TOKENS.GREEN : delta < 0 ? TOKENS.RED : TOKENS.TEXT3;
  const deltaSym = delta > 0 ? "↑" : delta < 0 ? "↓" : "·";

  return (
    <div
      style={{
        background: TOKENS.CARD,
        borderRadius: 10,
        boxShadow: TOKENS.SHADOW,
        padding: "12px 14px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div style={{ flex: "0 0 auto" }}>
        <div style={{ fontSize: 10, color: TOKENS.TEXT3, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Velocity 8w
        </div>
        <svg width={W} height={H} style={{ display: "block", marginTop: 4 }} aria-hidden>
          <polyline
            fill="none"
            stroke={TOKENS.PURPLE}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points.join(" ")}
          />
        </svg>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: TOKENS.TEXT, letterSpacing: "-0.02em" }}>
          {last}
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: deltaColor }}>
          {deltaSym} {Math.abs(delta)} vs lalu
        </div>
      </div>
    </div>
  );
}

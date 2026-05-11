import { LeaderboardRow } from "../api/analytics";

const MEDAL = ["🥇", "🥈", "🥉"];

export function LeaderboardTable({ rows }: { rows: LeaderboardRow[] }) {
  if (rows.length === 0) {
    return (
      <div style={{ textAlign: "center", color: "var(--vt-text-muted)", padding: 24 }}>
        Belum ada data
      </div>
    );
  }
  return (
    <div>
      {rows.map((r, idx) => {
        const rank = idx + 1;
        const medal = MEDAL[idx];
        return (
          <div
            key={r.user}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "var(--vt-space-3)",
              borderBottom: "1px solid var(--vt-border)",
            }}
          >
            <span style={{ width: 28, fontWeight: 700 }}>{medal ?? `#${rank}`}</span>
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {r.user}
            </span>
            <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
              {Math.round(r.points)} pts
            </span>
            <span style={{ fontSize: 12, color: "var(--vt-text-muted)", minWidth: 32, textAlign: "right" }}>
              {r.task_count}×
            </span>
          </div>
        );
      })}
    </div>
  );
}

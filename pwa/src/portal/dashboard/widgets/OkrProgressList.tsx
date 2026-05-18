export interface OkrRow {
  name: string;
  title: string;
  progress_pct: number;
  trend_delta?: number;
}

interface Props { okrs: OkrRow[] }

export function OkrProgressList({ okrs }: Props) {
  if (okrs.length === 0) {
    return <div style={{ fontSize: 11, color: "#6b63a0" }}>Tidak ada OKR aktif</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {okrs.map((o) => {
        const atRisk = o.progress_pct < 30;
        const pctColor = o.progress_pct >= 70 ? "#7c3aed" : o.progress_pct >= 40 ? "#b45309" : "#dc2626";
        const barBg = o.progress_pct >= 70
          ? "linear-gradient(90deg,#6366f1,#7c3aed)"
          : o.progress_pct >= 40
          ? "linear-gradient(90deg,#f59e0b,#fbbf24)"
          : "linear-gradient(90deg,#ef4444,#f87171)";
        return (
          <div key={o.name} className={`db-okr-row${atRisk ? " db-okr-row--risk" : ""}`}>
            <div className="db-okr-row__top">
              <span className="db-okr-row__name">
                {atRisk && "🚨 "}{o.title}
              </span>
              <span className="db-okr-row__pct" style={{ color: pctColor }}>{o.progress_pct}%</span>
            </div>
            <div className="db-bar">
              <div className="db-bar__fill" style={{ width: `${o.progress_pct}%`, background: barBg }} />
            </div>
            {o.trend_delta !== undefined && (
              <div className="db-okr-row__trend">
                <span className={o.trend_delta >= 0 ? "db-trend-up" : "db-trend-dn"}>
                  {o.trend_delta >= 0 ? "↑" : "↓"} {Math.abs(o.trend_delta)}% minggu ini
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

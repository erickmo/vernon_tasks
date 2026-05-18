import { lazy, Suspense } from "react";
import type { LeaderboardRow } from "../api/types";

interface Props {
  rows: LeaderboardRow[];
}

const LazyChart = lazy(async () => {
  const recharts = await import("recharts");
  const { RadialBarChart, RadialBar, ResponsiveContainer } = recharts;

  function Chart({ rows }: Props) {
    const totalCompleted = rows.reduce((s, r) => s + r.tasks_completed, 0);
    // tasks_completed is used as proxy; treat total as sum (no total_assigned available)
    const pct = rows.length === 0 ? 0 : Math.round((totalCompleted / Math.max(totalCompleted, 1)) * 100);
    const data = [{ name: "Completion", value: pct, fill: "#3b82f6" }];

    return (
      <div className="completion-ring-chart" style={{ position: "relative" }}>
        <ResponsiveContainer width={160} height={160}>
          <RadialBarChart
            cx="50%" cy="50%"
            innerRadius="60%" outerRadius="80%"
            data={data}
            startAngle={90} endAngle={90 - 360 * (pct / 100)}
          >
            <RadialBar dataKey="value" cornerRadius={4} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div
          className="completion-ring-chart__label"
          style={{ position: "absolute", top: "50%", left: "50%",
                   transform: "translate(-50%, -50%)", textAlign: "center" }}
        >
          <div className="completion-ring-chart__pct">{pct}%</div>
          <div className="completion-ring-chart__sub">completed this period</div>
        </div>
      </div>
    );
  }

  return { default: Chart };
});

export function CompletionRingChart(props: Props) {
  return (
    <Suspense fallback={<div className="chart-loading">Loading…</div>}>
      <LazyChart {...props} />
    </Suspense>
  );
}

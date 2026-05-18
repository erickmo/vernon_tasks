import { lazy, Suspense } from "react";
import type { VelocityProject } from "../api/types";

interface Props {
  projects: VelocityProject[];
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
                "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#6366f1"];

const LazyChart = lazy(async () => {
  const recharts = await import("recharts");
  const { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } = recharts;

  // Build dataset: rows are sprint labels; each project is a key
  function buildData(projects: VelocityProject[]) {
    const allLabels = Array.from(
      new Set(projects.flatMap((p) => p.sprints.map((s) => s.sprint_label)))
    ).sort();
    return allLabels.map((label) => {
      const row: Record<string, number | string> = { label };
      for (const p of projects) {
        const pt = p.sprints.find((s) => s.sprint_label === label);
        row[p.project_title] = pt?.velocity ?? 0;
      }
      return row;
    });
  }

  function Chart({ projects }: Props) {
    const data = buildData(projects);
    const capped = projects.slice(0, 10);
    return (
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data}>
          <XAxis dataKey="label" />
          <YAxis />
          <Tooltip />
          <Legend />
          {capped.map((p, i) => (
            <Bar key={p.project} dataKey={p.project_title} fill={COLORS[i % COLORS.length]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return { default: Chart };
});

export function VelocityComparisonChart(props: Props) {
  return (
    <Suspense fallback={<div className="chart-loading">Loading chart…</div>}>
      <LazyChart {...props} />
    </Suspense>
  );
}

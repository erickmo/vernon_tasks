import { lazy, Suspense } from "react";
import type { WorkloadMember } from "../api/types";

interface Props {
  members: WorkloadMember[];
}

const LazyChart = lazy(async () => {
  const recharts = await import("recharts");
  const { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } = recharts;

  function Chart({ members }: Props) {
    const sorted = [...members].sort(
      (a, b) => b.open_tasks + b.overdue_tasks - (a.open_tasks + a.overdue_tasks)
    );
    const data = sorted.map((m) => ({
      name: m.full_name,
      normal: m.open_tasks - m.overdue_tasks,
      overdue: m.overdue_tasks,
    }));

    return (
      <ResponsiveContainer width="100%" height={Math.max(160, data.length * 40)}>
        <BarChart layout="vertical" data={data}>
          <XAxis type="number" />
          <YAxis type="category" dataKey="name" width={120} />
          <Tooltip />
          <Legend />
          <Bar dataKey="normal"  name="Open Tasks"   fill="#3b82f6" stackId="a" />
          <Bar dataKey="overdue" name="Overdue Tasks" fill="#ef4444" stackId="a" />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return { default: Chart };
});

export function WorkloadChart(props: Props) {
  return (
    <Suspense fallback={<div className="chart-loading">Loading…</div>}>
      <LazyChart {...props} />
    </Suspense>
  );
}

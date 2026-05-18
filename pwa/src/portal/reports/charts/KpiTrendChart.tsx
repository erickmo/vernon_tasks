import { lazy, Suspense } from "react";
import type { KpiTrendPoint } from "../api/types";

interface Props {
  series: KpiTrendPoint[];
  unit: string;
}

const LazyChart = lazy(async () => {
  const recharts = await import("recharts");
  const { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } = recharts;

  function Chart({ series, unit }: Props) {
    const target = series[0]?.target ?? 0;
    return (
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={series}>
          <XAxis dataKey="label" />
          <YAxis unit={` ${unit}`} />
          <Tooltip
            formatter={(value, name) => [`${value} ${unit}`, name as string]}
          />
          <ReferenceLine y={target} stroke="#888" strokeDasharray="4 2" label="Target" />
          <Line type="monotone" dataKey="value" stroke="#3b82f6" dot={false} name="Actual" />
          <Line type="monotone" dataKey="target" stroke="#f59e0b" dot={false} name="Target" strokeDasharray="4 2" />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  return { default: Chart };
});

export function KpiTrendChart(props: Props) {
  return (
    <Suspense fallback={<div className="chart-loading">Loading chart…</div>}>
      <LazyChart {...props} />
    </Suspense>
  );
}

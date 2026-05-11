import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { KpiTrend } from "../api/leaderExec";

export function KpiTrendChart({ data }: { data: KpiTrend }) {
  if (data.labels.length === 0) {
    return (
      <div style={{ textAlign: "center", color: "var(--vt-text-muted)", padding: 24 }}>
        Belum ada data KPI
      </div>
    );
  }
  const rows = data.labels.map((l, i) => ({ label: l, value: data.values[i] ?? 0 }));
  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--vt-text-muted)", marginBottom: 4 }}>
        {data.kpi_name} ({data.unit})
      </div>
      <div style={{ width: "100%", height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid stroke="var(--vt-border)" strokeDasharray="3 3" />
            <XAxis dataKey="label" stroke="var(--vt-text-muted)" fontSize={10} tickFormatter={(d) => d.slice(5)} />
            <YAxis stroke="var(--vt-text-muted)" fontSize={11} />
            <Tooltip contentStyle={{ background: "var(--vt-surface)", border: "1px solid var(--vt-border)" }} />
            <Line type="monotone" dataKey="value" stroke="var(--vt-primary)" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

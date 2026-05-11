import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { Burndown } from "../api/leader";

export function BurndownChart({ data }: { data: Burndown }) {
  if (data.labels.length === 0) {
    return (
      <div style={{ textAlign: "center", color: "var(--vt-text-muted)", padding: 24 }}>
        Belum ada data burndown
      </div>
    );
  }
  const rows = data.labels.map((d, i) => ({
    day: d,
    ideal: data.ideal[i] ?? 0,
    remaining: data.remaining[i] ?? 0,
  }));
  return (
    <div style={{ width: "100%", height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid stroke="var(--vt-border)" strokeDasharray="3 3" />
          <XAxis dataKey="day" stroke="var(--vt-text-muted)" fontSize={10} tickFormatter={(d) => d.slice(5)} />
          <YAxis stroke="var(--vt-text-muted)" fontSize={11} />
          <Tooltip contentStyle={{ background: "var(--vt-surface)", border: "1px solid var(--vt-border)" }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="ideal" stroke="var(--vt-text-muted)" strokeDasharray="4 4" dot={false} />
          <Line type="monotone" dataKey="remaining" stroke="var(--vt-primary)" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

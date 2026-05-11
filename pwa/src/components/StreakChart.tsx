import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { DailyCompletion } from "../api/dashboard";

export function StreakChart({ data }: { data: DailyCompletion[] }) {
  if (data.length === 0) {
    return (
      <div style={{ textAlign: "center", color: "var(--vt-text-muted)", padding: 24 }}>
        Belum ada penyelesaian
      </div>
    );
  }
  return (
    <div style={{ width: "100%", height: 200 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid stroke="var(--vt-border)" strokeDasharray="3 3" />
          <XAxis dataKey="date" stroke="var(--vt-text-muted)" fontSize={10} tickFormatter={(d) => d.slice(5)} />
          <YAxis stroke="var(--vt-text-muted)" fontSize={11} allowDecimals={false} />
          <Tooltip contentStyle={{ background: "var(--vt-surface)", border: "1px solid var(--vt-border)" }} />
          <Bar dataKey="count" fill="var(--vt-primary)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

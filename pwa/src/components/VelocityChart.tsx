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
import { VelocityTrend } from "../api/analytics";

export function VelocityChart({ data }: { data: VelocityTrend }) {
  const rows = data.sprints.map((s, i) => ({
    sprint: s,
    personal: data.personal[i] ?? 0,
    team_avg: data.team_avg[i] ?? 0,
  }));
  if (rows.length === 0) {
    return (
      <div style={{ textAlign: "center", color: "var(--vt-text-muted)", padding: 24 }}>
        Belum ada data sprint
      </div>
    );
  }
  return (
    <div style={{ width: "100%", height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid stroke="var(--vt-border)" strokeDasharray="3 3" />
          <XAxis dataKey="sprint" stroke="var(--vt-text-muted)" fontSize={11} />
          <YAxis stroke="var(--vt-text-muted)" fontSize={11} />
          <Tooltip contentStyle={{ background: "var(--vt-surface)", border: "1px solid var(--vt-border)" }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="personal" stroke="var(--vt-primary)" strokeWidth={2} dot />
          <Line type="monotone" dataKey="team_avg" stroke="var(--vt-text-muted)" strokeDasharray="4 4" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

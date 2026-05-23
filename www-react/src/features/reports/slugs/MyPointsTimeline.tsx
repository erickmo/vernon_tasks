import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { ReportPayload } from '../types';

export function MyPointsTimeline({ payload }: { payload: ReportPayload }) {
  if (payload.rows.length === 0) {
    return <p className="text-xs text-slate-500">No points logged yet.</p>;
  }
  const data = [...payload.rows].sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  );
  return (
    <div className="h-72">
      <ResponsiveContainer>
        <LineChart data={data as object[]}>
          <XAxis dataKey="date" fontSize={10} />
          <YAxis fontSize={10} />
          <Tooltip />
          <Line dataKey="points" stroke="#6836a0" strokeWidth={2} dot />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

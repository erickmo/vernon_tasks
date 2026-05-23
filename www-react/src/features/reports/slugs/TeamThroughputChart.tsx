import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { ReportPayload } from '../types';

export function TeamThroughputChart({ payload }: { payload: ReportPayload }) {
  if (payload.rows.length === 0) {
    return (
      <p className="text-xs text-slate-500">No completed tasks to chart.</p>
    );
  }
  return (
    <div className="h-72">
      <ResponsiveContainer>
        <LineChart data={payload.rows as object[]}>
          <XAxis dataKey="week" fontSize={10} />
          <YAxis fontSize={10} />
          <Tooltip />
          <Legend />
          <Line dataKey="velocity" stroke="#6836a0" strokeWidth={2} />
          <Line dataKey="cycle_hours" stroke="#0ea5e9" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

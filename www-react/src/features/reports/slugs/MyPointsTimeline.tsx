import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { SparklesIcon } from '@/components/icons';
import type { ReportPayload } from '../types';

export function MyPointsTimeline({ payload }: { payload: ReportPayload }) {
  if (payload.rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center">
        <SparklesIcon className="mx-auto h-7 w-7 text-slate-300" />
        <div className="mt-2 text-sm text-slate-500">No points logged yet.</div>
      </div>
    );
  }
  const data = [...payload.rows].sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  );
  return (
    <div className="h-72">
      <ResponsiveContainer>
        <LineChart data={data as object[]}>
          <CartesianGrid stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="date" fontSize={10} stroke="#94a3b8" />
          <YAxis fontSize={10} stroke="#94a3b8" />
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              fontSize: 12,
            }}
          />
          <Line
            dataKey="points"
            stroke="#6836a0"
            strokeWidth={2.5}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

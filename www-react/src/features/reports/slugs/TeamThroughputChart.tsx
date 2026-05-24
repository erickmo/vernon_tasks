import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from 'recharts';
import { TrendingUpIcon } from '@/components/icons';
import type { ReportPayload } from '../types';

export function TeamThroughputChart({ payload }: { payload: ReportPayload }) {
  if (payload.rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center">
        <TrendingUpIcon className="mx-auto h-7 w-7 text-slate-300" />
        <div className="mt-2 text-sm text-slate-500">
          No completed tasks to chart.
        </div>
      </div>
    );
  }
  return (
    <div className="h-72">
      <ResponsiveContainer>
        <LineChart data={payload.rows as object[]}>
          <CartesianGrid stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="week" fontSize={10} stroke="#94a3b8" />
          <YAxis fontSize={10} stroke="#94a3b8" />
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            dataKey="velocity"
            stroke="#6836a0"
            strokeWidth={2.5}
            dot={false}
          />
          <Line
            dataKey="cycle_hours"
            stroke="#0ea5e9"
            strokeWidth={2.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

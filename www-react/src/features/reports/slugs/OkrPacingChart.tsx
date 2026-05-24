import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  CartesianGrid,
} from 'recharts';
import { TargetIcon } from '@/components/icons';
import type { ReportPayload } from '../types';

export function OkrPacingChart({ payload }: { payload: ReportPayload }) {
  if (payload.rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center">
        <TargetIcon className="mx-auto h-7 w-7 text-slate-300" />
        <div className="mt-2 text-sm text-slate-500">No KRs to chart.</div>
      </div>
    );
  }
  return (
    <div className="h-72">
      <ResponsiveContainer>
        <BarChart data={payload.rows as object[]}>
          <CartesianGrid stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="kr"
            fontSize={10}
            interval={0}
            angle={-30}
            textAnchor="end"
            height={70}
            stroke="#94a3b8"
          />
          <YAxis fontSize={10} stroke="#94a3b8" />
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              fontSize: 12,
            }}
          />
          <Bar dataKey="gap" radius={[6, 6, 0, 0]}>
            {payload.rows.map((r, i) => (
              <Cell
                key={i}
                fill={Number(r.gap) >= 0 ? '#10b981' : '#f43f5e'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

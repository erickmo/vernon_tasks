import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { ReportPayload } from '../types';

export function OkrPacingChart({ payload }: { payload: ReportPayload }) {
  if (payload.rows.length === 0) {
    return <p className="text-xs text-slate-500">No KRs to chart.</p>;
  }
  return (
    <div className="h-72">
      <ResponsiveContainer>
        <BarChart data={payload.rows as object[]}>
          <XAxis
            dataKey="kr"
            fontSize={10}
            interval={0}
            angle={-30}
            textAnchor="end"
            height={70}
          />
          <YAxis fontSize={10} />
          <Tooltip />
          <Bar dataKey="gap">
            {payload.rows.map((r, i) => (
              <Cell
                key={i}
                fill={Number(r.gap) >= 0 ? '#10b981' : '#ef4444'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

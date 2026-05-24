import clsx from 'clsx';
import { CalendarIcon } from '@/components/icons';
import type { ReportPayload } from '../types';

function bucket(v: number): string {
  if (v >= 75) return 'bg-emerald-500';
  if (v >= 50) return 'bg-amber-500';
  return 'bg-rose-500';
}

export function ProjectHealthHeatmap({ payload }: { payload: ReportPayload }) {
  const weekKeys = ((payload.viz?.x_keys as string[]) ?? []).filter(Boolean);
  if (weekKeys.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center">
        <CalendarIcon className="mx-auto h-7 w-7 text-slate-300" />
        <div className="mt-2 text-sm text-slate-500">
          No week buckets to display.
        </div>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="text-xs">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-slate-500">
            <th className="text-left p-1.5 font-medium">Project</th>
            {weekKeys.map((k) => (
              <th key={k} className="p-1.5 font-medium tabular-nums">
                {k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {payload.rows.map((row, i) => (
            <tr
              key={(row.project_id as string) ?? i}
              className="hover:bg-slate-50/60 transition-colors"
            >
              <td className="p-1.5 text-slate-700">
                {String(row.project_name ?? '')}
              </td>
              {weekKeys.map((k) => {
                const v = Number(row[k] ?? 0);
                return (
                  <td key={k} className="p-1.5">
                    <div
                      className={clsx(
                        'w-9 h-7 rounded-lg text-white text-[10px] font-medium flex items-center justify-center tabular-nums shadow-sm',
                        bucket(v),
                      )}
                    >
                      {Math.round(v)}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

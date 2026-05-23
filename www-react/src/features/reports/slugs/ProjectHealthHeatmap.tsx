import clsx from 'clsx';
import type { ReportPayload } from '../types';

function bucket(v: number): string {
  if (v >= 75) return 'bg-emerald-500';
  if (v >= 50) return 'bg-amber-500';
  return 'bg-red-500';
}

export function ProjectHealthHeatmap({ payload }: { payload: ReportPayload }) {
  const weekKeys = ((payload.viz?.x_keys as string[]) ?? []).filter(Boolean);
  if (weekKeys.length === 0) {
    return (
      <p className="text-xs text-slate-500">No week buckets to display.</p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="text-xs">
        <thead>
          <tr>
            <th className="text-left p-1">Project</th>
            {weekKeys.map((k) => (
              <th key={k} className="p-1">
                {k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {payload.rows.map((row, i) => (
            <tr key={(row.project_id as string) ?? i}>
              <td className="p-1">{String(row.project_name ?? '')}</td>
              {weekKeys.map((k) => {
                const v = Number(row[k] ?? 0);
                return (
                  <td key={k} className="p-1">
                    <div
                      className={clsx(
                        'w-8 h-6 rounded text-white text-[10px] flex items-center justify-center',
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

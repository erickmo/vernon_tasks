import type { ReportPayload } from '../types';

export function BurndownArchiveList({ payload }: { payload: ReportPayload }) {
  if (payload.rows.length === 0) {
    return <p className="text-xs text-slate-500">No archived sprints.</p>;
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
      {payload.rows.map((r, i) => (
        <div
          key={i}
          className="border border-slate-200 dark:border-slate-800 rounded p-3 text-xs"
        >
          <div className="font-medium">{String(r.sprint ?? '')}</div>
          <div className="text-slate-500">{String(r.project ?? '')}</div>
          <div className="mt-2">
            Velocity: <strong>{String(r.velocity ?? 0)}</strong>
          </div>
          <div className="text-[11px] mt-1">{String(r.outcome ?? '')}</div>
        </div>
      ))}
    </div>
  );
}

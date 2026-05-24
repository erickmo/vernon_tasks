import { PackageIcon } from '@/components/icons';
import type { ReportPayload } from '../types';

export function BurndownArchiveList({ payload }: { payload: ReportPayload }) {
  if (payload.rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center">
        <PackageIcon className="mx-auto h-7 w-7 text-slate-300" />
        <div className="mt-2 text-sm text-slate-500">No archived sprints.</div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {payload.rows.map((r, i) => (
        <div key={i} className="card-hover p-4">
          <div className="text-[13px] font-semibold tracking-tight text-slate-900">
            {String(r.sprint ?? '')}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {String(r.project ?? '')}
          </div>
          <div className="mt-3 flex items-center gap-1.5">
            <span className="chip-brand tabular-nums">
              {String(r.velocity ?? 0)} pts
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-2">
            {String(r.outcome ?? '')}
          </div>
        </div>
      ))}
    </div>
  );
}

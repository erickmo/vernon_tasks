import type { ReportPayload } from '../types';

/**
 * The ReportShell already renders the data table; this viz adds a brief
 * count summary above it (the canonical "table-only" report).
 */
export function RiskLogTable({ payload }: { payload: ReportPayload }) {
  return (
    <div className="flex items-center gap-2">
      <span className="chip-amber tabular-nums">{payload.rows.length}</span>
      <span className="text-xs text-slate-500">
        risk events in the last 30 days.
      </span>
    </div>
  );
}

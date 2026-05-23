import type { ReportPayload } from '../types';

/**
 * The ReportShell already renders the data table; this viz adds a brief
 * count summary above it (the canonical "table-only" report).
 */
export function RiskLogTable({ payload }: { payload: ReportPayload }) {
  return (
    <div className="text-xs text-slate-500 mb-2">
      {payload.rows.length} risk events in the last 30 days.
    </div>
  );
}

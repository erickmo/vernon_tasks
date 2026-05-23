import { useState } from 'react';
import { downloadBlob, exportReport } from './reportsApi';
import type { ReportExportFormat, ReportFilters } from './types';

export function ExportToolbar({
  slug,
  filters,
  onSchedule,
  onRefresh,
}: {
  slug: string;
  filters: ReportFilters;
  onSchedule: () => void;
  onRefresh: () => void;
}) {
  const [busy, setBusy] = useState<null | ReportExportFormat>(null);

  async function exportAs(format: ReportExportFormat) {
    setBusy(format);
    try {
      const blob = await exportReport(slug, filters, format);
      downloadBlob(blob, `${slug}.${format}`);
    } finally {
      setBusy(null);
    }
  }

  const btn =
    'text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60';

  return (
    <div className="flex items-center gap-2 mb-4">
      <button type="button" onClick={onRefresh} className={btn}>
        Refresh
      </button>
      <button
        type="button"
        onClick={() => exportAs('csv')}
        disabled={busy === 'csv'}
        className={btn}
      >
        {busy === 'csv' ? 'Exporting…' : 'CSV'}
      </button>
      <button
        type="button"
        onClick={() => exportAs('pdf')}
        disabled={busy === 'pdf'}
        className={btn}
      >
        {busy === 'pdf' ? 'Exporting…' : 'PDF'}
      </button>
      <button type="button" onClick={onSchedule} className={btn}>
        Schedule
      </button>
    </div>
  );
}

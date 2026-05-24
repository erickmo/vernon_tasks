import { useState } from 'react';
import { useClickOutside } from '@/hooks/useClickOutside';
import { downloadBlob, exportReport } from './reportsApi';
import type { ReportExportFormat, ReportFilters } from './types';

const FORMATS: { value: ReportExportFormat; label: string; hint: string }[] = [
  { value: 'csv', label: 'CSV', hint: 'Spreadsheet' },
  { value: 'pdf', label: 'PDF', hint: 'Printable' },
];

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
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));

  async function exportAs(format: ReportExportFormat) {
    setOpen(false);
    setBusy(format);
    try {
      const blob = await exportReport(slug, filters, format);
      downloadBlob(blob, `${slug}.${format}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <button
        type="button"
        onClick={onRefresh}
        className="btn-secondary btn-sm"
      >
        Refresh
      </button>
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={busy !== null}
          className="btn-secondary btn-sm"
          aria-haspopup="menu"
          aria-expanded={open}
        >
          {busy ? `Exporting ${busy.toUpperCase()}…` : 'Export'}
          <svg
            className="h-3 w-3 text-slate-400"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="m3 4.5 3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {open && (
          <div className="menu absolute right-0 mt-2 w-44 z-50 py-1.5">
            {FORMATS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => exportAs(f.value)}
                className="menu-item justify-between"
              >
                <span>{f.label}</span>
                <span className="text-[11px] text-slate-400">{f.hint}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onSchedule}
        className="btn-primary btn-sm"
      >
        Schedule
      </button>
    </div>
  );
}

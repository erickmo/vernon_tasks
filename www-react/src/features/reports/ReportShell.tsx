import { ReactNode } from 'react';
import { SectionHead } from '@/components/SectionHead';
import { FilterPanel } from './FilterPanel';
import { ExportToolbar } from './ExportToolbar';
import { NarrativePanel } from './NarrativePanel';
import { NoteIcon } from '@/components/icons';
import type { ReportColumn, ReportFilters, ReportPayload } from './types';

function isNumericCol(c: ReportColumn): boolean {
  return c.type === 'number';
}

export function ReportShell({
  payload,
  filters,
  onFiltersChange,
  onSchedule,
  onRefresh,
  vizSlot,
}: {
  payload: ReportPayload;
  filters: ReportFilters;
  onFiltersChange: (f: ReportFilters) => void;
  onSchedule: () => void;
  onRefresh: () => void;
  vizSlot: ReactNode;
}) {
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
            {today}
          </div>
          <h1 className="text-[28px] md:text-[32px] font-semibold tracking-tight text-slate-900 mt-1">
            {payload.title}
          </h1>
        </div>
      </header>

      <FilterPanel value={filters} onChange={onFiltersChange} />
      <ExportToolbar
        slug={payload.slug}
        filters={filters}
        onSchedule={onSchedule}
        onRefresh={onRefresh}
      />

      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1 min-w-0 space-y-4">
          <div className="card p-5">
            <SectionHead title="Visualization" />
            {vizSlot}
          </div>

          <div className="card p-5">
            <SectionHead title="Data" hint={`${payload.rows.length} rows`} />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wider text-slate-500 sticky top-0 bg-white">
                  <tr className="border-b border-slate-100">
                    {payload.columns.map((c) => (
                      <th
                        key={c.key}
                        className={`py-2.5 pr-3 font-medium ${
                          isNumericCol(c) ? 'text-right tabular-nums' : ''
                        }`}
                      >
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payload.rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={payload.columns.length}
                        className="py-10 text-center"
                      >
                        <div className="rounded-2xl border border-dashed border-slate-200 mx-auto max-w-sm py-8">
                          <NoteIcon className="mx-auto h-7 w-7 text-slate-300" />
                          <div className="mt-2 text-sm text-slate-500">
                            No data.
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    payload.rows.map((row, i) => (
                      <tr
                        key={i}
                        className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors"
                      >
                        {payload.columns.map((c) => (
                          <td
                            key={c.key}
                            className={`py-2.5 pr-3 text-slate-700 ${
                              isNumericCol(c) ? 'text-right tabular-nums' : ''
                            }`}
                          >
                            {String(row[c.key] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <NarrativePanel items={payload.narrative} />
      </div>
    </div>
  );
}

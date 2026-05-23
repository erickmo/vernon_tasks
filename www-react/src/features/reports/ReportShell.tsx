import { ReactNode } from 'react';
import { FilterPanel } from './FilterPanel';
import { ExportToolbar } from './ExportToolbar';
import { NarrativePanel } from './NarrativePanel';
import type { ReportFilters, ReportPayload } from './types';

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
  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">{payload.title}</h1>
      <FilterPanel value={filters} onChange={onFiltersChange} />
      <ExportToolbar
        slug={payload.slug}
        filters={filters}
        onSchedule={onSchedule}
        onRefresh={onRefresh}
      />
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1 min-w-0">
          {vizSlot}
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  {payload.columns.map((c) => (
                    <th key={c.key} className="py-2 pr-3">
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
                      className="py-4 text-center text-slate-500"
                    >
                      No data.
                    </td>
                  </tr>
                ) : (
                  payload.rows.map((row, i) => (
                    <tr
                      key={i}
                      className="border-b border-slate-100 dark:border-slate-900"
                    >
                      {payload.columns.map((c) => (
                        <td key={c.key} className="py-2 pr-3">
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
        <NarrativePanel items={payload.narrative} />
      </div>
    </div>
  );
}

import { useState } from 'react';
import type { ReportFilters } from './types';

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function defaultFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return ymd(d);
}

export function FilterPanel({
  value,
  onChange,
}: {
  value: ReportFilters;
  onChange: (f: ReportFilters) => void;
}) {
  const [from, setFrom] = useState<string>(
    (value.from as string | undefined) ?? defaultFrom(),
  );
  const [to, setTo] = useState<string>(
    (value.to as string | undefined) ?? ymd(new Date()),
  );

  function apply() {
    onChange({ ...value, from, to });
  }

  return (
    <div className="flex items-end gap-3 mb-4">
      <div>
        <label htmlFor="report-from" className="block text-xs text-slate-500">
          From
        </label>
        <input
          id="report-from"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="text-sm border border-slate-300 dark:border-slate-700 rounded px-2 py-1 bg-transparent"
        />
      </div>
      <div>
        <label htmlFor="report-to" className="block text-xs text-slate-500">
          To
        </label>
        <input
          id="report-to"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="text-sm border border-slate-300 dark:border-slate-700 rounded px-2 py-1 bg-transparent"
        />
      </div>
      <button
        type="button"
        onClick={apply}
        className="text-xs bg-purple-600 text-white px-3 py-1.5 rounded hover:bg-purple-700"
      >
        Apply
      </button>
    </div>
  );
}

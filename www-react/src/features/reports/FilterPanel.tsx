import { useState } from 'react';
import { DatePicker } from '@/components/DatePicker';
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
    <div className="card p-4 mb-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[180px]">
          <label
            htmlFor="report-from"
            className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1"
          >
            From
          </label>
          <DatePicker id="report-from" value={from} onChange={setFrom} />
        </div>
        <div className="flex-1 min-w-[180px]">
          <label
            htmlFor="report-to"
            className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1"
          >
            To
          </label>
          <DatePicker id="report-to" value={to} onChange={setTo} />
        </div>
        <button type="button" onClick={apply} className="btn-primary btn-sm">
          Apply
        </button>
      </div>
    </div>
  );
}

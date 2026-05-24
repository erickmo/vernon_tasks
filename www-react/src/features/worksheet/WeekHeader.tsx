import { addDays, format, parseISO, startOfWeek } from 'date-fns';

export function thisMondayISO(): string {
  return format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
}

export function WeekHeader({
  weekStart,
  capacityUsedPct,
  capacityHours,
  onPrev,
  onNext,
  onToday,
  view,
  onViewChange,
}: {
  weekStart: string;
  capacityUsedPct: number;
  capacityHours: number;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  view: 'week' | 'today' | 'next';
  onViewChange: (v: 'week' | 'today' | 'next') => void;
}) {
  const start = parseISO(weekStart);
  const end = addDays(start, 6);
  const usedHours = Math.round(capacityUsedPct * capacityHours);
  const overCapacity = capacityUsedPct > 1;
  const nearCapacity = capacityUsedPct > 0.8 && !overCapacity;
  const barGradient = overCapacity
    ? 'from-rose-500 to-rose-400'
    : nearCapacity
      ? 'from-amber-500 to-amber-400'
      : 'from-brand to-brand-hover';

  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Worksheet
        </div>
        <h1 className="mt-1 text-[28px] font-bold tracking-tight text-slate-900 sm:text-[32px]">
          {format(start, 'MMM d')} – {format(end, 'MMM d, yyyy')}
        </h1>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <button onClick={onPrev} aria-label="Previous week" className="btn-icon">
            ‹
          </button>
          <button onClick={onToday} className="btn-secondary btn-sm">
            Today
          </button>
          <button onClick={onNext} aria-label="Next week" className="btn-icon">
            ›
          </button>
        </div>
        <select
          value={view}
          onChange={(e) => onViewChange(e.target.value as 'week' | 'today' | 'next')}
          className="input h-9 w-auto px-3 text-[13px]"
        >
          <option value="week">This Week</option>
          <option value="today">Today</option>
          <option value="next">Next Week</option>
        </select>
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium tabular-nums text-slate-600">
            {usedHours}h / {capacityHours}h
          </span>
          <div className="h-2 w-40 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${barGradient}`}
              style={{ width: `${Math.min(100, capacityUsedPct * 100)}%` }}
            />
          </div>
        </div>
      </div>
    </header>
  );
}

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
  const barColor =
    capacityUsedPct > 1 ? 'bg-risk-red' : capacityUsedPct > 0.8 ? 'bg-risk-amber' : 'bg-risk-green';

  return (
    <header className="flex items-center gap-3 mb-4">
      <div className="flex items-center gap-1">
        <button
          onClick={onPrev}
          aria-label="Previous week"
          className="w-8 h-8 rounded border border-slate-300 dark:border-slate-700"
        >
          «
        </button>
        <button
          onClick={onToday}
          className="text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-700"
        >
          Today
        </button>
        <button
          onClick={onNext}
          aria-label="Next week"
          className="w-8 h-8 rounded border border-slate-300 dark:border-slate-700"
        >
          »
        </button>
      </div>
      <h1 className="font-semibold text-lg">
        {format(start, 'MMM d')} – {format(end, 'MMM d, yyyy')}
      </h1>
      <select
        value={view}
        onChange={(e) => onViewChange(e.target.value as 'week' | 'today' | 'next')}
        className="text-xs bg-transparent border border-slate-300 dark:border-slate-700 rounded px-2 py-1"
      >
        <option value="week">This Week</option>
        <option value="today">Today</option>
        <option value="next">Next Week</option>
      </select>
      <div className="ml-auto flex items-center gap-3">
        <span className="text-xs text-slate-500">
          Capacity: {usedHours}h / {capacityHours}h
        </span>
        <div className="w-40 h-2 bg-slate-200 dark:bg-slate-700 rounded overflow-hidden">
          <div
            className={barColor}
            style={{ width: `${Math.min(100, capacityUsedPct * 100)}%`, height: '100%' }}
          />
        </div>
      </div>
    </header>
  );
}

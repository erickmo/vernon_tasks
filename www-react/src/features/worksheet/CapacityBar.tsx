import clsx from 'clsx';

export function CapacityBar({ scheduled, capacity }: { scheduled: number; capacity: number }) {
  const pct = capacity ? scheduled / capacity : 0;
  const color = pct > 1 ? 'bg-risk-red' : pct > 0.8 ? 'bg-risk-amber' : 'bg-risk-green';
  return (
    <div className="mt-auto">
      <div className="h-1.5 rounded bg-slate-200 dark:bg-slate-700 overflow-hidden">
        <div className={clsx('h-full', color)} style={{ width: `${Math.min(100, pct * 100)}%` }} />
      </div>
      <div className="text-[10px] text-slate-500 text-center mt-1">
        {scheduled}h / {capacity}h
      </div>
    </div>
  );
}

import clsx from 'clsx';

export function CapacityBar({ scheduled, capacity }: { scheduled: number; capacity: number }) {
  const pct = capacity ? scheduled / capacity : 0;
  const over = pct > 1;
  const near = pct > 0.8 && !over;
  const gradient = over
    ? 'from-rose-500 to-rose-400'
    : near
      ? 'from-amber-500 to-amber-400'
      : 'from-brand to-brand-hover';
  return (
    <div className="mt-auto">
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={clsx('h-full rounded-full bg-gradient-to-r', gradient)}
          style={{ width: `${Math.min(100, pct * 100)}%` }}
        />
      </div>
      <div className="mt-1 text-center text-[10px] tabular-nums text-slate-500">
        {scheduled}h / {capacity}h
      </div>
    </div>
  );
}

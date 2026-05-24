import { Link } from 'react-router-dom';
import { Sparkline } from './Sparkline';
import type { SprintCardData } from '../types';

const PERCENT_MULTIPLIER = 100;
const SPARK_HEIGHT = 32;

export function SprintCard({ sprint }: { sprint: SprintCardData }) {
  const pct = Math.round(sprint.percent_done * PERCENT_MULTIPLIER);
  return (
    <Link
      to={`/portal/projects?sprint=${sprint.id}`}
      className="block min-w-[260px] card-hover p-4 hover:-translate-y-0.5"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold text-[14px] text-slate-900 truncate">{sprint.name}</span>
        <span className="chip-slate shrink-0">{sprint.days_left}d</span>
      </div>
      <div className="mt-4 h-2 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand to-brand-hover transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-[11px] text-slate-500 font-medium">{pct}% done</span>
      </div>
      <div className="mt-2 text-brand">
        <Sparkline data={sprint.burndown_spark} height={SPARK_HEIGHT} />
      </div>
    </Link>
  );
}

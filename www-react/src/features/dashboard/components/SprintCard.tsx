import { Link } from 'react-router-dom';
import { Sparkline } from './Sparkline';
import type { SprintCardData } from '../types';

const PERCENT_MULTIPLIER = 100;
const SPARK_HEIGHT = 28;

export function SprintCard({ sprint }: { sprint: SprintCardData }) {
  return (
    <Link
      to={`/portal/projects?sprint=${sprint.id}`}
      className="block min-w-[220px] rounded-lg border border-slate-200 dark:border-slate-800 p-3 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium truncate">{sprint.name}</span>
        <span className="text-xs text-slate-500">{sprint.days_left}d</span>
      </div>
      <div className="mt-1 h-1.5 rounded bg-slate-200 dark:bg-slate-700 overflow-hidden">
        <div
          className="h-full bg-brand"
          style={{ width: `${Math.round(sprint.percent_done * PERCENT_MULTIPLIER)}%` }}
        />
      </div>
      <div className="mt-2 text-brand">
        <Sparkline data={sprint.burndown_spark} height={SPARK_HEIGHT} />
      </div>
    </Link>
  );
}

import { Link } from 'react-router-dom';
import { HealthDot } from './HealthDot';
import type { ProjectCardData } from '../types';

const PERCENT_MULTIPLIER = 100;

export function ProjectCard({ project }: { project: ProjectCardData }) {
  const okrPercent = Math.round(project.okr_progress * PERCENT_MULTIPLIER);
  return (
    <Link
      to={`/portal/projects/${project.id}`}
      className="block rounded-lg border border-slate-200 dark:border-slate-800 p-4 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800"
    >
      <div className="flex items-start gap-2">
        <HealthDot bucket={project.health} />
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{project.name}</div>
          <div className="text-xs text-slate-500 mt-0.5">
            {project.my_role}
            {project.days_left !== null && ` · ${project.days_left}d left`}
            {project.blocked_count > 0 && (
              <span className="ml-1 text-risk-red">· {project.blocked_count} blocked</span>
            )}
          </div>
        </div>
      </div>
      <div className="mt-3 h-1.5 rounded bg-slate-200 dark:bg-slate-700 overflow-hidden">
        <div className="h-full bg-brand" style={{ width: `${okrPercent}%` }} />
      </div>
      <div className="mt-1 text-[10px] text-slate-500">OKR {okrPercent}%</div>
    </Link>
  );
}

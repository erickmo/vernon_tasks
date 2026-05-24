import { Link } from 'react-router-dom';
import { HealthDot } from './HealthDot';
import type { ProjectCardData } from '../types';

const PERCENT_MULTIPLIER = 100;

export function ProjectCard({ project }: { project: ProjectCardData }) {
  const okrPercent = Math.round(project.okr_progress * PERCENT_MULTIPLIER);
  return (
    <Link
      to={`/portal/projects/${project.id}`}
      className="block card-hover p-5 hover:-translate-y-0.5"
    >
      <div className="flex items-start gap-3">
        <HealthDot bucket={project.health} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-slate-900 truncate text-[15px]">{project.name}</div>
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <span className="chip-slate">{project.my_role}</span>
            {project.days_left !== null && (
              <span className="chip-slate">{project.days_left}d left</span>
            )}
            {project.blocked_count > 0 && (
              <span className="chip-red">{project.blocked_count} blocked</span>
            )}
          </div>
        </div>
      </div>
      <div className="mt-5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">OKR progress</span>
          <span className="text-xs font-semibold text-slate-700 tabular-nums">{okrPercent}%</span>
        </div>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand to-brand-hover transition-all"
            style={{ width: `${okrPercent}%` }}
          />
        </div>
      </div>
    </Link>
  );
}

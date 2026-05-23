import { Link } from 'react-router-dom';
import { HealthDot } from '@/features/dashboard/components/HealthDot';
import type { HealthBucket } from '@/features/dashboard/types';
import type { ProjectDetail } from '../types';

function bucket(score: number): HealthBucket {
  if (score >= 75) return 'green';
  if (score >= 50) return 'amber';
  return 'red';
}

export function DetailHeader({ project }: { project: ProjectDetail }) {
  return (
    <header className="sticky top-12 z-10 bg-white/80 dark:bg-slate-950/80 backdrop-blur border-b border-slate-200 dark:border-slate-800 -mx-6 px-6 py-3 mb-4">
      <div className="flex items-center gap-3 text-sm">
        <Link to="/portal/projects" className="text-slate-500 hover:underline">
          Projects
        </Link>
        <span className="text-slate-400">/</span>
        <h1 className="font-semibold">{project.title}</h1>
        <HealthDot bucket={bucket(project.health_score)} />
        {project.blocked_count > 0 && (
          <span className="text-xs text-risk-red ml-2">{project.blocked_count} blocked</span>
        )}
      </div>
    </header>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { HealthDot } from '@/features/dashboard/components/HealthDot';
import type { HealthBucket } from '@/features/dashboard/types';
import {
  ProjectFormModal,
  type ProjectFormMode,
} from '@/components/ProjectFormModal';
import { KEY, getProjectPermissions } from '../projectsApi';
import type { ProjectDetail } from '../types';

function bucket(score: number): HealthBucket {
  if (score >= 75) return 'green';
  if (score >= 50) return 'amber';
  return 'red';
}

export function DetailHeader({ project }: { project: ProjectDetail }) {
  const { data: perms } = useQuery({
    queryKey: KEY.permissions(),
    queryFn: getProjectPermissions,
    staleTime: 5 * 60 * 1000,
  });
  const [modalMode, setModalMode] = useState<ProjectFormMode | null>(null);

  return (
    <header>
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
        <Link to="/portal/projects" className="hover:text-slate-700">
          Projects
        </Link>
        <span className="text-slate-300">/</span>
        <span className="text-slate-400 normal-case tracking-normal">Detail</span>
      </div>
      <div className="mt-1 flex items-center gap-3">
        <h1 className="text-[28px] font-bold tracking-tight text-slate-900">{project.title}</h1>
        <HealthDot bucket={bucket(project.health_score)} />
        {project.blocked_count > 0 && (
          <span className="chip-red">{project.blocked_count} blocked</span>
        )}
        {perms?.can_write && (
          <button
            type="button"
            onClick={() =>
              setModalMode({
                kind: 'edit',
                projectId: project.id,
                initial: {
                  title: project.title,
                  project_owner: project.project_owner ?? project.project_lead ?? '',
                  project_leader: project.project_leader ?? project.project_lead ?? '',
                  start_date: project.start_date ?? '',
                  end_date: project.end_date ?? '',
                  status: (project.status as any) ?? 'Open',
                  pdca_phase: (project.pdca_phase as any) ?? 'PLAN',
                  objective: project.linked_objective ?? '',
                  blocked_days_threshold: project.blocked_days_threshold ?? null,
                  slip_pct_threshold: project.slip_pct_threshold ?? null,
                  capacity_pct_threshold: project.capacity_pct_threshold ?? null,
                  team_members: project.team_members ?? [],
                },
              })
            }
            className="btn-ghost btn-sm ml-auto"
          >
            Edit
          </button>
        )}
      </div>

      <ProjectFormModal
        open={modalMode !== null}
        mode={modalMode}
        onClose={() => setModalMode(null)}
      />
    </header>
  );
}

import { useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { SectionHead } from '@/components/SectionHead';
import { TargetIcon } from '@/components/icons';
import type { ProjectDetail } from '../../types';

type OkrPayload = {
  objective: { id: string; title: string; phase: string } | null;
  key_results: {
    id: string;
    title: string;
    target: number;
    current: number;
    pace_expected: number;
  }[];
};

async function fetchOkr(projectId: string): Promise<OkrPayload> {
  const res = await api.get<{ message: OkrPayload }>(
    '/api/method/vernon_tasks.task.api.portal_okr.get_for_project',
    { params: { project_id: projectId } },
  );
  return res.data.message;
}

export function OkrTab() {
  const project = useOutletContext<ProjectDetail>();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['project', project.id, 'okr'],
    queryFn: () => fetchOkr(project.id),
  });
  if (isLoading)
    return <div className="card p-8 text-center text-sm text-slate-500">Loading…</div>;
  if (isError || !data)
    return <div className="card p-8 text-center text-sm text-rose-600">Failed to load OKR.</div>;
  if (!data.objective)
    return (
      <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white/40 p-12 text-center">
        <TargetIcon className="mx-auto h-8 w-8 text-slate-300" />
        <p className="mt-3 text-sm text-slate-500">No linked objective.</p>
      </div>
    );

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <SectionHead
          title={data.objective.title}
          hint={<span className="chip-slate">Phase: {data.objective.phase}</span>}
        />
      </section>
      <ul className="space-y-3">
        {data.key_results.map((kr) => {
          const progress = kr.target ? kr.current / kr.target : 0;
          const gap = progress - kr.pace_expected;
          return (
            <li key={kr.id} className="card p-4">
              <div className="flex justify-between items-baseline gap-3">
                <span className="font-medium text-slate-900">{kr.title}</span>
                <span className="text-xs text-slate-500 tabular-nums">
                  {kr.current}/{kr.target}
                </span>
              </div>
              <div className="h-2 mt-3 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-brand to-brand-hover"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
              <p className="mt-2">
                {gap >= 0 ? (
                  <span className="chip-green">
                    +{Math.round(gap * 100)}pp vs pace
                  </span>
                ) : (
                  <span className="chip-red">
                    {Math.round(gap * 100)}pp vs pace
                  </span>
                )}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

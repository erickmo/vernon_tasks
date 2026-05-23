import { useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
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
  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (isError || !data) return <p className="text-sm text-risk-red">Failed to load OKR.</p>;
  if (!data.objective) return <p className="text-sm text-slate-500">No linked objective.</p>;

  return (
    <div className="space-y-4">
      <div className="border border-slate-200 dark:border-slate-800 rounded p-4">
        <h2 className="font-semibold">{data.objective.title}</h2>
        <p className="text-xs text-slate-500">Phase: {data.objective.phase}</p>
      </div>
      <ul className="space-y-2">
        {data.key_results.map((kr) => {
          const progress = kr.target ? kr.current / kr.target : 0;
          const gap = progress - kr.pace_expected;
          return (
            <li
              key={kr.id}
              className="border border-slate-200 dark:border-slate-800 rounded p-3 text-sm"
            >
              <div className="flex justify-between items-baseline">
                <span className="font-medium">{kr.title}</span>
                <span className="text-xs">
                  {kr.current}/{kr.target}
                </span>
              </div>
              <div className="h-1.5 mt-2 rounded bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div
                  className="h-full bg-brand"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
              <p className={`text-xs mt-1 ${gap >= 0 ? 'text-risk-green' : 'text-risk-red'}`}>
                {gap >= 0 ? '+' : ''}
                {Math.round(gap * 100)}pp vs pace
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

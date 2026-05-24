import { useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '@/lib/api';
import { SectionHead } from '@/components/SectionHead';
import { TrendingDownIcon } from '@/components/icons';
import type { ProjectDetail } from '../../types';

type BurndownPoint = { date: string; ideal: number; actual: number };

async function fetchBurndown(sprintId: string): Promise<BurndownPoint[]> {
  const res = await api.get<{ message: BurndownPoint[] }>(
    '/api/method/vernon_tasks.task.api.portal_sprints.get_burndown',
    { params: { sprint_id: sprintId } },
  );
  return res.data.message;
}

export function BurndownTab() {
  const project = useOutletContext<ProjectDetail>();
  const sprintId = project.active_sprint?.id ?? project.active_sprint?.name ?? null;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['burndown', sprintId],
    queryFn: () => fetchBurndown(sprintId!),
    enabled: !!sprintId,
  });

  if (!sprintId)
    return (
      <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white/40 p-12 text-center">
        <TrendingDownIcon className="mx-auto h-8 w-8 text-slate-300" />
        <p className="mt-3 text-sm text-slate-500">No active sprint.</p>
      </div>
    );
  if (isLoading)
    return <div className="card p-8 text-center text-sm text-slate-500">Loading burndown…</div>;
  if (isError || !data)
    return (
      <div className="card p-8 text-center text-sm text-rose-600">Failed to load burndown.</div>
    );

  return (
    <section className="card p-5">
      <SectionHead title="Burndown" hint="Ideal vs actual story points" />
      <div className="h-72">
        <ResponsiveContainer>
          <LineChart data={data}>
            <XAxis dataKey="date" fontSize={11} stroke="#94a3b8" />
            <YAxis fontSize={11} stroke="#94a3b8" />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="ideal"
              stroke="#94a3b8"
              strokeDasharray="4 4"
              dot={false}
            />
            <Line type="monotone" dataKey="actual" stroke="#6836a0" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

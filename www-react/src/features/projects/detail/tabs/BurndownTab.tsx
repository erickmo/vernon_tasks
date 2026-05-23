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

  if (!sprintId) return <p className="text-sm text-slate-500">No active sprint.</p>;
  if (isLoading) return <p className="text-sm text-slate-500">Loading burndown…</p>;
  if (isError || !data) return <p className="text-sm text-risk-red">Failed to load burndown.</p>;

  return (
    <div className="h-80 border border-slate-200 dark:border-slate-800 rounded p-4">
      <ResponsiveContainer>
        <LineChart data={data}>
          <XAxis dataKey="date" fontSize={11} />
          <YAxis fontSize={11} />
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
  );
}

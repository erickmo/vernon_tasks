import { useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ProjectDetail } from '../../types';

type MemberRow = {
  user: string;
  full_name: string;
  role: string;
  assigned_hours: number;
  capacity_hours: number;
  active_task_count: number;
};

async function fetchMembers(projectId: string): Promise<MemberRow[]> {
  const res = await api.get<{ message: MemberRow[] }>(
    '/api/method/vernon_tasks.task.api.portal_projects.get_project_members',
    { params: { project_id: projectId } },
  );
  return res.data.message;
}

export function MembersTab() {
  const project = useOutletContext<ProjectDetail>();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['project', project.id, 'members'],
    queryFn: () => fetchMembers(project.id),
  });
  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (isError || !data) return <p className="text-sm text-risk-red">Failed to load members.</p>;

  return (
    <table className="w-full text-sm">
      <thead className="text-left text-[11px] uppercase tracking-wider text-slate-500">
        <tr className="border-b border-slate-200 dark:border-slate-800">
          <th className="py-2">Member</th>
          <th>Role</th>
          <th>Assigned hrs</th>
          <th>Capacity</th>
          <th>Active tasks</th>
        </tr>
      </thead>
      <tbody>
        {data.map((m) => {
          const pct = m.capacity_hours ? m.assigned_hours / m.capacity_hours : 0;
          return (
            <tr
              key={m.user}
              className="border-b border-slate-100 dark:border-slate-900"
            >
              <td className="py-2">{m.full_name}</td>
              <td>{m.role}</td>
              <td>{m.assigned_hours}</td>
              <td>
                <span
                  className={
                    pct > 1 ? 'text-risk-red' : pct > 0.85 ? 'text-risk-amber' : ''
                  }
                >
                  {m.capacity_hours}
                </span>
              </td>
              <td>{m.active_task_count}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

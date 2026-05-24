import { useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { UsersIcon } from '@/components/icons';
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
  if (isLoading)
    return <div className="card p-8 text-center text-sm text-slate-500">Loading…</div>;
  if (isError || !data)
    return (
      <div className="card p-8 text-center text-sm text-rose-600">Failed to load members.</div>
    );

  if (data.length === 0)
    return (
      <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white/40 p-12 text-center">
        <UsersIcon className="mx-auto h-8 w-8 text-slate-300" />
        <p className="mt-3 text-sm text-slate-500">No members assigned.</p>
      </div>
    );

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="text-left text-[11px] uppercase tracking-[0.08em] text-slate-500">
          <tr className="border-b border-slate-100">
            <th className="px-4 py-3 font-medium">Member</th>
            <th className="py-3 font-medium">Role</th>
            <th className="py-3 font-medium">Assigned hrs</th>
            <th className="py-3 font-medium">Capacity</th>
            <th className="py-3 pr-4 font-medium">Active tasks</th>
          </tr>
        </thead>
        <tbody>
          {data.map((m) => {
            const pct = m.capacity_hours ? m.assigned_hours / m.capacity_hours : 0;
            return (
              <tr
                key={m.user}
                className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/60 transition-colors"
              >
                <td className="px-4 py-3 font-medium text-slate-900">{m.full_name}</td>
                <td className="py-3">
                  <span className="chip-slate">{m.role}</span>
                </td>
                <td className="py-3 tabular-nums">{m.assigned_hours}</td>
                <td className="py-3 tabular-nums">
                  {pct > 1 ? (
                    <span className="chip-red">{m.capacity_hours}</span>
                  ) : pct > 0.85 ? (
                    <span className="chip-amber">{m.capacity_hours}</span>
                  ) : (
                    <span className="text-slate-700">{m.capacity_hours}</span>
                  )}
                </td>
                <td className="py-3 pr-4 tabular-nums">{m.active_task_count}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

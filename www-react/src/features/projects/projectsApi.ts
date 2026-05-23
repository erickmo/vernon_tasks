import { api } from '@/lib/api';
import type {
  GroupBy,
  ProjectDetail,
  ProjectListFilters,
  ProjectListRow,
  TaskBucket,
} from './types';

const BASE = '/api/method/vernon_tasks.task.api.portal_projects';

export const KEY = {
  list: (f: ProjectListFilters) => ['projects', 'list', f] as const,
  detail: (id: string) => ['project', id] as const,
  tasks: (id: string, group: GroupBy) => ['project', id, 'tasks', group] as const,
};

export async function listProjects(filters: ProjectListFilters): Promise<ProjectListRow[]> {
  const res = await api.get<{ message: ProjectListRow[] }>(`${BASE}.list_projects`, {
    params: { filters: JSON.stringify(filters) },
  });
  return res.data.message;
}

export async function getProjectDetail(id: string): Promise<ProjectDetail> {
  const res = await api.get<{ message: ProjectDetail }>(`${BASE}.get_project_detail`, {
    params: { project_id: id },
  });
  return res.data.message;
}

export async function getProjectTasks(id: string, group_by: GroupBy): Promise<TaskBucket[]> {
  const res = await api.get<{ message: TaskBucket[] }>(`${BASE}.get_project_tasks`, {
    params: { project_id: id, group_by },
  });
  return res.data.message;
}

export async function bulkMoveTasks(task_ids: string[], target_sprint: string) {
  await api.post(`${BASE}.bulk_move_tasks`, { task_ids, target_sprint });
}

export async function bulkReassign(task_ids: string[], new_owner: string) {
  await api.post(`${BASE}.bulk_reassign`, { task_ids, new_owner });
}

export async function bulkPhaseShift(task_ids: string[], new_phase: string) {
  await api.post(`${BASE}.bulk_phase_shift`, { task_ids, new_phase });
}

export async function relinkTaskKr(task_ids: string[], kr_id: string | null) {
  await api.post(`${BASE}.relink_task_kr`, { task_ids, kr_id });
}

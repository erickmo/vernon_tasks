import { api } from '@/lib/api';
import type {
  GroupBy,
  ProjectDetail,
  ProjectFormValues,
  ProjectListFilters,
  ProjectListRow,
  ProjectPermissions,
  TaskBucket,
  UserOption,
} from './types';

/**
 * Projects API (ADR-022).
 *
 * Single-doc CRUD uses Frappe REST `/api/resource/VT Project`. Aggregations
 * (list with computed health/days_left/blocked_count, detail with linked
 * objective + member counts, bulk task ops) stay on `/api/method/...` —
 * these orchestrate multiple doctypes and cannot be expressed as REST CRUD.
 *
 * Doctype controller enforces validation (PDCA transitions, date order, team
 * exclusion) and Frappe's built-in link integrity blocks DELETE when tasks,
 * sprints, risks, or KPI entries still reference the project.
 */
const BASE = '/api/method/vernon_tasks.task.api.portal_projects';
const RESOURCE = '/api/resource/VT Project';

type FrappeProjectDoc = {
  name: string;
  title: string;
};

export const KEY = {
  list: (f: ProjectListFilters) => ['projects', 'list', f] as const,
  detail: (id: string) => ['project', id] as const,
  tasks: (id: string, group: GroupBy) => ['project', id, 'tasks', group] as const,
  permissions: () => ['projects', 'permissions'] as const,
};

export async function getProjectPermissions(): Promise<ProjectPermissions> {
  const res = await api.get<{ message: ProjectPermissions }>(
    `${BASE}.get_project_permissions`,
  );
  return res.data.message;
}

export async function createProject(
  payload: ProjectFormValues,
): Promise<{ id: string; title: string }> {
  // Frappe REST accepts child tables (team_members) inline in the payload.
  const res = await api.post<{ data: FrappeProjectDoc }>(RESOURCE, payload);
  return { id: res.data.data.name, title: res.data.data.title };
}

export async function updateProject(
  projectId: string,
  payload: Partial<ProjectFormValues>,
): Promise<{ id: string; updated: string[] }> {
  const res = await api.put<{ data: FrappeProjectDoc }>(
    `${RESOURCE}/${encodeURIComponent(projectId)}`,
    payload,
  );
  return { id: res.data.data.name, updated: Object.keys(payload) };
}

export async function deleteProject(projectId: string): Promise<void> {
  // Frappe link-integrity check raises LinkExistsError if tasks/sprints/etc
  // still reference this project; controller `validate` enforces the rest.
  await api.delete(`${RESOURCE}/${encodeURIComponent(projectId)}`);
}

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

export async function searchUsers(query: string, limit = 20): Promise<UserOption[]> {
  const res = await api.get<{ message: UserOption[] }>(`${BASE}.search_users`, {
    params: { query, limit },
  });
  return res.data.message ?? [];
}

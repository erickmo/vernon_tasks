import { api } from "../../../api/client";

export interface ProjectTask {
  name: string;
  title: string;
  assigned_to: string | null;
  deadline: string | null;
  priority: string;
  pdca_phase: string;
  kanban_status: string;
  base_points: number;
  completion_date: string | null;
}

export interface TaskFilters {
  pdca_phase?: string;
  assignee?: string;
}

export async function getProjectTasks(
  project: string,
  filters: TaskFilters = {},
): Promise<ProjectTask[]> {
  const params: Record<string, string | undefined> = { project };
  if (filters.pdca_phase) params.pdca_phase = filters.pdca_phase;
  if (filters.assignee) params.assignee = filters.assignee;
  return api.get<ProjectTask[]>(
    "/api/method/vernon_tasks.api.projects.get_project_tasks",
    params,
  );
}

export async function createTask(payload: {
  project: string;
  title: string;
  assigned_to?: string;
  deadline?: string;
  pdca_phase?: string;
  priority?: string;
}): Promise<ProjectTask> {
  return api.post<ProjectTask>(
    "/api/method/vernon_tasks.api.projects.create_task",
    payload,
  );
}

export async function updateTask(payload: {
  name: string;
  title?: string;
  assigned_to?: string;
  deadline?: string;
  pdca_phase?: string;
  priority?: string;
}): Promise<ProjectTask> {
  return api.post<ProjectTask>(
    "/api/method/vernon_tasks.api.projects.update_task",
    payload,
  );
}

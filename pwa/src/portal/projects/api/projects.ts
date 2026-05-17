import { api } from "../../../api/client";
import type { ProjectRow, ProjectDetail, ListFilters } from "./types";

export async function listProjects(filters: ListFilters): Promise<ProjectRow[]> {
  return api.get<ProjectRow[]>(
    "/api/method/vernon_tasks.api.projects.list_projects",
    { filters: JSON.stringify(filters) },
  );
}

export async function getProjectWithRelations(name: string): Promise<ProjectDetail> {
  return api.get<ProjectDetail>(
    "/api/method/vernon_tasks.api.projects.get_project_with_relations",
    { name },
  );
}

export async function createProject(values: Record<string, unknown>) {
  return api.post("/api/resource/VT Project", values);
}

export async function updateProject(name: string, values: Record<string, unknown>) {
  return api.put(`/api/resource/VT Project/${encodeURIComponent(name)}`, values);
}

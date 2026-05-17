import { api } from "../../../api/client";
import type { ObjectiveRow, ObjectiveDetail, ListFilters } from "./types";

export async function listObjectives(filters: ListFilters): Promise<ObjectiveRow[]> {
  return api.get<ObjectiveRow[]>(
    "/api/method/vernon_tasks.api.okr.list_objectives",
    { filters: JSON.stringify(filters) },
  );
}

export async function getObjectiveWithKrs(name: string): Promise<ObjectiveDetail> {
  return api.get<ObjectiveDetail>(
    "/api/method/vernon_tasks.api.okr.get_objective_with_krs",
    { name },
  );
}

export async function createObjective(values: Record<string, unknown>) {
  return api.post("/api/resource/Objective", values);
}

export async function updateObjective(name: string, values: Record<string, unknown>) {
  return api.put(`/api/resource/Objective/${encodeURIComponent(name)}`, values);
}

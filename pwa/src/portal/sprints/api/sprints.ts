import { api } from "../../../api/client";
import type {
  SprintRow, SprintDetail, BurndownSeries, MoveTaskPayload,
  SprintFilters, CreateSprintPayload, UpdateSprintPayload,
} from "./types";

export function listSprints(project: string, filters: SprintFilters = {}): Promise<SprintRow[]> {
  return api.get<SprintRow[]>("/api/method/vernon_tasks.api.sprints.list_sprints", {
    project, filters: JSON.stringify(filters),
  });
}

export function getSprintWithRelations(name: string): Promise<SprintDetail> {
  return api.get<SprintDetail>("/api/method/vernon_tasks.api.sprints.get_sprint_with_relations", { name });
}

export function createSprint(payload: CreateSprintPayload): Promise<{ name: string }> {
  return api.post<{ name: string }>("/api/method/vernon_tasks.api.sprints.create_sprint", { payload: JSON.stringify(payload) });
}

export function updateSprint(name: string, payload: UpdateSprintPayload): Promise<{ name: string }> {
  return api.post<{ name: string }>("/api/method/vernon_tasks.api.sprints.update_sprint", { name, payload: JSON.stringify(payload) });
}

export function bulkUpdateSprints(names: string[], payload: UpdateSprintPayload) {
  return api.post("/api/method/vernon_tasks.api.sprints.bulk_update_sprints", {
    names: JSON.stringify(names), payload: JSON.stringify(payload),
  });
}

export function moveTask(p: MoveTaskPayload) {
  const params: Record<string, unknown> = { task: p.task };
  if (p.kanban_status !== undefined) params.kanban_status = p.kanban_status;
  if (p.pdca_phase !== undefined) params.pdca_phase = p.pdca_phase;
  if (p.kanban_rank !== undefined) params.kanban_rank = p.kanban_rank;
  if (p.sprint !== undefined) params.sprint = p.sprint ?? "";
  return api.post("/api/method/vernon_tasks.api.sprints.move_task", params);
}

export function rebalanceColumn(sprint: string, axis: "kanban_status" | "pdca_phase", columnValue: string) {
  return api.post("/api/method/vernon_tasks.api.sprints.rebalance_column", {
    sprint, axis, column_value: columnValue,
  });
}

export function getSprintBurndown(sprint: string): Promise<BurndownSeries> {
  return api.get<BurndownSeries>("/api/method/vernon_tasks.api.sprints.get_sprint_burndown", { sprint });
}

import { api } from "./client";

const BASE = "/api/method/vernon_tasks.task.api.my_work_mutations";

export interface CompleteResult {
  ok: boolean;
  idempotent?: boolean;
  task_id?: string;
}

export interface LogResult {
  ok: boolean;
  actual_hours: number;
}

export interface SnoozeResult {
  ok: boolean;
  deadline: string;
}

export type SnoozeDays = 1 | 3 | 7;

export function completeTask(task_id: string): Promise<CompleteResult> {
  return api.post<CompleteResult>(`${BASE}.complete`, { task_id });
}

export function logProgress(
  task_id: string,
  hours: number,
  note: string,
): Promise<LogResult> {
  return api.post<LogResult>(`${BASE}.log_progress`, { task_id, hours, note });
}

export function snoozeTask(task_id: string, days: SnoozeDays): Promise<SnoozeResult> {
  return api.post<SnoozeResult>(`${BASE}.snooze`, { task_id, days });
}

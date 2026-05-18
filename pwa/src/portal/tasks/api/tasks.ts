import { api } from "../../../api/client";
import type { TaskDetail, ActivityEntry, CreateTaskPayload, UpdateTaskPayload } from "./types";
import type { TaskCardData } from "../../sprints/api/types";

export function getTaskDetail(task: string): Promise<TaskDetail> {
  return api.get<TaskDetail>(
    "/api/method/vernon_tasks.api.portal_tasks.get_task_detail",
    { task },
  );
}

export function updateTask(task: string, payload: UpdateTaskPayload): Promise<TaskDetail> {
  return api.post<TaskDetail>(
    "/api/method/vernon_tasks.api.portal_tasks.update_task",
    { task, payload: JSON.stringify(payload) },
  );
}

export function createTask(
  payload: CreateTaskPayload,
): Promise<{ name: string; task: TaskCardData }> {
  return api.post<{ name: string; task: TaskCardData }>(
    "/api/method/vernon_tasks.api.portal_tasks.create_task",
    { payload: JSON.stringify(payload) },
  );
}

export function getTaskComments(task: string): Promise<ActivityEntry[]> {
  return api.get<ActivityEntry[]>(
    "/api/method/vernon_tasks.api.portal_tasks.get_task_comments",
    { task },
  );
}

export function addComment(task: string, content: string): Promise<ActivityEntry> {
  return api.post<ActivityEntry>(
    "/api/method/vernon_tasks.api.portal_tasks.add_comment",
    { task, content },
  );
}

export function deleteComment(comment_name: string): Promise<{ ok: boolean }> {
  return api.post<{ ok: boolean }>(
    "/api/method/vernon_tasks.api.portal_tasks.delete_comment",
    { comment_name },
  );
}

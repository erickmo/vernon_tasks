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

// ADR-022: comment creation goes through Frappe REST. Comment doctype
// auto-checks `frappe.has_permission(reference_doctype, "read", reference_name)`
// so the previous `_assert_task_readable` guard is redundant.
type FrappeCommentDoc = {
  name: string;
  owner: string;
  creation: string;
  content: string;
  comment_type: "Comment" | "Info";
};
export async function addComment(task: string, content: string): Promise<ActivityEntry> {
  if (!content || !content.trim()) {
    throw new Error("Comment content is required");
  }
  const res = await api.post<{ data: FrappeCommentDoc }>("/api/resource/Comment", {
    comment_type: "Comment",
    reference_doctype: "VT Task",
    reference_name: task,
    content,
  });
  const d = res.data;
  return {
    type: "comment",
    name: d.name,
    owner: d.owner,
    creation: d.creation,
    content: d.content,
    comment_type: d.comment_type,
  };
}

export function deleteComment(comment_name: string): Promise<{ ok: boolean }> {
  return api.post<{ ok: boolean }>(
    "/api/method/vernon_tasks.api.portal_tasks.delete_comment",
    { comment_name },
  );
}

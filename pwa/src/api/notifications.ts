import { api } from "./client";

const BASE = "/api/method/vernon_tasks.task.api.notifications";

export interface Notification {
  name: string;
  subject: string;
  email_content?: string;
  type?: string;
  document_type?: string;
  document_name?: string;
  read: 0 | 1;
  creation: string;
}

export interface ListResult {
  results: Notification[];
}

export function listNotifications(
  limit: number = 50,
  only_unread: boolean = false,
): Promise<ListResult> {
  return api.get<ListResult>(
    `${BASE}.list?limit=${limit}&only_unread=${only_unread ? 1 : 0}`,
  );
}

export function markRead(name: string): Promise<{ ok: boolean }> {
  return api.post<{ ok: boolean }>(`${BASE}.mark_read`, { name });
}

export function markAllRead(): Promise<{ ok: boolean }> {
  return api.post<{ ok: boolean }>(`${BASE}.mark_all_read`);
}

export function countUnread(): Promise<{ count: number }> {
  return api.get<{ count: number }>(`${BASE}.count_unread`);
}

import { api } from "../../../api/client";

const BASE = "/api/method/vernon_tasks.api.portal_notifications";

export interface PortalNotification {
  name: string;
  event_type: "task_assigned" | "task_review" | "sprint_status" | "comment";
  reference_doctype: string;
  reference_name: string;
  message: string;
  is_read: 0 | 1;
  creation: string;
  user: string;
}

export interface ListResult {
  results: PortalNotification[];
  total_unread: number;
}

export interface ListParams {
  limit?: number;
  offset?: number;
  onlyUnread?: boolean;
  eventTypeFilter?: string;
}

export const portalNotificationsApi = {
  listNotifications(p: ListParams = {}): Promise<ListResult> {
    return api.get<ListResult>(`${BASE}.list_notifications`, {
      limit: String(p.limit ?? 20),
      offset: String(p.offset ?? 0),
      only_unread: p.onlyUnread ? "1" : "0",
      event_type_filter: p.eventTypeFilter ?? "",
    });
  },

  countUnread(): Promise<{ count: number }> {
    return api.get<{ count: number }>(`${BASE}.count_unread`);
  },

  markRead(name: string): Promise<{ ok: boolean }> {
    return api.post<{ ok: boolean }>(`${BASE}.mark_read`, { name });
  },

  markAllRead(): Promise<{ ok: boolean }> {
    return api.post<{ ok: boolean }>(`${BASE}.mark_all_read`, {});
  },

  getFeatureFlag(): Promise<{ enabled: boolean }> {
    return api.get<{ enabled: boolean }>(`${BASE}.get_feature_flag`);
  },
};

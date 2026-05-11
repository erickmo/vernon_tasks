import { api } from "./client";

const BASE = "/api/method/vernon_tasks.task.api.push_prefs";

export interface PushPrefs {
  event_assignment: 0 | 1;
  event_mention: 0 | 1;
  event_due: 0 | 1;
  event_review: 0 | 1;
}

export const fetchPushPrefs = () => api.get<PushPrefs>(`${BASE}.get_prefs`);

export const updatePushPrefs = (prefs: PushPrefs) =>
  api.post<{ ok: boolean }>(`${BASE}.update_prefs`, prefs);

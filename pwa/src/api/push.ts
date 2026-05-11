import { api } from "./client";

const BASE = "/api/method/vernon_tasks.task.api.push";

export const getPublicKey = () =>
  api.get<{ public_key: string }>(`${BASE}.get_public_key`);

export const subscribePush = (
  endpoint: string,
  p256dh: string,
  auth: string,
  user_agent: string,
) =>
  api.post<{ ok: boolean; renewed: boolean }>(`${BASE}.subscribe`, {
    endpoint,
    p256dh,
    auth,
    user_agent,
  });

export const unsubscribePush = (endpoint: string) =>
  api.post<{ ok: boolean }>(`${BASE}.unsubscribe`, { endpoint });

import { useQuery } from "@tanstack/react-query";
import { portalNotificationsApi, type ListParams } from "../api/portalNotifications";

export interface UseNotificationsParams extends ListParams {
  enabled?: boolean;
}

export function notificationsQueryKey(params: UseNotificationsParams) {
  return ["portal", "notif", "list", params] as const;
}

export function useNotifications(params: UseNotificationsParams = {}) {
  return useQuery({
    queryKey: notificationsQueryKey(params),
    queryFn: () => portalNotificationsApi.listNotifications(params),
    enabled: params.enabled ?? true,
    staleTime: 15_000,
  });
}

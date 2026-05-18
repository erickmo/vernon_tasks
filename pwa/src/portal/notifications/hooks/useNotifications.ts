import { useQuery } from "@tanstack/react-query";
import { portalNotificationsApi, type ListParams } from "../api/portalNotifications";

interface UseNotificationsParams extends ListParams {
  enabled?: boolean;
}

export function useNotifications(params: UseNotificationsParams = {}) {
  return useQuery({
    queryKey: ["portal", "notif", "list", params],
    queryFn: () => portalNotificationsApi.listNotifications(params),
    enabled: params.enabled ?? true,
    staleTime: 15_000,
  });
}

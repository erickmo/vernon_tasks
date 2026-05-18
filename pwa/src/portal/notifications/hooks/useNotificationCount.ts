import { useQuery } from "@tanstack/react-query";
import { portalNotificationsApi } from "../api/portalNotifications";

export function useNotificationCount() {
  return useQuery({
    queryKey: ["portal", "notif", "count"],
    queryFn: () => portalNotificationsApi.countUnread(),
    refetchInterval: 30_000,
    staleTime: 25_000,
    select: (data) => data.count,
  });
}

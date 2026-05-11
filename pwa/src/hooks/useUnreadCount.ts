import { useQuery } from "@tanstack/react-query";
import { countUnread } from "../api/notifications";

export function useUnreadCount() {
  return useQuery({
    queryKey: ["unread-count"],
    queryFn: () => countUnread().then((r) => r.count),
    refetchInterval: () =>
      typeof document !== "undefined" && document.visibilityState === "visible"
        ? 60_000
        : false,
    staleTime: 30_000,
  });
}

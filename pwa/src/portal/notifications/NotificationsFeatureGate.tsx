import { type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { portalNotificationsApi } from "./api/portalNotifications";

export function NotificationsFeatureGate({ children }: { children: ReactNode }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["portal", "notif", "featureFlag"],
    queryFn: () => portalNotificationsApi.getFeatureFlag(),
    staleTime: 60_000,
  });

  if (isLoading || isError) return null;
  if (data?.enabled !== true) return null;
  return <>{children}</>;
}

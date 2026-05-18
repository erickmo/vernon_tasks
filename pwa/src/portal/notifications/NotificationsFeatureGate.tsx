import { type ReactNode } from "react";
import { useVtSettings } from "../../hooks/useVtSettings";

export function NotificationsFeatureGate({ children }: { children: ReactNode }) {
  const { data, isLoading, isError } = useVtSettings();

  if (isLoading || isError) return null;
  if (!data?.portal_notifications_enabled) return null;
  return <>{children}</>;
}

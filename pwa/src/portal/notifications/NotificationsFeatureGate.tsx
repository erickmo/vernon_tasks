import { type ReactNode } from "react";
import { useVtSettings } from "../../hooks/useVtSettings";

export function NotificationsFeatureGate({ children }: { children: ReactNode }) {
  const settings = useVtSettings();
  if (settings.isLoading) return null;
  if (!settings.data?.portal_notifications_enabled) return null;
  return <>{children}</>;
}

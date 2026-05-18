import { type ReactNode } from "react";
import { ComingSoon } from "../pages/ComingSoon";
import { useVtSettings } from "../../hooks/useVtSettings";

export function SprintsFeatureGate({ children }: { children: ReactNode }) {
  const settings = useVtSettings();
  if (settings.isLoading) return null;
  if (!settings.data?.portal_sprints_enabled) return <ComingSoon domain="Sprints" />;
  return <>{children}</>;
}

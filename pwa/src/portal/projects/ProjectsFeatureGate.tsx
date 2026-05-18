import { type ReactNode } from "react";
import { ComingSoon } from "../pages/ComingSoon";
import { useVtSettings } from "../../hooks/useVtSettings";

export function ProjectsFeatureGate({ children }: { children: ReactNode }) {
  const settings = useVtSettings();
  if (settings.isLoading) return null;
  if (!settings.data?.portal_projects_enabled) return <ComingSoon domain="Projects" />;
  return <>{children}</>;
}

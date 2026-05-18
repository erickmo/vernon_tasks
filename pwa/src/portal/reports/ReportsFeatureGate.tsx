import { type ReactNode } from "react";
import { ComingSoon } from "../pages/ComingSoon";
import { useVtSettings } from "../../hooks/useVtSettings";

export function ReportsFeatureGate({ children }: { children: ReactNode }) {
  const settings = useVtSettings();
  if (settings.isLoading) return null;
  if (!settings.data?.portal_reports_enabled) return <ComingSoon domain="Reports" />;
  return <>{children}</>;
}

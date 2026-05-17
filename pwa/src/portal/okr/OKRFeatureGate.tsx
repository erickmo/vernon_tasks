import { type ReactNode } from "react";
import { ComingSoon } from "../pages/ComingSoon";
import { useVtSettings } from "../../hooks/useVtSettings";

export function OKRFeatureGate({ children }: { children: ReactNode }) {
  const settings = useVtSettings();
  if (settings.isLoading) return null;
  if (!settings.data?.portal_okr_enabled) return <ComingSoon domain="OKR" />;
  return <>{children}</>;
}

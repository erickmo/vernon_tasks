import { type ReactNode } from "react";
import { useVtSettings } from "../../../hooks/useVtSettings";

interface Props {
  children: ReactNode;
}

/** Renders children when VT Settings.mobile_reports_enabled is truthy.
 *  Shows a minimal mobile-friendly "coming soon" message otherwise.
 */
export function ReportsFeatureGate({ children }: Props) {
  const settings = useVtSettings();
  if (settings.isLoading) return null;
  if (!settings.data?.mobile_reports_enabled) {
    return (
      <div
        style={{
          padding: "var(--vt-space-6) var(--vt-space-4)",
          textAlign: "center",
          color: "var(--vt-text-muted)",
          fontSize: 14,
        }}
      >
        Mobile Reports belum aktif.
      </div>
    );
  }
  return <>{children}</>;
}

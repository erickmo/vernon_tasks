import { type ReactNode, useEffect } from "react";
import { useLocation } from "react-router-dom";
import * as permsHook from "../../auth/usePermissions";
import { PermissionDenied } from "../pages/PermissionDenied";
import { PageSkeleton } from "../../components/PageSkeleton";
import * as telemetry from "../../telemetry";

export interface RequirePermissionProps {
  perm: string;
  children: ReactNode;
}

export function RequirePermission({ perm, children }: RequirePermissionProps) {
  const { isLoading, hasPermission } = permsHook.usePermissions();
  const loc = useLocation();
  const allowed = !isLoading && hasPermission(perm);

  useEffect(() => {
    if (!isLoading && !allowed) {
      telemetry.trackPortalPermissionDenied(loc.pathname, perm);
    }
  }, [isLoading, allowed, loc.pathname, perm]);

  if (isLoading) return <PageSkeleton />;
  if (!allowed) return <PermissionDenied requiredPerm={perm} />;
  return <>{children}</>;
}

import { type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import * as authHook from "../../auth/useAuth";
import * as mediaHook from "../../hooks/useMediaQuery";
import { PageSkeleton } from "../../components/PageSkeleton";

const DESKTOP_MIN_WIDTH_PX = 1024;

export function PortalGuard({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = authHook.useAuth();
  const isDesktop = mediaHook.useMediaQuery(DESKTOP_MIN_WIDTH_PX);
  const loc = useLocation();

  if (isLoading) return <PageSkeleton />;
  if (!isAuthenticated) {
    const next = encodeURIComponent(loc.pathname + loc.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (!isDesktop) return <Navigate to="/m/" replace />;
  return <>{children}</>;
}

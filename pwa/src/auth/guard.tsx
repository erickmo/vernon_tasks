import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./useAuth";

export function AuthGuard() {
  const { isLoading, isAuthenticated } = useAuth();
  const loc = useLocation();

  if (isLoading) return <div style={{ padding: 24 }}>…</div>;

  if (!isAuthenticated) {
    const next = encodeURIComponent(loc.pathname + loc.search);
    return <Navigate to={`/m/login?next=${next}`} replace />;
  }

  if (!localStorage.getItem("vt_pwa_onboarded") && loc.pathname !== "/m/onboarding") {
    return <Navigate to="/m/onboarding" replace />;
  }

  return <Outlet />;
}

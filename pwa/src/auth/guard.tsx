import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { probeSession } from "./session";

export function AuthGuard() {
  const [state, setState] = useState<"loading" | "auth" | "guest">("loading");
  const loc = useLocation();

  useEffect(() => {
    probeSession()
      .then((s) => setState(s.user ? "auth" : "guest"))
      .catch(() => setState("guest"));
  }, []);

  if (state === "loading") return <div style={{ padding: 24 }}>…</div>;

  if (state === "guest") {
    const next = encodeURIComponent(loc.pathname + loc.search);
    return <Navigate to={`/m/login?next=${next}`} replace />;
  }

  if (!localStorage.getItem("vt_pwa_onboarded") && loc.pathname !== "/m/onboarding") {
    return <Navigate to="/m/onboarding" replace />;
  }

  return <Outlet />;
}

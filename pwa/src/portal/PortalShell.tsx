import { Suspense, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { PortalGuard } from "./guards/PortalGuard";
import { PortalErrorBoundary } from "./PortalErrorBoundary";
import { TopBar } from "./TopBar";
import { PortalRoutes } from "./routes";
import { PageSkeleton } from "../components/PageSkeleton";
import * as telemetry from "../telemetry";

export function PortalShell() {
  const loc = useLocation();
  useEffect(() => {
    telemetry.trackPortalPageView(loc.pathname);
  }, [loc.pathname]);

  return (
    <PortalGuard>
      <div className="portal-shell">
        <TopBar />
        <main className="portal-shell__main">
          <PortalErrorBoundary path={loc.pathname}>
            <Suspense fallback={<PageSkeleton />}>
              <PortalRoutes />
            </Suspense>
          </PortalErrorBoundary>
        </main>
      </div>
    </PortalGuard>
  );
}

export default PortalShell;

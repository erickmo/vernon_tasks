import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { BottomNav } from "./components/BottomNav";
import { TopNav } from "./components/TopNav";
import { OfflineBanner } from "./components/OfflineBanner";
import { SafeArea } from "./components/SafeArea";
import { ReloginModal } from "./components/ReloginModal";
import { ToastProvider } from "./components/Toast";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { onAuthChallenge } from "./api/client";
import { logEvent } from "./telemetry";

export function AppShell() {
  const [reloginOpen, setReloginOpen] = useState(false);
  const [resolver, setResolver] = useState<((ok: boolean) => void) | null>(null);
  const loc = useLocation();
  const isDesktop = useMediaQuery(768);

  useEffect(() => {
    onAuthChallenge(
      () =>
        new Promise<boolean>((resolve) => {
          setResolver(() => resolve);
          setReloginOpen(true);
        }),
    );
  }, []);

  useEffect(() => {
    logEvent("page_view", { route: loc.pathname });
  }, [loc.pathname]);

  return (
    <ErrorBoundary>
      <ToastProvider>
        <OfflineBanner />
        {isDesktop ? <TopNav /> : null}
        <SafeArea>
          <Outlet />
        </SafeArea>
        {isDesktop ? null : <BottomNav />}
        <ReloginModal
          open={reloginOpen}
          onResolve={(ok) => {
            setReloginOpen(false);
            resolver?.(ok);
            setResolver(null);
          }}
        />
      </ToastProvider>
    </ErrorBoundary>
  );
}

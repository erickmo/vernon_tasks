import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { AuthGuard } from "./auth/guard";
import { LoginPage } from "./auth/login";
import { AppShell } from "./AppShell";
import { MyWorkList } from "./mobile/pages/MyWork/List";
import { MyWorkDetail } from "./mobile/pages/MyWork/Detail";
import { Onboarding } from "./mobile/pages/Onboarding";
import { MePage } from "./mobile/pages/Me";
import { NotificationsPage } from "./mobile/pages/Notifications";
import { DashboardPage } from "./mobile/pages/Dashboard";
import { LeaderPage } from "./mobile/pages/Leader";
import { PushPrefsPage } from "./mobile/pages/PushPrefs";
import { PageSkeleton } from "./components/PageSkeleton";

const AnalyticsPage = lazy(() =>
  import("./mobile/pages/Analytics").then((m) => ({ default: m.AnalyticsPage })),
);
const PortalShell = lazy(() => import("./portal/PortalShell"));

function LazyAnalytics() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>…</div>}>
      <AnalyticsPage />
    </Suspense>
  );
}

function LazyPortalShell() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PortalShell />
    </Suspense>
  );
}

function RootRedirect() {
  const isDesktop =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(min-width: 1024px)").matches;
  return <Navigate to={isDesktop ? "/app" : "/m/work"} replace />;
}

function OnboardingGate() {
  if (localStorage.getItem("vt_pwa_onboarded") === "1") {
    return <Navigate to="/m/work" replace />;
  }
  return <Onboarding />;
}

export const router = createBrowserRouter([
  { path: "/", element: <RootRedirect /> },
  { path: "/m/login", element: <LoginPage /> },
  { path: "/m/onboarding", element: <OnboardingGate /> },
  { path: "/app/*", element: <LazyPortalShell /> },
  {
    element: <AuthGuard />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: "/m", element: <MyWorkList /> },
          { path: "/m/work", element: <MyWorkList /> },
          { path: "/m/work/:id", element: <MyWorkDetail /> },
          { path: "/m/dashboard", element: <DashboardPage /> },
          { path: "/m/analytics", element: <LazyAnalytics /> },
          { path: "/m/me", element: <MePage /> },
          { path: "/m/me/notifications", element: <NotificationsPage /> },
          { path: "/m/me/notifications/settings", element: <PushPrefsPage /> },
          { path: "/m/leader", element: <LeaderPage /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/m/work" replace /> },
]);

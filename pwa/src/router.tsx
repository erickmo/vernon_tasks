import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { AuthGuard } from "./auth/guard";
import { LoginPage } from "./auth/login";
import { AppShell } from "./AppShell";
import { MyWorkList } from "./mobile/pages/MyWork/List";
import { Onboarding } from "./mobile/pages/Onboarding";
import { ProjectPage } from "./mobile/pages/Project";
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
  return <Navigate to={isDesktop ? "/portal" : "/m/dashboard"} replace />;
}

function OnboardingGate() {
  if (localStorage.getItem("vt_pwa_onboarded") === "1") {
    return <Navigate to="/m/dashboard" replace />;
  }
  return <Onboarding />;
}

export const router = createBrowserRouter([
  { path: "/", element: <RootRedirect /> },
  { path: "/m/login", element: <LoginPage /> },
  { path: "/m/onboarding", element: <OnboardingGate /> },
  { path: "/portal/*", element: <LazyPortalShell /> },
  {
    element: <AuthGuard />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: "/m", element: <MyWorkList /> },
          { path: "/m/project", element: <ProjectPage /> },
          { path: "/m/work", element: <Navigate to="/m/project" replace /> },
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
  { path: "*", element: <Navigate to="/m/dashboard" replace /> },
]);

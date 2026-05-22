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
import { Landing as ReportsLanding } from "./mobile/pages/Reports/Landing";
import { MyReports } from "./mobile/pages/Reports/MyReports";
import { ProjectsList } from "./mobile/pages/Reports/ProjectsList";
import { ProjectDetail } from "./mobile/pages/Reports/ProjectDetail";
import { TeamReport } from "./mobile/pages/Reports/TeamReport";
import { ReportsFeatureGate } from "./mobile/pages/Reports/ReportsFeatureGate";

const PortalShell = lazy(() => import("./portal/PortalShell"));

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
          { path: "/m/analytics", element: <Navigate to="/m/reports/me" replace /> },
          { path: "/m/reports",              element: <ReportsFeatureGate><ReportsLanding /></ReportsFeatureGate> },
          { path: "/m/reports/me",           element: <ReportsFeatureGate><MyReports /></ReportsFeatureGate> },
          { path: "/m/reports/projects",     element: <ReportsFeatureGate><ProjectsList /></ReportsFeatureGate> },
          { path: "/m/reports/projects/:id", element: <ReportsFeatureGate><ProjectDetail /></ReportsFeatureGate> },
          { path: "/m/reports/team",         element: <ReportsFeatureGate><TeamReport /></ReportsFeatureGate> },
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

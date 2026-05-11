import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { AuthGuard } from "./auth/guard";
import { LoginPage } from "./auth/login";
import { AppShell } from "./AppShell";
import { MyWorkList } from "./pages/MyWork/List";
import { MyWorkDetail } from "./pages/MyWork/Detail";
import { Onboarding } from "./pages/Onboarding";
import { MePage } from "./pages/Me";
import { NotificationsPage } from "./pages/Notifications";
import { DashboardPage } from "./pages/Dashboard";

const AnalyticsPage = lazy(() =>
  import("./pages/Analytics").then((m) => ({ default: m.AnalyticsPage })),
);

function LazyAnalytics() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>…</div>}>
      <AnalyticsPage />
    </Suspense>
  );
}

function OnboardingGate() {
  if (localStorage.getItem("vt_pwa_onboarded") === "1") {
    return <Navigate to="/m/work" replace />;
  }
  return <Onboarding />;
}

export const router = createBrowserRouter([
  { path: "/m/login", element: <LoginPage /> },
  { path: "/m/onboarding", element: <OnboardingGate /> },
  {
    element: <AuthGuard />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: "/m", element: <Navigate to="/m/work" replace /> },
          { path: "/m/work", element: <MyWorkList /> },
          { path: "/m/work/:id", element: <MyWorkDetail /> },
          { path: "/m/dashboard", element: <DashboardPage /> },
          { path: "/m/analytics", element: <LazyAnalytics /> },
          { path: "/m/me", element: <MePage /> },
          { path: "/m/me/notifications", element: <NotificationsPage /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/m/work" replace /> },
]);

import { createBrowserRouter, Navigate } from "react-router-dom";
import { AuthGuard } from "./auth/guard";
import { LoginPage } from "./auth/login";
import { AppShell } from "./AppShell";
import { MyWorkList } from "./pages/MyWork/List";
import { MyWorkDetail } from "./pages/MyWork/Detail";
import { Onboarding } from "./pages/Onboarding";
import { Placeholder } from "./pages/Placeholder";
import { MePage } from "./pages/Me";
import { t } from "./i18n";

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
          { path: "/m/dashboard", element: <Placeholder title={t("nav.dashboard")} /> },
          { path: "/m/analytics", element: <Placeholder title={t("nav.analytics")} /> },
          { path: "/m/me", element: <MePage /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/m/work" replace /> },
]);

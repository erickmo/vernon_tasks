import { jsx as _jsx } from "react/jsx-runtime";
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
        return _jsx(Navigate, { to: "/m/work", replace: true });
    }
    return _jsx(Onboarding, {});
}
export const router = createBrowserRouter([
    { path: "/m/login", element: _jsx(LoginPage, {}) },
    { path: "/m/onboarding", element: _jsx(OnboardingGate, {}) },
    {
        element: _jsx(AuthGuard, {}),
        children: [
            {
                element: _jsx(AppShell, {}),
                children: [
                    { path: "/m", element: _jsx(Navigate, { to: "/m/work", replace: true }) },
                    { path: "/m/work", element: _jsx(MyWorkList, {}) },
                    { path: "/m/work/:id", element: _jsx(MyWorkDetail, {}) },
                    { path: "/m/dashboard", element: _jsx(Placeholder, { title: t("nav.dashboard") }) },
                    { path: "/m/analytics", element: _jsx(Placeholder, { title: t("nav.analytics") }) },
                    { path: "/m/me", element: _jsx(MePage, {}) },
                ],
            },
        ],
    },
    { path: "*", element: _jsx(Navigate, { to: "/m/work", replace: true }) },
]);

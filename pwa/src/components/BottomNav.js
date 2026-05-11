import { jsx as _jsx } from "react/jsx-runtime";
import { NavLink } from "react-router-dom";
import { t } from "../i18n";
const TABS = [
    { to: "/m/work", label: t("nav.tasks") },
    { to: "/m/dashboard", label: t("nav.dashboard") },
    { to: "/m/analytics", label: t("nav.analytics") },
    { to: "/m/me", label: t("nav.me") },
];
export function BottomNav() {
    return (_jsx("nav", { style: {
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            height: "calc(var(--bottom-nav-h) + var(--safe-bottom))",
            paddingBottom: "var(--safe-bottom)",
            background: "var(--vt-bg)",
            borderTop: "1px solid var(--vt-border)",
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            zIndex: 40,
        }, children: TABS.map((tab) => (_jsx(NavLink, { to: tab.to, style: ({ isActive }) => ({
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: isActive ? "var(--vt-primary)" : "var(--vt-text-muted)",
                textDecoration: "none",
                fontSize: 13,
                fontWeight: 600,
            }), children: tab.label }, tab.to))) }));
}

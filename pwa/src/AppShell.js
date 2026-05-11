import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { BottomNav } from "./components/BottomNav";
import { OfflineBanner } from "./components/OfflineBanner";
import { SafeArea } from "./components/SafeArea";
import { ReloginModal } from "./components/ReloginModal";
import { ToastProvider } from "./components/Toast";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { onAuthChallenge } from "./api/client";
import { logEvent } from "./telemetry";
export function AppShell() {
    const [reloginOpen, setReloginOpen] = useState(false);
    const [resolver, setResolver] = useState(null);
    const loc = useLocation();
    useEffect(() => {
        onAuthChallenge(() => new Promise((resolve) => {
            setResolver(() => resolve);
            setReloginOpen(true);
        }));
    }, []);
    useEffect(() => {
        logEvent("page_view", { route: loc.pathname });
    }, [loc.pathname]);
    return (_jsx(ErrorBoundary, { children: _jsxs(ToastProvider, { children: [_jsx(OfflineBanner, {}), _jsx(SafeArea, { children: _jsx(Outlet, {}) }), _jsx(BottomNav, {}), _jsx(ReloginModal, { open: reloginOpen, onResolve: (ok) => {
                        setReloginOpen(false);
                        resolver?.(ok);
                        setResolver(null);
                    } })] }) }));
}

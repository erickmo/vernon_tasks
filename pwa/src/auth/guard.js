import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { probeSession } from "./session";
export function AuthGuard() {
    const [state, setState] = useState("loading");
    const loc = useLocation();
    useEffect(() => {
        probeSession()
            .then((s) => setState(s.user ? "auth" : "guest"))
            .catch(() => setState("guest"));
    }, []);
    if (state === "loading")
        return _jsx("div", { style: { padding: 24 }, children: "\u2026" });
    if (state === "guest") {
        const next = encodeURIComponent(loc.pathname + loc.search);
        return _jsx(Navigate, { to: `/m/login?next=${next}`, replace: true });
    }
    return _jsx(Outlet, {});
}

import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { logout, probeSession } from "../auth/session";
import { t } from "../i18n";
export function MePage() {
    const [user, setUser] = useState(null);
    const nav = useNavigate();
    useEffect(() => {
        probeSession().then((s) => setUser(s.user));
    }, []);
    async function doLogout() {
        await logout();
        nav("/m/login", { replace: true });
    }
    return (_jsxs("div", { style: { padding: 24 }, children: [_jsx("h1", { children: t("nav.me") }), _jsx("p", { style: { color: "var(--vt-text-muted)" }, children: user ?? "—" }), _jsx("button", { onClick: doLogout, style: { marginTop: 24, padding: 12 }, children: t("logout") })] }));
}

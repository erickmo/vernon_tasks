import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { login } from "./session";
import { t } from "../i18n";
export function LoginPage() {
    const [usr, setUsr] = useState(() => localStorage.getItem("vt_last_user") ?? "");
    const [pwd, setPwd] = useState("");
    const [err, setErr] = useState(null);
    const [busy, setBusy] = useState(false);
    const nav = useNavigate();
    const [params] = useSearchParams();
    const next = params.get("next") ?? "/m/work";
    async function onSubmit(e) {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
            const s = await login(usr, pwd);
            if (!s.user)
                throw new Error("guest");
            localStorage.setItem("vt_last_user", usr);
            nav(next, { replace: true });
        }
        catch {
            setErr(t("login.error"));
        }
        finally {
            setBusy(false);
        }
    }
    return (_jsxs("div", { style: { padding: "var(--vt-space-5)", maxWidth: 420, margin: "0 auto" }, children: [_jsx("h1", { style: { marginTop: 0 }, children: t("login.title") }), _jsxs("form", { onSubmit: onSubmit, children: [_jsxs("label", { style: { display: "block", marginBottom: "var(--vt-space-3)" }, children: [t("login.username"), _jsx("input", { value: usr, onChange: (e) => setUsr(e.target.value), autoComplete: "username", required: true, style: { display: "block", width: "100%", padding: "var(--vt-space-3)", marginTop: 4 } })] }), _jsxs("label", { style: { display: "block", marginBottom: "var(--vt-space-4)" }, children: [t("login.password"), _jsx("input", { type: "password", value: pwd, onChange: (e) => setPwd(e.target.value), autoComplete: "current-password", required: true, style: { display: "block", width: "100%", padding: "var(--vt-space-3)", marginTop: 4 } })] }), err && _jsx("p", { style: { color: "var(--vt-danger)" }, children: err }), _jsx("button", { disabled: busy, type: "submit", style: { width: "100%", padding: "var(--vt-space-3)" }, children: busy ? t("common.loading") : t("login.submit") })] })] }));
}

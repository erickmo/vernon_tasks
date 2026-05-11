import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { login } from "../auth/session";
import { t } from "../i18n";
export function ReloginModal({ open, onResolve }) {
    const [pwd, setPwd] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    const usr = localStorage.getItem("vt_last_user") ?? "";
    if (!open)
        return null;
    async function submit(e) {
        e.preventDefault();
        setBusy(true);
        try {
            const s = await login(usr, pwd);
            if (!s.user)
                throw new Error();
            onResolve(true);
        }
        catch {
            setErr(t("login.error"));
        }
        finally {
            setBusy(false);
        }
    }
    return (_jsx("div", { style: {
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "grid",
            placeItems: "center",
            zIndex: 100,
            padding: 16,
        }, children: _jsxs("form", { onSubmit: submit, style: {
                background: "var(--vt-bg)",
                color: "var(--vt-text)",
                padding: 24,
                borderRadius: 16,
                maxWidth: 420,
                width: "100%",
            }, children: [_jsx("h3", { style: { marginTop: 0 }, children: t("relogin.title") }), _jsx("p", { style: { color: "var(--vt-text-muted)" }, children: t("relogin.body") }), _jsx("p", { style: { fontSize: 13 }, children: usr }), _jsx("input", { type: "password", autoFocus: true, value: pwd, onChange: (e) => setPwd(e.target.value), required: true, style: { width: "100%", padding: 12, marginBottom: 12 } }), err && _jsx("p", { style: { color: "var(--vt-danger)" }, children: err }), _jsxs("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end" }, children: [_jsx("button", { type: "button", onClick: () => onResolve(false), disabled: busy, children: t("logout") }), _jsx("button", { type: "submit", disabled: busy, children: busy ? t("common.loading") : t("login.submit") })] })] }) }));
}

import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { t } from "../i18n";
const SLIDES = [
    { title: t("onboarding.welcome.title"), body: t("onboarding.welcome.body"), cta: "Lanjut" },
    { title: t("onboarding.anywhere.title"), body: t("onboarding.anywhere.body"), cta: "Lanjut" },
    { title: t("onboarding.start.title"), body: "", cta: t("onboarding.start.cta") },
];
export function Onboarding() {
    const [i, setI] = useState(0);
    const nav = useNavigate();
    const slide = SLIDES[i];
    const last = i === SLIDES.length - 1;
    function next() {
        if (last) {
            localStorage.setItem("vt_pwa_onboarded", "1");
            nav("/m/work", { replace: true });
        }
        else {
            setI(i + 1);
        }
    }
    return (_jsxs("div", { style: {
            display: "flex",
            flexDirection: "column",
            height: "100vh",
            padding: 24,
            paddingTop: "calc(var(--safe-top) + 24px)",
        }, children: [_jsx("div", { style: { flex: 1, display: "grid", placeItems: "center", textAlign: "center" }, children: _jsxs("div", { children: [_jsx("h1", { children: slide.title }), _jsx("p", { style: { color: "var(--vt-text-muted)", maxWidth: 320, margin: "0 auto" }, children: slide.body })] }) }), _jsx("div", { style: { display: "flex", justifyContent: "center", gap: 8, marginBottom: 24 }, children: SLIDES.map((_, idx) => (_jsx("span", { style: {
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: idx === i ? "var(--vt-primary)" : "var(--vt-border)",
                    } }, idx))) }), _jsx("button", { onClick: next, style: {
                    padding: 16,
                    background: "var(--vt-primary)",
                    color: "var(--vt-primary-contrast)",
                    border: 0,
                    borderRadius: "var(--vt-radius)",
                }, children: slide.cta })] }));
}

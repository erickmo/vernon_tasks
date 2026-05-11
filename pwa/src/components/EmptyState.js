import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function EmptyState({ title, body, cta }) {
    return (_jsxs("div", { style: { padding: "var(--vt-space-6)", textAlign: "center", color: "var(--vt-text-muted)" }, children: [_jsx("h3", { style: { color: "var(--vt-text)" }, children: title }), body && _jsx("p", { children: body }), cta && (_jsx("button", { onClick: cta.onClick, style: {
                    padding: "var(--vt-space-3) var(--vt-space-4)",
                    background: "var(--vt-primary)",
                    color: "var(--vt-primary-contrast)",
                    border: 0,
                    borderRadius: "var(--vt-radius)",
                }, children: cta.label }))] }));
}

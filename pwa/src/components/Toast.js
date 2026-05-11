import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useState } from "react";
const ToastCtx = createContext({ show: () => { } });
export function ToastProvider({ children }) {
    const [items, setItems] = useState([]);
    const show = useCallback((msg, action) => {
        const id = Date.now() + Math.random();
        setItems((p) => [...p, { id, msg, action }]);
        setTimeout(() => setItems((p) => p.filter((i) => i.id !== id)), 5000);
    }, []);
    return (_jsxs(ToastCtx.Provider, { value: { show }, children: [children, _jsx("div", { style: {
                    position: "fixed",
                    bottom: "calc(var(--bottom-nav-h) + 12px + var(--safe-bottom))",
                    left: 12,
                    right: 12,
                    display: "grid",
                    gap: 8,
                    zIndex: 50,
                }, children: items.map((i) => (_jsxs("div", { style: {
                        background: "var(--vt-text)",
                        color: "var(--vt-bg)",
                        padding: "var(--vt-space-3) var(--vt-space-4)",
                        borderRadius: "var(--vt-radius)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                    }, children: [_jsx("span", { children: i.msg }), i.action && (_jsx("button", { onClick: i.action.onClick, style: { color: "var(--vt-primary)", background: "transparent", border: 0 }, children: i.action.label }))] }, i.id))) })] }));
}
export function useToast() {
    return useContext(ToastCtx);
}

import { jsx as _jsx } from "react/jsx-runtime";
export function SafeArea({ children }) {
    return (_jsx("div", { style: {
            paddingTop: "var(--safe-top)",
            paddingLeft: "var(--safe-left)",
            paddingRight: "var(--safe-right)",
            paddingBottom: "calc(var(--bottom-nav-h) + var(--safe-bottom))",
            minHeight: "100%",
        }, children: children }));
}

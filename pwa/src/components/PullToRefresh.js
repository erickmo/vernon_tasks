import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRef, useState } from "react";
export function PullToRefresh({ onRefresh, children }) {
    const startY = useRef(null);
    const [pull, setPull] = useState(0);
    const [busy, setBusy] = useState(false);
    function onTouchStart(e) {
        if (window.scrollY <= 0)
            startY.current = e.touches[0].clientY;
    }
    function onTouchMove(e) {
        if (startY.current == null)
            return;
        const dy = e.touches[0].clientY - startY.current;
        if (dy > 0)
            setPull(Math.min(dy, 80));
    }
    async function onTouchEnd() {
        if (pull > 60 && !busy) {
            setBusy(true);
            try {
                await onRefresh();
            }
            finally {
                setBusy(false);
            }
        }
        setPull(0);
        startY.current = null;
    }
    return (_jsxs("div", { onTouchStart: onTouchStart, onTouchMove: onTouchMove, onTouchEnd: onTouchEnd, children: [_jsx("div", { style: {
                    height: pull,
                    textAlign: "center",
                    color: "var(--vt-text-muted)",
                    overflow: "hidden",
                    transition: busy ? "none" : "height 0.2s",
                }, children: busy ? "Menyegarkan…" : pull > 60 ? "Lepas untuk segarkan" : "Tarik untuk segarkan" }), children] }));
}

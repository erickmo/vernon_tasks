import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Component } from "react";
import { t } from "../i18n";
import { logEvent } from "../telemetry";
export class ErrorBoundary extends Component {
    state = { err: null };
    static getDerivedStateFromError(err) {
        return { err };
    }
    componentDidCatch(err) {
        logEvent("error_boundary", { msg: err.message });
    }
    render() {
        if (this.state.err) {
            return (_jsxs("div", { style: { padding: 24, textAlign: "center" }, children: [_jsx("h2", { children: t("error.boundary.title") }), _jsx("p", { children: t("error.boundary.body") }), _jsx("button", { onClick: () => window.location.reload(), children: t("common.refresh") })] }));
        }
        return this.props.children;
    }
}

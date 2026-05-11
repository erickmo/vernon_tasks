import { Component, ReactNode } from "react";
import { t } from "../i18n";
import { logEvent } from "../telemetry";

interface State {
  err: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { err: null };

  static getDerivedStateFromError(err: Error) {
    return { err };
  }

  componentDidCatch(err: Error) {
    logEvent("error_boundary", { msg: err.message });
  }

  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: 24, textAlign: "center" }}>
          <h2>{t("error.boundary.title")}</h2>
          <p>{t("error.boundary.body")}</p>
          <button onClick={() => window.location.reload()}>{t("common.refresh")}</button>
        </div>
      );
    }
    return this.props.children;
  }
}

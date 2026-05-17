import { Component, type ReactNode } from "react";
import { ErrorPage } from "./pages/ErrorPage";
import * as telemetry from "../telemetry";

export interface PortalErrorBoundaryProps {
  path: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class PortalErrorBoundary extends Component<PortalErrorBoundaryProps, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    telemetry.trackPortalError(this.props.path, error.message);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return <ErrorPage message={this.state.error.message} onRetry={this.reset} />;
    }
    return this.props.children;
  }
}

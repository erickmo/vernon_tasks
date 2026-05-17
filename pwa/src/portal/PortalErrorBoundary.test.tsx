import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PortalErrorBoundary } from "./PortalErrorBoundary";
import * as telemetry from "../telemetry";

function Bomb(): JSX.Element {
  throw new Error("kaboom");
}

describe("PortalErrorBoundary", () => {
  it("renders fallback and emits telemetry on child error", () => {
    const spy = vi.spyOn(telemetry, "trackPortalError");
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <PortalErrorBoundary path="/app/x">
        <Bomb />
      </PortalErrorBoundary>,
    );
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(spy).toHaveBeenCalledWith("/app/x", expect.stringContaining("kaboom"));
    errSpy.mockRestore();
  });
});

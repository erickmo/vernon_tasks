import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { PortalGuard } from "./PortalGuard";
import * as authHook from "../../auth/useAuth";
import * as mediaHook from "../../hooks/useMediaQuery";

function setup({ authed, desktop }: { authed: boolean; desktop: boolean }) {
  vi.spyOn(authHook, "useAuth").mockReturnValue({
    isLoading: false,
    isAuthenticated: authed,
    user: authed ? { name: "u@x" } : null,
    roles: [],
  });
  vi.spyOn(mediaHook, "useMediaQuery").mockReturnValue(desktop);
}

describe("PortalGuard", () => {
  it("renders children when authed + desktop", () => {
    setup({ authed: true, desktop: true });
    render(
      <MemoryRouter initialEntries={["/portal"]}>
        <Routes>
          <Route
            path="/portal/*"
            element={
              <PortalGuard>
                <div>portal</div>
              </PortalGuard>
            }
          />
          <Route path="/login" element={<div>login page</div>} />
          <Route path="/m" element={<div>mobile</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("portal")).toBeInTheDocument();
  });

  it("redirects to /login when unauth", () => {
    setup({ authed: false, desktop: true });
    render(
      <MemoryRouter initialEntries={["/portal"]}>
        <Routes>
          <Route
            path="/portal/*"
            element={
              <PortalGuard>
                <div>portal</div>
              </PortalGuard>
            }
          />
          <Route path="/login" element={<div>login page</div>} />
          <Route path="/m" element={<div>mobile</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("login page")).toBeInTheDocument();
  });

  it("redirects to /m when mobile viewport", () => {
    setup({ authed: true, desktop: false });
    render(
      <MemoryRouter initialEntries={["/portal"]}>
        <Routes>
          <Route
            path="/portal/*"
            element={
              <PortalGuard>
                <div>portal</div>
              </PortalGuard>
            }
          />
          <Route path="/login" element={<div>login page</div>} />
          <Route path="/m" element={<div>mobile</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("mobile")).toBeInTheDocument();
  });
});

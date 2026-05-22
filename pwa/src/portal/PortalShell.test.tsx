import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PortalShell } from "./PortalShell";
import * as authHook from "../auth/useAuth";
import * as mediaHook from "../hooks/useMediaQuery";
import * as permsApi from "../api/permissions";

function wrap(initial: string) {
  vi.spyOn(authHook, "useAuth").mockReturnValue({
    isAuthenticated: true,
    user: { name: "u@x" },
    roles: [],
    isLoading: false,
  } as any);
  vi.spyOn(mediaHook, "useMediaQuery").mockReturnValue(true);
  vi.spyOn(permsApi, "fetchUserPermissions").mockResolvedValue({
    permissions: ["okr.read", "project.read", "workforce.read", "report.read"],
    roles: ["System Manager"],
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ message: { portal_dashboard_v2_enabled: 0 } }),
        { status: 200 },
      ),
    ),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/portal/*" element={<PortalShell />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PortalShell", () => {
  it("renders TopBar at /portal", async () => {
    wrap("/portal");
    await waitFor(() =>
      expect(document.querySelector(".portal-topbar")).toBeInTheDocument(),
    );
  });

  it("renders ComingSoon for /portal/okr", async () => {
    wrap("/portal/okr");
    await waitFor(() =>
      expect(screen.getByText(/okr — coming soon/i)).toBeInTheDocument(),
    );
  });

  it("renders NotFound for unknown /portal/xyz", async () => {
    wrap("/portal/xyz");
    await waitFor(() =>
      expect(screen.getByText(/page not found/i)).toBeInTheDocument(),
    );
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ProjectRoutes } from "./ProjectRoutes";
import { ProjectsFeatureGate } from "./ProjectsFeatureGate";
import * as projApi from "./api/projects";
import * as vtHook from "../../hooks/useVtSettings";

function wrap(initial: string) {
  vi.spyOn(projApi, "listProjects").mockResolvedValue([]);
  vi.spyOn(vtHook, "useVtSettings").mockReturnValue({
    isLoading: false,
    data: { portal_enabled: 1, portal_okr_enabled: 1, portal_projects_enabled: 1 },
  } as any);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/portal/projects/*" element={<ProjectsFeatureGate><ProjectRoutes /></ProjectsFeatureGate>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("projects integration smoke", () => {
  it("gate-on renders list at /portal/projects", async () => {
    wrap("/portal/projects");
    await waitFor(() => expect(screen.getByRole("heading", { name: /^Projects$/ })).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /new project/i })).toBeInTheDocument();
  });

  it("navigates to /portal/projects/new editor", async () => {
    wrap("/portal/projects/new");
    await waitFor(() => expect(screen.getByRole("heading", { name: /new project/i })).toBeInTheDocument());
  });
});

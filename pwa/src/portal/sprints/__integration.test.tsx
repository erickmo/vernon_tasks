import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SprintsFeatureGate } from "./SprintsFeatureGate";
import { SprintRoutes } from "./SprintRoutes";

vi.mock("../../hooks/useVtSettings", () => ({
  useVtSettings: () => ({
    isLoading: false,
    data: {
      portal_enabled: 1,
      portal_okr_enabled: 0,
      portal_projects_enabled: 1,
      portal_sprints_enabled: 1,
    },
  }),
}));

vi.mock("./api/sprints", () => ({
  listSprints: vi.fn(async () => [
    {
      name: "SP-1", sprint_title: "S One", project: "PR-1",
      start_date: "2026-05-01", end_date: "2026-05-14",
      status: "Planning", goal: "", modified: "2026-05-01",
      task_count: 0, open_hours: 0, completed_hours: 0,
    },
  ]),
  bulkUpdateSprints: vi.fn(async () => ({ updated: [], skipped: [] })),
  createSprint: vi.fn(async () => ({ name: "SP-new" })),
  getSprintWithRelations: vi.fn(),
  getSprintBurndown: vi.fn(),
}));

describe("PortalRoutes sprint smoke", () => {
  it("renders SprintBoard at nested route", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/portal/projects/PR-1/sprints"]}>
          <Routes>
            <Route
              path="/portal/projects/:projectId/sprints/*"
              element={
                <SprintsFeatureGate>
                  <SprintRoutes />
                </SprintsFeatureGate>
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText("Planning")).toBeInTheDocument());
  });
});

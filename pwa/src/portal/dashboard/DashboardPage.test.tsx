import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DashboardPage } from "./DashboardPage";
import * as permsHook from "../../auth/usePermissions";
import * as dashApi from "./api/portalDashboard";

function wrap() {
  vi.spyOn(permsHook, "usePermissions").mockReturnValue({
    isLoading: false,
    permissions: ["okr.read", "project.read", "report.read"],
    roles: ["VT Manager"],
    hasPermission: () => true,
    hasAnyPermission: () => true,
    hasRole: (r: string) => r === "VT Manager",
  });
  vi.spyOn(dashApi.portalDashboardApi, "getSummary").mockResolvedValue({
    team_blocked: 2, unassigned_tasks: 3, okr_progress: 73, my_overdue: 1, sprint_days_remaining: 3,
  });
  vi.spyOn(dashApi.portalDashboardApi, "getTeamPulse").mockResolvedValue([]);
  vi.spyOn(dashApi.portalDashboardApi, "getUnassignedTasks").mockResolvedValue([]);
  vi.spyOn(dashApi.portalDashboardApi, "getMyTasksTimeline").mockResolvedValue({});
  vi.spyOn(dashApi.portalDashboardApi, "getPortfolioSummary").mockResolvedValue([]);
  vi.spyOn(dashApi.portalDashboardApi, "getOwnerOkrs").mockResolvedValue([]);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("DashboardPage", () => {
  it("shows Leader section for VT Manager role", async () => {
    wrap();
    await waitFor(() =>
      expect(screen.getByText("As Project Leader")).toBeInTheDocument()
    );
  });

  it("shows Owner section for VT Manager role", async () => {
    wrap();
    await waitFor(() =>
      expect(screen.getByText("As Project Owner")).toBeInTheDocument()
    );
  });

  it("always shows Member section", async () => {
    wrap();
    await waitFor(() =>
      expect(screen.getByText("As Project Member")).toBeInTheDocument()
    );
  });
});

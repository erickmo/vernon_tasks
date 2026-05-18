import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Dashboard } from "./Dashboard";
import { NotFound } from "./NotFound";
import { ErrorPage } from "./ErrorPage";
import { ComingSoon } from "./ComingSoon";
import * as permsHook from "../../auth/usePermissions";
import * as dashApi from "../dashboard/api/portalDashboard";

vi.spyOn(permsHook, "usePermissions").mockReturnValue({
  isLoading: false,
  permissions: ["okr.read", "project.read", "workforce.read", "report.read"],
  roles: [],
  hasPermission: () => true,
  hasAnyPermission: () => true,
  hasRole: () => false,
} as ReturnType<typeof permsHook.usePermissions>);

describe("portal pages", () => {
  it("Dashboard renders member section", async () => {
    vi.spyOn(dashApi.portalDashboardApi, "getSummary").mockResolvedValue({
      team_blocked: 0, unassigned_tasks: 0, okr_progress: 0, my_overdue: 0, sprint_days_remaining: 0,
    });
    vi.spyOn(dashApi.portalDashboardApi, "getTeamPulse").mockResolvedValue([]);
    vi.spyOn(dashApi.portalDashboardApi, "getUnassignedTasks").mockResolvedValue([]);
    vi.spyOn(dashApi.portalDashboardApi, "getMyTasksTimeline").mockResolvedValue({});
    vi.spyOn(dashApi.portalDashboardApi, "getPortfolioSummary").mockResolvedValue([]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText("As Project Member")).toBeInTheDocument()
    );
  });
  it("NotFound shows link to portal home", () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: /home/i })).toHaveAttribute("href", "/portal");
  });
  it("ErrorPage shows retry button and reports message", () => {
    render(<ErrorPage message="boom" onRetry={() => {}} />);
    expect(screen.getByText(/boom/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
  it("ComingSoon shows domain label", () => {
    render(<ComingSoon domain="OKR" />);
    expect(screen.getAllByText(/OKR/).length).toBeGreaterThan(0);
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });
});

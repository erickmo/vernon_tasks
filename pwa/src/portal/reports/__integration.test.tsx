import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { ReportsRoutes } from "./ReportsRoutes";
import * as permsHook from "../../auth/usePermissions";
import * as settingsHook from "../../hooks/useVtSettings";
import * as api from "./api/portal_reports";

vi.mock("../../auth/usePermissions");
vi.mock("../../hooks/useVtSettings");
vi.mock("./api/portal_reports");
vi.mock("../../telemetry", () => ({
  trackReportsPageView: vi.fn(),
  trackReportsTabView: vi.fn(),
  trackReportsPermissionDenied: vi.fn(),
  trackReportsKpiSelect: vi.fn(),
  trackReportsVelocityNChange: vi.fn(),
  trackReportsLeaderboardPeriodChange: vi.fn(),
  trackReportsOverdueViewToggle: vi.fn(),
}));
// Mock heavy chart components to keep test fast
vi.mock("./charts/KpiTrendChart", () => ({
  KpiTrendChart: () => createElement("div", { "data-testid": "kpi-chart" }),
}));
vi.mock("./charts/VelocityComparisonChart", () => ({
  VelocityComparisonChart: () => createElement("div", { "data-testid": "vel-chart" }),
}));
vi.mock("./charts/WorkloadChart", () => ({
  WorkloadChart: () => createElement("div", { "data-testid": "workload-chart" }),
}));
vi.mock("./charts/CompletionRingChart", () => ({
  CompletionRingChart: () => createElement("div", { "data-testid": "ring-chart" }),
}));

const MOCK_HEALTH = {
  score: 82, okr_pct: 0.74, ontime_pct: 0.88, velocity_health: 0.91,
  components: { okr_weight: 0.4, ontime_weight: 0.3, velocity_weight: 0.3 },
  as_of: "2026-05-18T10:00:00",
};
const MOCK_ROLLUP = {
  period: "Q2-2026",
  rows: [{ project: "P1", project_title: "Alpha OKR", objective_count: 3,
           kr_count: 9, avg_progress: 0.65, on_track: 2, at_risk: 1, behind: 0 }],
  totals: { objective_count: 3, kr_count: 9, avg_progress: 0.65,
            on_track: 2, at_risk: 1, behind: 0 },
};
const MOCK_KPI_LIST = [{ name: "KPI-00001", title: "Velocity", unit: "pts/sprint" }];
const MOCK_KPI_TREND = { kpi_definition: "KPI-00001", title: "Velocity",
                         unit: "pts/sprint", periods: 12, series: [] };
const MOCK_VELOCITY = { n: 6, projects: [] };
const MOCK_FORECASTS = { forecasts: [] };
const MOCK_RISKS = { risks: [] };
const MOCK_LEADERBOARD = {
  period: "this_month",
  rows: [{ rank: 1, user: "alice@x.com", full_name: "Alice Integration",
           points: 420, tasks_completed: 18, streak_days: 12, avg_quality: 4.2 }],
};
const MOCK_WORKLOAD = { as_of: "2026-05-18", members: [] };
const MOCK_OVERDUE = { as_of: "2026-05-18", total_overdue: 0,
                       by_member: [], by_project: [] };

function setupApiMocks() {
  vi.mocked(api.getPortalHealthScore).mockResolvedValue(MOCK_HEALTH);
  vi.mocked(api.getPortalOkrRollup).mockResolvedValue(MOCK_ROLLUP);
  vi.mocked(api.getPortalKpiList).mockResolvedValue(MOCK_KPI_LIST);
  vi.mocked(api.getPortalKpiTrend).mockResolvedValue(MOCK_KPI_TREND);
  vi.mocked(api.getPortalVelocityComparison).mockResolvedValue(MOCK_VELOCITY);
  vi.mocked(api.getPortalForecasts).mockResolvedValue(MOCK_FORECASTS);
  vi.mocked(api.getPortalRisks).mockResolvedValue(MOCK_RISKS);
  vi.mocked(api.getPortalLeaderboard).mockResolvedValue(MOCK_LEADERBOARD);
  vi.mocked(api.getPortalWorkload).mockResolvedValue(MOCK_WORKLOAD);
  vi.mocked(api.getPortalOverdue).mockResolvedValue(MOCK_OVERDUE);
}

function renderRoutes(roles: string[], flagEnabled: boolean) {
  vi.mocked(permsHook.usePermissions).mockReturnValue({
    isLoading: false,
    permissions: [],
    roles,
    hasPermission: () => false,
    hasAnyPermission: () => false,
    hasRole: (r) => roles.includes(r),
  });
  vi.mocked(settingsHook.useVtSettings).mockReturnValue({
    isLoading: false,
    data: {
      portal_enabled: 1,
      portal_okr_enabled: 1,
      portal_projects_enabled: 1,
      portal_sprints_enabled: 1,
      portal_notifications_enabled: 1,
      portal_reports_enabled: flagEnabled ? 1 : 0,
    },
    isError: false,
    error: null,
  } as ReturnType<typeof settingsHook.useVtSettings>);

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    createElement(
      QueryClientProvider,
      { client: qc },
      createElement(MemoryRouter, null, createElement(ReportsRoutes))
    )
  );
}

describe("ReportsRoutes integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupApiMocks();
  });

  describe("Scenario A — Manager, flag on", () => {
    it("renders all three tabs", async () => {
      renderRoutes(["VT Manager"], true);
      await waitFor(() => expect(screen.queryByRole("tab", { name: "OKR" })).not.toBeNull());
      expect(screen.getByRole("tab", { name: "Sprints" })).not.toBeNull();
      expect(screen.getByRole("tab", { name: "Team" })).not.toBeNull();
    });

    it("OKR tab content appears (health score card)", async () => {
      renderRoutes(["VT Manager"], true);
      await waitFor(() =>
        expect(screen.queryByLabelText(/health score: 82/i)).not.toBeNull()
      );
    });
  });

  describe("Scenario B — Leader, flag on", () => {
    it("OKR tab absent; Sprints and Team present", async () => {
      renderRoutes(["VT Leader"], true);
      await waitFor(() => expect(screen.queryByRole("tab", { name: "Sprints" })).not.toBeNull());
      expect(screen.queryByRole("tab", { name: "OKR" })).toBeNull();
      expect(screen.getByRole("tab", { name: "Team" })).not.toBeNull();
    });
  });

  describe("Scenario C — flag off", () => {
    it("ReportsFeatureGate renders ComingSoon", async () => {
      renderRoutes(["VT Manager"], false);
      await waitFor(() =>
        expect(screen.queryByText(/coming soon/i)).not.toBeNull()
      );
    });
  });
});

import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { OkrTab } from "./OkrTab";
import * as api from "../api/portal_reports";

vi.mock("../api/portal_reports");
vi.mock("../charts/KpiTrendChart", () => ({
  KpiTrendChart: () => createElement("div", { "data-testid": "kpi-chart" }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe("OkrTab", () => {
  beforeEach(() => {
    vi.mocked(api.getPortalHealthScore).mockResolvedValue({
      score: 82, okr_pct: 0.74, ontime_pct: 0.88, velocity_health: 0.91,
      components: { okr_weight: 0.4, ontime_weight: 0.3, velocity_weight: 0.3 },
      as_of: "2026-05-18T10:00:00",
    });
    vi.mocked(api.getPortalOkrRollup).mockResolvedValue({
      period: "Q2-2026",
      rows: [{ project: "P1", project_title: "Alpha", objective_count: 3,
               kr_count: 9, avg_progress: 0.65, on_track: 2, at_risk: 1, behind: 0 }],
      totals: { objective_count: 3, kr_count: 9, avg_progress: 0.65,
                on_track: 2, at_risk: 1, behind: 0 },
    });
    vi.mocked(api.getPortalKpiList).mockResolvedValue([]);
  });

  it("renders HealthScoreCard when data loads", async () => {
    render(createElement(OkrTab, null), { wrapper });
    const card = await screen.findByLabelText(/health score: 82/i);
    expect(card).not.toBeNull();
  });

  it("renders OkrRollupTable with project row", async () => {
    render(createElement(OkrTab, null), { wrapper });
    const cell = await screen.findByText("Alpha");
    expect(cell).not.toBeNull();
  });

  it("shows EmptyState when rollup rows is empty", async () => {
    vi.mocked(api.getPortalOkrRollup).mockResolvedValue({
      period: "Q2-2026",
      rows: [],
      totals: { objective_count: 0, kr_count: 0, avg_progress: 0,
                on_track: 0, at_risk: 0, behind: 0 },
    });
    render(createElement(OkrTab, null), { wrapper });
    const empty = await screen.findByText(/no okr data/i);
    expect(empty).not.toBeNull();
  });
});

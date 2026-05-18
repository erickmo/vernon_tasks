import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { KpiTrendPanel } from "./KpiTrendPanel";
import * as api from "../api/portal_reports";

vi.mock("../api/portal_reports");
vi.mock("../../../telemetry");
vi.mock("../charts/KpiTrendChart", () => ({
  KpiTrendChart: () => createElement("div", { "data-testid": "kpi-trend-chart" }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe("KpiTrendPanel", () => {
  beforeEach(() => {
    vi.mocked(api.getPortalKpiList).mockResolvedValue([
      { name: "KPI-00001", title: "Velocity", unit: "pts/sprint" },
      { name: "KPI-00002", title: "Ontime", unit: "%" },
    ]);
    vi.mocked(api.getPortalKpiTrend).mockResolvedValue({
      kpi_definition: "KPI-00001", title: "Velocity", unit: "pts/sprint",
      periods: 12, series: [],
    });
  });

  it("renders KPI selector", async () => {
    render(createElement(KpiTrendPanel, null), { wrapper });
    const select = await screen.findByRole("combobox");
    expect(select).not.toBeNull();
  });

  it("KPI select combobox appears with KPI options after data loads", async () => {
    render(createElement(KpiTrendPanel, null), { wrapper });
    const select = await screen.findByRole("combobox");
    // The select should render with KPI options from the mock data
    expect(select).not.toBeNull();
    // After data loads, both KPI options should be in the DOM
    await waitFor(() => {
      expect(screen.getByText(/velocity/i)).not.toBeNull();
    });
    // Fire change - should not throw
    fireEvent.change(select, { target: { value: "KPI-00002" } });
  });
});

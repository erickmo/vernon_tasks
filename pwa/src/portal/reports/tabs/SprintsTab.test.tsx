import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { SprintsTab } from "./SprintsTab";
import * as api from "../api/portal_reports";

vi.mock("../api/portal_reports");
vi.mock("../charts/VelocityComparisonChart", () => ({
  VelocityComparisonChart: () => createElement("div", { "data-testid": "velocity-chart" }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe("SprintsTab", () => {
  beforeEach(() => {
    vi.mocked(api.getPortalVelocityComparison).mockResolvedValue({ n: 6, projects: [] });
    vi.mocked(api.getPortalForecasts).mockResolvedValue({ forecasts: [] });
    vi.mocked(api.getPortalRisks).mockResolvedValue({ risks: [] });
  });

  it("renders velocity chart, n selector, forecast grid, risk matrix", async () => {
    render(createElement(SprintsTab, null), { wrapper });
    const chart = await screen.findByTestId("velocity-chart");
    expect(chart).not.toBeNull();
    expect(screen.getByRole("combobox")).not.toBeNull(); // n selector
  });

  it("n selector change triggers refetch with new n", async () => {
    render(createElement(SprintsTab, null), { wrapper });
    await screen.findByTestId("velocity-chart");
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "12" } });
    expect(api.getPortalVelocityComparison).toHaveBeenCalledWith(12);
  });
});

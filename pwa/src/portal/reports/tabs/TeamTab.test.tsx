import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { TeamTab } from "./TeamTab";
import * as api from "../api/portal_reports";

vi.mock("../api/portal_reports");
vi.mock("../charts/CompletionRingChart", () => ({
  CompletionRingChart: () => createElement("div", { "data-testid": "ring-chart" }),
}));
vi.mock("../charts/WorkloadChart", () => ({
  WorkloadChart: () => createElement("div", { "data-testid": "workload-chart" }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe("TeamTab", () => {
  beforeEach(() => {
    vi.mocked(api.getPortalLeaderboard).mockResolvedValue({
      period: "this_month",
      rows: [{ rank: 1, user: "alice@x.com", full_name: "Alice", points: 420,
               tasks_completed: 18, streak_days: 12, avg_quality: 4.2 }],
    });
    vi.mocked(api.getPortalWorkload).mockResolvedValue({ as_of: "2026-05-18", members: [] });
    vi.mocked(api.getPortalOverdue).mockResolvedValue({
      as_of: "2026-05-18", total_overdue: 0, by_member: [], by_project: [] });
  });

  it("renders leaderboard and period selector", async () => {
    render(createElement(TeamTab, null), { wrapper });
    await screen.findByText("Alice");
    expect(screen.getByRole("combobox")).not.toBeNull();
  });

  it("period selector change refetches leaderboard", async () => {
    render(createElement(TeamTab, null), { wrapper });
    await screen.findByText("Alice");
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "this_week" } });
    expect(api.getPortalLeaderboard).toHaveBeenCalledWith("this_week", 20);
  });
});

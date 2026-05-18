import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { useTeamReport } from "./useTeamReport";
import * as api from "../api/portal_reports";

vi.mock("../api/portal_reports");

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe("useTeamReport", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("period change invalidates leaderboard query key", async () => {
    vi.mocked(api.getPortalLeaderboard).mockResolvedValue({
      period: "this_week", rows: [] });
    vi.mocked(api.getPortalWorkload).mockResolvedValue({
      as_of: "2026-05-18", members: [] });
    vi.mocked(api.getPortalOverdue).mockResolvedValue({
      as_of: "2026-05-18", total_overdue: 0, by_member: [], by_project: [] });

    const { result, rerender } = renderHook(
      ({ period }: { period: string }) => useTeamReport(period),
      { wrapper, initialProps: { period: "this_week" } }
    );
    await waitFor(() => expect(result.current.leaderboard.isSuccess).toBe(true));
    expect(api.getPortalLeaderboard).toHaveBeenCalledWith("this_week", 20);

    rerender({ period: "this_month" });
    await waitFor(() =>
      expect(api.getPortalLeaderboard).toHaveBeenCalledWith("this_month", 20)
    );
  });
});

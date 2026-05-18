import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { useOkrReport } from "./useOkrReport";
import * as api from "../api/portal_reports";

vi.mock("../api/portal_reports");

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe("useOkrReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes health and rollup query results", async () => {
    const mockHealth = { score: 82, okr_pct: 0.74, ontime_pct: 0.88,
                         velocity_health: 0.91,
                         components: { okr_weight: 0.4, ontime_weight: 0.3, velocity_weight: 0.3 },
                         as_of: "2026-05-18T10:00:00" };
    const mockRollup = { period: "Q2-2026", rows: [], totals: {
      objective_count: 0, kr_count: 0, avg_progress: 0, on_track: 0, at_risk: 0, behind: 0 }};
    vi.mocked(api.getPortalHealthScore).mockResolvedValue(mockHealth);
    vi.mocked(api.getPortalOkrRollup).mockResolvedValue(mockRollup);

    const { result } = renderHook(() => useOkrReport(), { wrapper });
    await waitFor(() => expect(result.current.health.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.rollup.isSuccess).toBe(true));
    expect(result.current.health.data?.score).toBe(82);
    expect(result.current.rollup.data?.period).toBe("Q2-2026");
  });
});

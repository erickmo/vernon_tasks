import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { useSprintsReport } from "./useSprintsReport";
import * as api from "../api/portal_reports";

vi.mock("../api/portal_reports");

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe("useSprintsReport", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("n change produces different velocity query key", async () => {
    vi.mocked(api.getPortalVelocityComparison).mockResolvedValue({ n: 6, projects: [] });
    vi.mocked(api.getPortalForecasts).mockResolvedValue({ forecasts: [] });
    vi.mocked(api.getPortalRisks).mockResolvedValue({ risks: [] });

    const { result, rerender } = renderHook(
      ({ n }: { n: number }) => useSprintsReport(n),
      { wrapper, initialProps: { n: 6 } }
    );
    await waitFor(() => expect(result.current.velocity.isSuccess).toBe(true));
    expect(api.getPortalVelocityComparison).toHaveBeenCalledWith(6);

    rerender({ n: 12 });
    await waitFor(() =>
      expect(api.getPortalVelocityComparison).toHaveBeenCalledWith(12)
    );
  });
});

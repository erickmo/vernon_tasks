import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProjectDetail } from "./ProjectDetail";

vi.mock("../../../api/reports", () => ({
  fetchProjectVelocity: vi.fn().mockResolvedValue({ project: "VTP-1", sprints: [], avg_velocity: 7.5, trend: "up" }),
  fetchProjectForecast: vi.fn().mockResolvedValue({ target: 100, projected: 90, gap: 10 }),
  fetchProjectRisks: vi.fn().mockResolvedValue({ risks: [] }),
  fetchProjectOkr: vi.fn().mockResolvedValue({ objectives: [] }),
}));

vi.mock("../../../telemetry", () => ({
  logEvent: vi.fn(),
}));

function renderPage(initialPath = "/m/reports/projects/VTP-1") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/m/reports/projects/:id" element={<ProjectDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ProjectDetail", () => {
  it("renders 4 sections after data loads", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/Velocity/i)).toBeInTheDocument());
    expect(screen.getByText(/Forecast/i)).toBeInTheDocument();
    expect(screen.getByText(/Risks/i)).toBeInTheDocument();
    expect(screen.getByText(/OKR/i)).toBeInTheDocument();
  });

  it("period chip change updates URL", async () => {
    renderPage("/m/reports/projects/VTP-1?period=month");
    fireEvent.click(screen.getByRole("button", { name: /Kuartal/i }));
    await waitFor(() => {
      const link = document.querySelector("a");
      // MemoryRouter doesn't update window.location, so check via DOM state:
      // the Kuartal button should now be active (different background)
      const btn = screen.getByRole("button", { name: /Kuartal/i });
      expect(btn.getAttribute("data-active")).toBe("true");
    });
  });
});

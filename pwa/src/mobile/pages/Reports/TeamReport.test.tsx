import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TeamReport } from "./TeamReport";

vi.mock("../../../api/reports", () => ({
  fetchTeamLeaderboard: vi.fn().mockResolvedValue({ rows: [], period: "month" }),
  fetchTeamCompletion: vi.fn().mockResolvedValue({ completion_pct: 75, done: 30, total: 40 }),
  fetchTeamOverdue: vi.fn().mockResolvedValue({ total: 0, items: [] }),
  fetchTeamWorkload: vi.fn().mockResolvedValue({ members: [] }),
}));

vi.mock("../../../telemetry", () => ({
  logEvent: vi.fn(),
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TeamReport />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("TeamReport", () => {
  it("renders 4 sections", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/Leaderboard/i)).toBeInTheDocument());
    expect(screen.getByText(/Completion/i)).toBeInTheDocument();
    expect(screen.getByText(/Overdue/i)).toBeInTheDocument();
    expect(screen.getByText(/Workload/i)).toBeInTheDocument();
  });
});

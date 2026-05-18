import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SprintDetail } from "./SprintDetail";

vi.mock("./api/sprints", () => ({
  getSprintWithRelations: vi.fn(async () => ({
    sprint: { name: "SP-1", sprint_title: "S One", project: "PR-1",
      start_date: "2026-05-01", end_date: "2026-05-14", status: "Active", goal: "Ship it" },
    project_summary: null,
    tasks: [],
  })),
  getSprintBurndown: vi.fn(async () => ({
    sprint: "SP-1", start_date: "2026-05-01", end_date: "2026-05-14", total_hours: 0, series: [],
  })),
}));

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/portal/projects/PR-1/sprints/SP-1"]}>
        <Routes>
          <Route path="/portal/projects/:projectId/sprints/:sprintId" element={<SprintDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("SprintDetail", () => {
  it("renders sprint header and Board tab by default", async () => {
    wrap();
    await waitFor(() => expect(screen.getByText("S One")).toBeInTheDocument());
    expect(screen.getByText("Ship it")).toBeInTheDocument();
    expect(screen.getByTestId("task-board-root")).toBeInTheDocument();
  });
  it("switches to Burndown tab on click", async () => {
    wrap();
    await waitFor(() => expect(screen.getByText("S One")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: /burndown/i }));
    await waitFor(() => expect(screen.getByLabelText(/burndown chart/i)).toBeInTheDocument());
  });
});

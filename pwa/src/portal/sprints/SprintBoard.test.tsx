import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SprintBoard } from "./SprintBoard";

vi.mock("./api/sprints", () => ({
  listSprints: vi.fn(async () => [
    { name: "SP-1", sprint_title: "S One", project: "PR-1", start_date: "2026-05-01", end_date: "2026-05-14",
      status: "Planning", goal: "", modified: "2026-05-01", task_count: 0, open_hours: 0, completed_hours: 0 },
    { name: "SP-2", sprint_title: "S Two", project: "PR-1", start_date: "2026-05-15", end_date: "2026-05-28",
      status: "Active", goal: "", modified: "2026-05-15", task_count: 2, open_hours: 4, completed_hours: 2 },
  ]),
  bulkUpdateSprints: vi.fn(async () => ({ updated: ["SP-1"], skipped: [] })),
  createSprint: vi.fn(async () => ({ name: "SP-new" })),
}));

function renderWithRoute() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/portal/projects/PR-1/sprints"]}>
        <Routes>
          <Route path="/portal/projects/:projectId/sprints/*" element={<SprintBoard />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("SprintBoard", () => {
  it("renders 4 columns", async () => {
    renderWithRoute();
    await waitFor(() => expect(screen.getByText("Planning")).toBeInTheDocument());
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Review")).toBeInTheDocument();
    expect(screen.getByText("Closed")).toBeInTheDocument();
  });
  it("places sprints in correct columns", async () => {
    renderWithRoute();
    await waitFor(() => expect(screen.getByText("S One")).toBeInTheDocument());
    const planningCol = screen.getByTestId("col-Planning");
    const activeCol = screen.getByTestId("col-Active");
    expect(planningCol).toHaveTextContent("S One");
    expect(activeCol).toHaveTextContent("S Two");
  });
  it("opens SprintEditor on '+ New sprint' click", async () => {
    renderWithRoute();
    await waitFor(() => expect(screen.getByText("Planning")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /new sprint/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { ReactElement } from "react";
import type { SprintDetail } from "../../../portal/sprints/api/types";

vi.mock("./api", () => ({
  getSprintBoard: vi.fn(),
  moveTask: vi.fn(async (p: Record<string, unknown>) => ({ ...p })),
  rebalanceColumn: vi.fn(async () => ({})),
}));
import { getSprintBoard } from "./api";
import { SprintBoardMobile, __onDragEndForTest } from "./SprintBoardMobile";

const detail: SprintDetail = {
  sprint: { name: "SP-1", sprint_title: "Sprint One", project: "PR-1", start_date: null, end_date: null, status: "Active", goal: null },
  project_summary: null,
  tasks: [
    { name: "T-1", title: "Alpha", assigned_to: "u@x", kanban_status: "Backlog", pdca_phase: "PLAN", kanban_rank: 1000, estimated_hours: 2, weight: 1, priority: "Low", deadline: null },
    { name: "T-2", title: "Beta", assigned_to: "u@x", kanban_status: "In Progress", pdca_phase: "DO", kanban_rank: 1000, estimated_hours: 3, weight: 1, priority: "Medium", deadline: null },
  ],
};

function wrap(ui: ReactElement, path = "/m/sprint/SP-1") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/m/sprint/:sprintId" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("SprintBoardMobile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getSprintBoard as ReturnType<typeof vi.fn>).mockResolvedValue(detail);
  });
  it("renders kanban columns by default and places tasks", async () => {
    wrap(<SprintBoardMobile />);
    await waitFor(() => expect(screen.getByTestId("mcol-Backlog")).toBeInTheDocument());
    expect(screen.getByTestId("mcol-Backlog")).toHaveTextContent("Alpha");
    expect(screen.getByTestId("mcol-In Progress")).toHaveTextContent("Beta");
    ["Backlog", "Scheduled", "In Progress", "In Review", "Revision", "Done", "Blocked"].forEach((c) =>
      expect(screen.getByTestId(`mcol-${c}`)).toBeInTheDocument(),
    );
  });
  it("toggles axis to pdca columns", async () => {
    wrap(<SprintBoardMobile />);
    await waitFor(() => expect(screen.getByTestId("mcol-Backlog")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /pdca/i }));
    ["BACKLOG", "PLAN", "DO", "CHECK", "ACT", "DONE"].forEach((c) =>
      expect(screen.getByTestId(`mcol-${c}`)).toBeInTheDocument(),
    );
  });
  it("shows empty state when no tasks", async () => {
    (getSprintBoard as ReturnType<typeof vi.fn>).mockResolvedValue({ ...detail, tasks: [] });
    wrap(<SprintBoardMobile />);
    await waitFor(() => expect(screen.getByText(/no tasks/i)).toBeInTheDocument());
  });
  it("shows error state with retry", async () => {
    (getSprintBoard as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("boom"));
    wrap(<SprintBoardMobile />);
    await waitFor(() => expect(screen.getByText(/failed to load/i)).toBeInTheDocument());
  });
  it("onDragEnd handler resolves target column and calls move", () => {
    const move = vi.fn();
    __onDragEndForTest({ active: { id: "T-1" }, over: { id: "tcol-In Progress" } } as never, { axis: "kanban_status", tasks: detail.tasks, move, sprintId: "SP-1" });
    expect(move).toHaveBeenCalledWith(expect.objectContaining({ task: "T-1", axis: "kanban_status", targetColumn: "In Progress" }));
  });
  it("onDragEnd resolves target column when dropped over a card", () => {
    const move = vi.fn();
    __onDragEndForTest({ active: { id: "T-1" }, over: { id: "T-2" } } as never, { axis: "kanban_status", tasks: detail.tasks, move, sprintId: "SP-1" });
    expect(move).toHaveBeenCalledWith(expect.objectContaining({ targetColumn: "In Progress" }));
  });
});

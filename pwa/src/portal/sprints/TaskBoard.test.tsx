import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { TaskBoard } from "./TaskBoard";
import type { SprintDetail } from "./api/types";

vi.mock("./api/sprints", () => ({
  moveTask: vi.fn(async (p: Record<string, unknown>) => ({ ...p })),
  rebalanceColumn: vi.fn(),
}));

const detail: SprintDetail = {
  sprint: { name: "SP-1", sprint_title: "S", project: "PR-1",
    start_date: "2026-05-01", end_date: "2026-05-14", status: "Active", goal: "" },
  project_summary: null,
  tasks: [
    { name: "T-1", title: "A", assigned_to: "u@x", kanban_status: "Backlog", pdca_phase: "PLAN",
      kanban_rank: 1000, estimated_hours: 2, weight: 1, priority: "Low", deadline: null },
    { name: "T-2", title: "B", assigned_to: "u@x", kanban_status: "In Progress", pdca_phase: "DO",
      kanban_rank: 1000, estimated_hours: 3, weight: 1, priority: "Medium", deadline: null },
  ],
};

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("TaskBoard", () => {
  it("renders 7 kanban_status columns by default", () => {
    wrap(<TaskBoard detail={detail} currentUser="u@x" canEditAll={true} />);
    ["Backlog","Scheduled","In Progress","In Review","Revision","Done","Blocked"].forEach(c =>
      expect(screen.getByTestId(`tcol-${c}`)).toBeInTheDocument());
  });
  it("toggles to 6 pdca columns", () => {
    wrap(<TaskBoard detail={detail} currentUser="u@x" canEditAll={true} />);
    fireEvent.click(screen.getByRole("button", { name: /toggle/i }));
    ["BACKLOG","PLAN","DO","CHECK","ACT","DONE"].forEach(c =>
      expect(screen.getByTestId(`tcol-${c}`)).toBeInTheDocument());
  });
  it("places tasks in correct kanban columns", () => {
    wrap(<TaskBoard detail={detail} currentUser="u@x" canEditAll={true} />);
    expect(screen.getByTestId("tcol-Backlog")).toHaveTextContent("A");
    expect(screen.getByTestId("tcol-In Progress")).toHaveTextContent("B");
  });
});

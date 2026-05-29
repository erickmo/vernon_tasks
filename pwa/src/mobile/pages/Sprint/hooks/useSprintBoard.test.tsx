import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { SprintDetail } from "../../../../portal/sprints/api/types";
import { useSprintBoard } from "./useSprintBoard";

vi.mock("../api", () => ({
  getSprintBoard: vi.fn(),
  moveTask: vi.fn(async (p: Record<string, unknown>) => ({ ...p })),
  rebalanceColumn: vi.fn(async () => ({})),
}));
import { getSprintBoard, moveTask, rebalanceColumn } from "../api";

const detail: SprintDetail = {
  sprint: { name: "SP-1", sprint_title: "S", project: "PR-1", start_date: null, end_date: null, status: "Active", goal: null },
  project_summary: null,
  tasks: [
    { name: "T-1", title: "A", assigned_to: "u@x", kanban_status: "Backlog", pdca_phase: "PLAN", kanban_rank: 1000, estimated_hours: 2, weight: 1, priority: "Low", deadline: null },
    { name: "T-2", title: "B", assigned_to: "u@x", kanban_status: "Backlog", pdca_phase: "PLAN", kanban_rank: 2000, estimated_hours: 3, weight: 1, priority: "Medium", deadline: null },
  ],
};

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useSprintBoard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getSprintBoard as ReturnType<typeof vi.fn>).mockResolvedValue(detail);
  });
  it("loads the sprint detail", async () => {
    const { result } = renderHook(() => useSprintBoard("SP-1"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data?.tasks).toHaveLength(2));
    expect(getSprintBoard).toHaveBeenCalledWith("SP-1");
  });
  it("move() calls moveTask with axis field + computed rank", async () => {
    const { result } = renderHook(() => useSprintBoard("SP-1"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBeTruthy());
    await act(async () => {
      await result.current.move.mutateAsync({ task: "T-1", axis: "kanban_status", targetColumn: "In Progress", prevRank: 2000, nextRank: null });
    });
    expect(moveTask).toHaveBeenCalledWith({ task: "T-1", kanban_status: "In Progress", kanban_rank: 3000 });
  });
  it("rolls back optimistic state on move error", async () => {
    (moveTask as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("PermissionError"));
    const { result } = renderHook(() => useSprintBoard("SP-1"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBeTruthy());
    await act(async () => {
      await result.current.move.mutateAsync({ task: "T-1", axis: "kanban_status", targetColumn: "Done", prevRank: 2000, nextRank: null }).catch(() => {});
    });
    const t1 = result.current.data!.tasks.find((t) => t.name === "T-1")!;
    expect(t1.kanban_status).toBe("Backlog");
  });
  it("rebalances when rank collides", async () => {
    const { result } = renderHook(() => useSprintBoard("SP-1"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBeTruthy());
    await act(async () => {
      await result.current.move.mutateAsync({ task: "T-2", axis: "kanban_status", targetColumn: "Backlog", prevRank: 1000, nextRank: 1000.00005 });
    });
    expect(rebalanceColumn).toHaveBeenCalledWith("SP-1", "kanban_status", "Backlog");
  });
});

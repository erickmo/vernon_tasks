import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useTaskDetail } from "./useTaskDetail";

vi.mock("../api/tasks", () => ({
  getTaskDetail: vi.fn(async (task: string) => ({
    task: {
      name: task,
      title: "Test Task",
      deadline: null,
      assigned_to: "user@test.local",
      assigned_to_full_name: "Test User",
      kanban_status: "Backlog",
      priority: "Medium",
      base_points: 3,
      pdca_phase: "BACKLOG",
      completion_date: null,
      project: "PR-1",
      sprint: "SP-1",
      estimated_hours: 2,
      kanban_rank: 1000,
    },
    permitted_fields: ["title", "kanban_status", "pdca_phase"],
  })),
}));

function makeWrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe("useTaskDetail", () => {
  let qc: QueryClient;
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  it("fetches task detail and returns task + permitted_fields", async () => {
    const { result } = renderHook(() => useTaskDetail("VT-TASK-1", "SP-1"), {
      wrapper: makeWrapper(qc),
    });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.task.name).toBe("VT-TASK-1");
    expect(result.current.data!.permitted_fields).toContain("title");
  });

  it("uses placeholderData from sprint cache when available", async () => {
    qc.setQueryData(["sprintDetail", "SP-1"], {
      sprint: { name: "SP-1" },
      tasks: [{ name: "VT-TASK-2", title: "From cache", kanban_status: "Backlog" }],
    });
    const { result } = renderHook(() => useTaskDetail("VT-TASK-2", "SP-1"), {
      wrapper: makeWrapper(qc),
    });
    expect(result.current.isPlaceholderData || result.current.data !== undefined).toBe(true);
  });
});

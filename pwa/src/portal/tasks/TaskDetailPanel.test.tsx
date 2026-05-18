import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { TaskDetailPanel } from "./TaskDetailPanel";

vi.mock("./api/tasks", () => ({
  getTaskDetail: vi.fn(async (task: string) => ({
    task: {
      name: task,
      title: "Test Task Title",
      deadline: "2026-05-31",
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
    permitted_fields: ["title", "kanban_status", "pdca_phase", "priority", "estimated_hours", "deadline", "assigned_to"],
  })),
  updateTask: vi.fn(async (_task: string, payload: Record<string, unknown>) => ({
    task: {
      name: _task,
      title: (payload.title as string) ?? "Test Task Title",
      deadline: "2026-05-31",
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
  getTaskComments: vi.fn(async () => []),
  addComment: vi.fn(),
  deleteComment: vi.fn(),
}));

function makeWrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe("TaskDetailPanel", () => {
  let qc: QueryClient;
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.clearAllMocks();
  });

  it("renders task title after data loads", async () => {
    render(
      <TaskDetailPanel taskName="VT-TASK-1" sprintId="SP-1" currentUser="user@test.local" role="Manager" onClose={vi.fn()} />,
      { wrapper: makeWrapper(qc) },
    );
    await waitFor(() => expect(screen.getByDisplayValue("Test Task Title")).toBeInTheDocument());
  });

  it("renders title as editable input when in permitted_fields", async () => {
    render(
      <TaskDetailPanel taskName="VT-TASK-1" sprintId="SP-1" currentUser="user@test.local" role="Manager" onClose={vi.fn()} />,
      { wrapper: makeWrapper(qc) },
    );
    await waitFor(() => screen.getByDisplayValue("Test Task Title"));
    const input = screen.getByDisplayValue("Test Task Title") as HTMLInputElement;
    expect(input.tagName).toBe("INPUT");
  });

  it("calls updateTask on title blur", async () => {
    const { getByDisplayValue } = render(
      <TaskDetailPanel taskName="VT-TASK-1" sprintId="SP-1" currentUser="user@test.local" role="Manager" onClose={vi.fn()} />,
      { wrapper: makeWrapper(qc) },
    );
    await waitFor(() => getByDisplayValue("Test Task Title"));
    const input = getByDisplayValue("Test Task Title");
    fireEvent.change(input, { target: { value: "New Title" } });
    fireEvent.blur(input);
    const { updateTask } = await import("./api/tasks");
    await waitFor(() => expect(updateTask).toHaveBeenCalledWith("VT-TASK-1", expect.objectContaining({ title: "New Title" })));
  });

  it("calls onClose when Escape key is pressed", async () => {
    const onClose = vi.fn();
    render(
      <TaskDetailPanel taskName="VT-TASK-1" sprintId="SP-1" currentUser="user@test.local" role="Manager" onClose={onClose} />,
      { wrapper: makeWrapper(qc) },
    );
    await waitFor(() => screen.getByDisplayValue("Test Task Title"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("shows project and sprint as read-only text", async () => {
    render(
      <TaskDetailPanel taskName="VT-TASK-1" sprintId="SP-1" currentUser="user@test.local" role="Member" onClose={vi.fn()} />,
      { wrapper: makeWrapper(qc) },
    );
    await waitFor(() => screen.getByText("PR-1"));
    expect(screen.getByText("SP-1")).toBeInTheDocument();
  });
});

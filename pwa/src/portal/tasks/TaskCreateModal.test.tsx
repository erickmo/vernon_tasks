import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { TaskCreateModal } from "./TaskCreateModal";
import type { TaskCardData } from "../sprints/api/types";

type CreateTaskResult = { name: string; task: TaskCardData };

const mockCreateTask = vi.fn(async (_payload?: unknown): Promise<CreateTaskResult> => ({
  name: "VT-TASK-NEW",
  task: {
    name: "VT-TASK-NEW",
    title: "New task",
    assigned_to: "user@test.local",
    kanban_status: "Backlog",
    pdca_phase: "BACKLOG",
    kanban_rank: null,
    estimated_hours: 1,
    weight: 1,
    priority: "Medium",
    deadline: null,
  },
}));

vi.mock("./api/tasks", () => ({
  createTask: (payload: unknown) => mockCreateTask(payload),
}));

function makeWrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe("TaskCreateModal", () => {
  let qc: QueryClient;
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.clearAllMocks();
  });

  it("submit with empty title shows inline validation error, does not call createTask", () => {
    render(
      <TaskCreateModal sprintId="SP-1" projectId="PR-1" currentUser="user@test.local" onCreated={vi.fn()} onClose={vi.fn()} />,
      { wrapper: makeWrapper(qc) },
    );
    fireEvent.click(screen.getByRole("button", { name: /buat/i }));
    expect(screen.getByText(/title tidak boleh kosong/i)).toBeInTheDocument();
    expect(mockCreateTask).not.toHaveBeenCalled();
  });

  it("submit with valid payload calls createTask with correct sprint and project", async () => {
    render(
      <TaskCreateModal sprintId="SP-1" projectId="PR-1" currentUser="user@test.local" onCreated={vi.fn()} onClose={vi.fn()} />,
      { wrapper: makeWrapper(qc) },
    );
    fireEvent.change(screen.getByLabelText(/judul tugas/i), { target: { value: "My new task" } });
    fireEvent.click(screen.getByRole("button", { name: /buat/i }));
    await waitFor(() => expect(mockCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({ sprint: "SP-1", project: "PR-1", title: "My new task" }),
    ));
  });

  it("inserts optimistic tmp card into sprint cache before RPC resolves", async () => {
    qc.setQueryData(["sprintDetail", "SP-1"], {
      sprint: { name: "SP-1", project: "PR-1", status: "Active" },
      tasks: [],
    });
    let resolve!: () => void;
    mockCreateTask.mockImplementationOnce(
      () => new Promise<CreateTaskResult>((r) => {
        resolve = () => r({ name: "VT-TASK-NEW", task: { name: "VT-TASK-NEW", title: "Optimistic", assigned_to: null, kanban_status: "Backlog", pdca_phase: "BACKLOG", kanban_rank: null, estimated_hours: 1, weight: 1, priority: "Medium", deadline: null } });
      }),
    );
    render(
      <TaskCreateModal sprintId="SP-1" projectId="PR-1" currentUser="user@test.local" onCreated={vi.fn()} onClose={vi.fn()} />,
      { wrapper: makeWrapper(qc) },
    );
    fireEvent.change(screen.getByLabelText(/judul tugas/i), { target: { value: "Optimistic" } });
    fireEvent.click(screen.getByRole("button", { name: /buat/i }));
    await waitFor(() => {
      const data = qc.getQueryData<{ tasks: { name: string }[] }>(["sprintDetail", "SP-1"]);
      expect(data!.tasks.some((t) => t.name.startsWith("tmp-"))).toBe(true);
    });
    resolve();
    await waitFor(() => {
      const data = qc.getQueryData<{ tasks: { name: string }[] }>(["sprintDetail", "SP-1"]);
      expect(data!.tasks.some((t) => t.name === "VT-TASK-NEW")).toBe(true);
      expect(data!.tasks.every((t) => !t.name.startsWith("tmp-"))).toBe(true);
    });
  });

  it("failed RPC removes provisional card and modal stays open", async () => {
    qc.setQueryData(["sprintDetail", "SP-1"], {
      sprint: { name: "SP-1", project: "PR-1", status: "Active" },
      tasks: [],
    });
    mockCreateTask.mockRejectedValueOnce(new Error("Server error"));
    const onClose = vi.fn();
    render(
      <TaskCreateModal sprintId="SP-1" projectId="PR-1" currentUser="user@test.local" onCreated={vi.fn()} onClose={onClose} />,
      { wrapper: makeWrapper(qc) },
    );
    fireEvent.change(screen.getByLabelText(/judul tugas/i), { target: { value: "Fail task" } });
    fireEvent.click(screen.getByRole("button", { name: /buat/i }));
    await waitFor(() => expect(screen.getByText(/server error/i)).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
    const data = qc.getQueryData<{ tasks: { name: string }[] }>(["sprintDetail", "SP-1"]);
    expect(data!.tasks.every((t) => !t.name.startsWith("tmp-"))).toBe(true);
  });
});

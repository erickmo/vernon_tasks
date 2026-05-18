import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SprintsFeatureGate } from "./SprintsFeatureGate";
import { SprintRoutes } from "./SprintRoutes";
import { TaskBoard } from "./TaskBoard";
import type { SprintDetail } from "./api/types";

vi.mock("../../hooks/useVtSettings", () => ({
  useVtSettings: () => ({
    isLoading: false,
    data: {
      portal_enabled: 1,
      portal_okr_enabled: 0,
      portal_projects_enabled: 1,
      portal_sprints_enabled: 1,
    },
  }),
}));

vi.mock("./api/sprints", () => ({
  listSprints: vi.fn(async () => [
    {
      name: "SP-1", sprint_title: "S One", project: "PR-1",
      start_date: "2026-05-01", end_date: "2026-05-14",
      status: "Planning", goal: "", modified: "2026-05-01",
      task_count: 0, open_hours: 0, completed_hours: 0,
    },
  ]),
  bulkUpdateSprints: vi.fn(async () => ({ updated: [], skipped: [] })),
  createSprint: vi.fn(async () => ({ name: "SP-new" })),
  getSprintWithRelations: vi.fn(),
  getSprintBurndown: vi.fn(),
  moveTask: vi.fn(async () => ({})),
  rebalanceColumn: vi.fn(async () => ({})),
}));

describe("PortalRoutes sprint smoke", () => {
  it("renders SprintBoard at nested route", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/portal/projects/PR-1/sprints"]}>
          <Routes>
            <Route
              path="/portal/projects/:projectId/sprints/*"
              element={
                <SprintsFeatureGate>
                  <SprintRoutes />
                </SprintsFeatureGate>
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText("Planning")).toBeInTheDocument());
  });
});

vi.mock("../tasks/api/tasks", () => ({
  getTaskDetail: vi.fn(async (task: string) => ({
    task: {
      name: task, title: "Integration Task", deadline: null,
      assigned_to: null, assigned_to_full_name: null,
      kanban_status: "Backlog", priority: "Medium", base_points: 0,
      pdca_phase: "BACKLOG", completion_date: null,
      project: "PR-1", sprint: "SP-1", estimated_hours: 1, kanban_rank: 1000,
    },
    permitted_fields: ["title", "kanban_status", "pdca_phase"],
  })),
  updateTask: vi.fn(async () => ({})),
  getTaskComments: vi.fn(async () => []),
  addComment: vi.fn(),
  deleteComment: vi.fn(),
  createTask: vi.fn(async () => ({ name: "VT-TASK-NEW", task: {} })),
}));

describe("P3.3 integration: TaskDetailPanel + TaskCreateModal", () => {
  it("clicking a TaskCard opens TaskDetailPanel", async () => {
    const sprintDetail = {
      sprint: { name: "SP-1", project: "PR-1", status: "Active" as const, sprint_title: "S1", start_date: null, end_date: null, goal: null },
      project_summary: null,
      tasks: [{
        name: "VT-TASK-42", title: "My Task", assigned_to: null,
        kanban_status: "Backlog" as const, pdca_phase: "BACKLOG" as const,
        kanban_rank: 1000, estimated_hours: 2, weight: 1, priority: "Medium" as const, deadline: null,
      }],
    } satisfies SprintDetail;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(["sprintDetail", "SP-1"], sprintDetail);
    render(
      <QueryClientProvider client={qc}>
        <TaskBoard detail={sprintDetail} currentUser="user@test.local" canEditAll={true} userRole="Manager" />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByText("My Task"));
    await waitFor(() => expect(screen.getByRole("dialog", { name: /task detail/i })).toBeInTheDocument());
  });

  it("clicking + button opens TaskCreateModal", async () => {
    const sprintDetail = {
      sprint: { name: "SP-1", project: "PR-1", status: "Active" as const, sprint_title: "S1", start_date: null, end_date: null, goal: null },
      project_summary: null,
      tasks: [],
    } satisfies SprintDetail;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <TaskBoard detail={sprintDetail} currentUser="user@test.local" canEditAll={true} userRole="Manager" />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    await waitFor(() => expect(screen.getByRole("dialog", { name: /buat tugas baru/i })).toBeInTheDocument());
  });
});

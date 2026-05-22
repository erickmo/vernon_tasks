import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { ProjectPage } from ".";

vi.mock("../../../portal/projects/hooks/useProjects", () => ({
  useProjects: vi.fn(() => ({
    data: [{ name: "PROJ-001", title: "Alpha", status: "Open", pdca_phase: "DO",
              project_owner: "a@x.com", project_leader: "b@x.com",
              start_date: null, end_date: null, objective: null,
              linked_objective_title: null, team_count: 1,
              milestone_count: 0, sprint_count: 0, modified: "" }],
    isLoading: false,
  })),
}));
vi.mock("./useProjectTasks", () => ({
  useProjectTasks: vi.fn(() => ({
    data: [{ name: "VT-001", title: "Alpha Task", pdca_phase: "Do", priority: "High",
             assigned_to: "a@x.com", deadline: null, kanban_status: "Open",
             base_points: 10, completion_date: null }],
    isLoading: false,
  })),
  useInvalidateProjectTasks: vi.fn(() => vi.fn()),
}));
vi.mock("../../../auth/usePermissions", () => ({
  usePermissions: () => ({ hasPermission: () => false }),
}));
vi.mock("../../../api/mutations", () => ({
  completeTask: vi.fn().mockResolvedValue({}),
  logProgress: vi.fn().mockResolvedValue({}),
  snoozeTask: vi.fn().mockResolvedValue({}),
}));
vi.mock("../../../components/Toast", () => ({
  useToast: () => ({ show: vi.fn() }),
}));
vi.mock("./api", () => ({
  createTask: vi.fn().mockResolvedValue({}),
  updateTask: vi.fn().mockResolvedValue({}),
}));
vi.mock("./TaskSlideOver", () => ({
  TaskSlideOver: () => null,
}));
vi.mock("../../../components/SwipeRow", () => ({
  SwipeRow: ({ children }: { children: React.ReactNode }) => createElement("div", null, children),
}));
vi.mock("../../../components/TaskActions", () => ({
  TaskActions: () => null,
}));
vi.mock("../../../components/LogProgressModal", () => ({
  LogProgressModal: () => null,
}));

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(QueryClientProvider, { client: qc },
      createElement(MemoryRouter, null, ui)),
  );
}

describe("ProjectPage integration", () => {
  it("renders sidebar with project list", async () => {
    wrap(<ProjectPage />);
    await waitFor(() => expect(screen.getByText("Alpha")).toBeInTheDocument());
  });

  it("clicking project row shows task panel with tasks", async () => {
    wrap(<ProjectPage />);
    await waitFor(() => fireEvent.click(screen.getByText("Alpha")));
    await waitFor(() => expect(screen.getByText("Alpha Task")).toBeInTheDocument());
  });
});

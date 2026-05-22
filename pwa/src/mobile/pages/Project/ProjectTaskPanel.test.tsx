import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { ProjectTaskPanel } from "./ProjectTaskPanel";

vi.mock("./useProjectTasks", () => ({
  useProjectTasks: vi.fn(() => ({ data: undefined, isLoading: false })),
  useInvalidateProjectTasks: vi.fn(() => vi.fn()),
}));
vi.mock("../../../api/mutations", () => ({
  completeTask: vi.fn().mockResolvedValue({}),
  logProgress: vi.fn().mockResolvedValue({}),
  snoozeTask: vi.fn().mockResolvedValue({}),
}));
vi.mock("./api", () => ({
  createTask: vi.fn().mockResolvedValue({ name: "VT-NEW", title: "New T",
    pdca_phase: "Plan", priority: "Medium", assigned_to: null,
    deadline: null, kanban_status: "Open", base_points: 10, completion_date: null }),
  updateTask: vi.fn().mockResolvedValue({ name: "VT-001", title: "Updated",
    pdca_phase: "Plan", priority: "Medium", assigned_to: null,
    deadline: null, kanban_status: "Open", base_points: 10, completion_date: null }),
}));
vi.mock("./TaskSlideOver", () => ({
  TaskSlideOver: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? createElement("div", { "data-testid": "slide-over" },
      createElement("button", { onClick: onClose }, "close-slide")) : null,
}));
vi.mock("../../../components/SwipeRow", () => ({
  SwipeRow: ({ children }: { children: React.ReactNode }) => createElement("div", null, children),
}));
vi.mock("../../../components/TaskActions", () => ({
  TaskActions: () => createElement("div", { "data-testid": "task-actions" }),
}));
vi.mock("../../../components/LogProgressModal", () => ({
  LogProgressModal: () => null,
}));
vi.mock("../../../components/Toast", () => ({
  useToast: () => ({ show: vi.fn() }),
}));

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(createElement(QueryClientProvider, { client: qc }, ui));
}

describe("ProjectTaskPanel", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("shows empty state when no project selected", () => {
    wrap(<ProjectTaskPanel projectId={null} projectTitle={null} />);
    expect(screen.getByText(/pilih proyek/i)).toBeInTheDocument();
  });

  it("renders task rows from hook data", async () => {
    const { useProjectTasks } = await import("./useProjectTasks");
    vi.mocked(useProjectTasks).mockReturnValue({
      data: [
        { name: "VT-001", title: "Alpha Task", pdca_phase: "Do", priority: "High",
          assigned_to: "a@x.com", deadline: null, kanban_status: "Open",
          base_points: 10, completion_date: null },
      ],
      isLoading: false,
    } as ReturnType<typeof useProjectTasks>);
    wrap(<ProjectTaskPanel projectId="PROJ-001" projectTitle="Alpha" />);
    await waitFor(() => expect(screen.getByText("Alpha Task")).toBeInTheDocument());
  });

  it("shows loading skeleton when isLoading=true", async () => {
    const { useProjectTasks } = await import("./useProjectTasks");
    vi.mocked(useProjectTasks).mockReturnValue({
      data: undefined, isLoading: true,
    } as ReturnType<typeof useProjectTasks>);
    wrap(<ProjectTaskPanel projectId="PROJ-001" projectTitle="Alpha" />);
    expect(document.querySelector("[data-testid='task-skeleton']")).toBeInTheDocument();
  });

  it("filters tasks by PDCA phase chip click", async () => {
    const { useProjectTasks } = await import("./useProjectTasks");
    const mockHook = vi.mocked(useProjectTasks);
    mockHook.mockReturnValue({ data: [], isLoading: false } as ReturnType<typeof useProjectTasks>);
    wrap(<ProjectTaskPanel projectId="PROJ-001" projectTitle="Alpha" />);
    fireEvent.click(screen.getByRole("button", { name: "Do" }));
    await waitFor(() => {
      const lastCall = mockHook.mock.calls[mockHook.mock.calls.length - 1];
      expect(lastCall[1]).toEqual(expect.objectContaining({ pdca_phase: "Do" }));
    });
  });
});

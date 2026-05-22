import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { ProjectSidebar } from "./ProjectSidebar";
import type { ProjectRow } from "../../../portal/projects/api/types";

vi.mock("../../../portal/projects/hooks/useProjects", () => ({
  useProjects: vi.fn(() => ({ data: [], isLoading: false })),
}));
vi.mock("../../../auth/usePermissions", () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));
vi.mock("../../../portal/projects/api/projects", () => ({
  createProject: vi.fn().mockResolvedValue({}),
  updateProject: vi.fn().mockResolvedValue({}),
  deleteProject: vi.fn().mockResolvedValue(undefined),
}));

const makeProject = (overrides: Partial<ProjectRow> = {}): ProjectRow => ({
  name: "PROJ-001", title: "Alpha", status: "Open", pdca_phase: "DO",
  project_owner: "a@x.com", project_leader: "b@x.com",
  start_date: null, end_date: null, objective: null,
  linked_objective_title: null, team_count: 2,
  milestone_count: 0, sprint_count: 1, modified: "",
  ...overrides,
});

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(createElement(QueryClientProvider, { client: qc }, ui));
}

describe("ProjectSidebar", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("renders Aktif tab as default", () => {
    wrap(<ProjectSidebar selectedId={null} onSelect={vi.fn()} />);
    const aktifBtn = screen.getByRole("button", { name: "Aktif" });
    expect(aktifBtn).toBeInTheDocument();
  });

  it("renders project rows from hook data", async () => {
    const { useProjects } = await import("../../../portal/projects/hooks/useProjects");
    vi.mocked(useProjects).mockReturnValue({
      data: [makeProject()], isLoading: false,
    } as ReturnType<typeof useProjects>);
    wrap(<ProjectSidebar selectedId={null} onSelect={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Alpha")).toBeInTheDocument());
  });

  it("calls onSelect with project name and title on row click", async () => {
    const { useProjects } = await import("../../../portal/projects/hooks/useProjects");
    vi.mocked(useProjects).mockReturnValue({
      data: [makeProject()], isLoading: false,
    } as ReturnType<typeof useProjects>);
    const onSelect = vi.fn();
    wrap(<ProjectSidebar selectedId={null} onSelect={onSelect} />);
    await waitFor(() => fireEvent.click(screen.getByText("Alpha")));
    expect(onSelect).toHaveBeenCalledWith("PROJ-001", "Alpha");
  });

  it("filters project list by search input", async () => {
    const { useProjects } = await import("../../../portal/projects/hooks/useProjects");
    vi.mocked(useProjects).mockReturnValue({
      data: [makeProject({ name: "PROJ-001", title: "Alpha Project" }), makeProject({ name: "PROJ-002", title: "Beta Project" })],
      isLoading: false,
    } as ReturnType<typeof useProjects>);
    wrap(<ProjectSidebar selectedId={null} onSelect={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Alpha Project")).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText(/cari proyek/i), { target: { value: "beta" } });
    expect(screen.queryByText("Alpha Project")).not.toBeInTheDocument();
    expect(screen.getByText("Beta Project")).toBeInTheDocument();
  });
});

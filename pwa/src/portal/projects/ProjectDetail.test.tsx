import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ProjectDetail } from "./ProjectDetail";
import * as projApi from "./api/projects";
import * as okrApi from "../okr/api/objectives";
import * as permsHook from "../../auth/usePermissions";

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter>{node}</MemoryRouter></QueryClientProvider>);
}

function mockPerms(perms: string[]) {
  vi.spyOn(permsHook, "usePermissions").mockReturnValue({
    isLoading: false, permissions: perms, roles: [],
    hasPermission: (p: string) => perms.includes(p),
    hasAnyPermission: (ps: string[]) => ps.some((p) => perms.includes(p)),
    hasRole: () => false,
  } as ReturnType<typeof permsHook.usePermissions>);
}

const detail = {
  project: {
    name: "P-1", title: "Alpha", project_owner: "u1", project_leader: "l1",
    start_date: "2026-04-01", end_date: "2026-06-30",
    status: "On Track", pdca_phase: "DO", objective: null,
  },
  linked_objective_summary: null,
  counts: { team_members: 3, milestones: 1, sprints: 2, documentation: 4 },
};

describe("ProjectDetail", () => {
  it("placeholder when name null", () => {
    mockPerms(["project.read"]);
    wrap(<ProjectDetail name={null} />);
    expect(screen.getByText(/select a project/i)).toBeInTheDocument();
  });

  it("renders header + counts", async () => {
    mockPerms(["project.read"]);
    vi.spyOn(projApi, "getProjectWithRelations").mockResolvedValue(detail as any);
    wrap(<ProjectDetail name="P-1" />);
    await waitFor(() => expect(screen.getByRole("heading", { name: /alpha/i })).toBeInTheDocument());
    // team count rendered as <strong>3</strong>
    expect(screen.getByText("Team:").parentElement?.textContent).toContain("3");
  });

  it("shows Sprints nav link", async () => {
    mockPerms(["project.read"]);
    vi.spyOn(projApi, "getProjectWithRelations").mockResolvedValue(detail as any);
    wrap(<ProjectDetail name="P-1" />);
    await waitFor(() => expect(screen.getByRole("heading", { name: /alpha/i })).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /sprints/i })).toBeInTheDocument();
  });

  it("renders ObjectiveLink when objective set", async () => {
    mockPerms(["project.read"]);
    const linkedDetail = {
      project: { ...detail.project, objective: "OBJ-1" },
      linked_objective_summary: null,
      counts: detail.counts,
    };
    vi.spyOn(projApi, "getProjectWithRelations").mockResolvedValue(linkedDetail as any);
    vi.spyOn(okrApi, "getObjectiveWithKrs").mockResolvedValue({
      objective: { name: "OBJ-1", title: "Linked Obj", period: "2026-Q2", status: "Open", pdca_phase: "PLAN" },
      key_results: [],
    } as any);
    wrap(<ProjectDetail name="P-1" />);
    await waitFor(() => expect(screen.getByText(/linked obj/i)).toBeInTheDocument());
  });
});

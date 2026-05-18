import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ProjectList } from "./ProjectList";
import * as projApi from "./api/projects";
import type { ProjectRow } from "./api/types";

const rows: ProjectRow[] = [
  {
    name: "P-1",
    title: "Alpha",
    project_owner: "u1",
    project_leader: "l1",
    start_date: "2026-04-01",
    end_date: "2026-06-30",
    status: "On Track",
    pdca_phase: "DO",
    objective: null,
    linked_objective_title: null,
    team_count: 0,
    milestone_count: 0,
    sprint_count: 0,
    modified: "2026-05-10",
  },
];

function wrap(initial = "/portal/projects") {
  vi.spyOn(projApi, "listProjects").mockResolvedValue(rows);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initial]}>
        <ProjectList />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ProjectList", () => {
  it("renders filters, table, detail placeholder", async () => {
    wrap();
    await waitFor(() => expect(screen.getByText("Alpha")).toBeInTheDocument());
    expect(screen.getByRole("region", { name: /projects filters/i })).toBeInTheDocument();
    expect(screen.getByText(/select a project/i)).toBeInTheDocument();
  });

  it("shows New Project link", async () => {
    wrap();
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /new project/i })).toBeInTheDocument(),
    );
  });
});

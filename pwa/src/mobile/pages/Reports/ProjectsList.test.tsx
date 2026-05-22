import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProjectsList } from "./ProjectsList";

vi.mock("./hooks/useManagedProjects", () => ({
  useManagedProjects: vi.fn(),
}));
import { useManagedProjects } from "./hooks/useManagedProjects";

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ProjectsList />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ProjectsList", () => {
  it("renders empty state when no projects", () => {
    (useManagedProjects as any).mockReturnValue({ projects: [], isLoading: false, isError: false, refetch: vi.fn() });
    renderPage();
    expect(screen.getByText(/No projects/i)).toBeInTheDocument();
  });

  it("renders one card per project with KPI chips", () => {
    (useManagedProjects as any).mockReturnValue({
      projects: [{ name: "VTP-1", project_title: "Alpha", status: "Active", avg_velocity: 8.2, risk_count: 1, member_count: 5 }],
      isLoading: false, isError: false, refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByText(/Alpha/i)).toBeInTheDocument();
    expect(screen.getByText(/8\.2/)).toBeInTheDocument();
    expect(screen.getByText(/1 risk/i)).toBeInTheDocument();
    expect(screen.getByText(/5 members/i)).toBeInTheDocument();
  });
});

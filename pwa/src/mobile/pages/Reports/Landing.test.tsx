import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Landing } from "./Landing";

vi.mock("./hooks/useReportsAccess", () => ({
  useReportsAccess: vi.fn(),
}));
import { useReportsAccess } from "./hooks/useReportsAccess";

function renderWithRouter() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Landing", () => {
  it("member (no managed projects) sees only My Reports card", () => {
    (useReportsAccess as any).mockReturnValue({
      canMyReports: true, canProjects: false, canTeam: false, isLoading: false,
    });
    renderWithRouter();
    expect(screen.getByText(/My Reports/i)).toBeInTheDocument();
    expect(screen.queryByText(/Projects I Manage/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/My Team/i)).not.toBeInTheDocument();
  });

  it("leader with projects sees all 3 cards", () => {
    (useReportsAccess as any).mockReturnValue({
      canMyReports: true, canProjects: true, canTeam: true, isLoading: false,
    });
    renderWithRouter();
    expect(screen.getByText(/My Reports/i)).toBeInTheDocument();
    expect(screen.getByText(/Projects I Manage/i)).toBeInTheDocument();
    expect(screen.getByText(/My Team/i)).toBeInTheDocument();
  });
});

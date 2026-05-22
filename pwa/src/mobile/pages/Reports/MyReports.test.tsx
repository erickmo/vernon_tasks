import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MyReports } from "./MyReports";

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/m/reports/me"]}>
        <MyReports />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("MyReports", () => {
  it("renders header + tabs", () => {
    renderPage();
    expect(screen.getByText(/My Reports/i)).toBeInTheDocument();
    expect(screen.getByText(/Leaderboard/i)).toBeInTheDocument();
    expect(screen.getByText(/Velocity/i)).toBeInTheDocument();
    expect(screen.getByText(/Streak/i)).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";
import { TopNav } from "./TopNav";

vi.mock("../hooks/useUnreadCount", () => ({
  useUnreadCount: () => ({ data: 0 }),
}));

function Wrapper({ path }: { path: string }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="*" element={<TopNav />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("TopNav", () => {
  it("renders logo link to /m/dashboard", () => {
    render(<Wrapper path="/m/dashboard" />);
    const logo = screen.getByRole("link", { name: /vernon/i });
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute("href", "/m/dashboard");
  });

  it("renders navbar2 with Dashboard, Project, Report tabs", () => {
    render(<Wrapper path="/m/dashboard" />);
    // "Dashboard" appears in both breadcrumb and navbar2 tab
    expect(screen.getAllByText("Dashboard").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Project")).toBeInTheDocument();
    expect(screen.getByText("Report")).toBeInTheDocument();
  });

  it("shows Project breadcrumb on /m/work (redirect compat)", () => {
    render(<Wrapper path="/m/work" />);
    expect(screen.getAllByText("Project").length).toBeGreaterThanOrEqual(1);
  });

  it("shows Project breadcrumb on /m/project", () => {
    render(<Wrapper path="/m/project" />);
    expect(screen.getAllByText("Project").length).toBeGreaterThanOrEqual(1);
  });

  it("shows Analytics breadcrumb on /m/analytics", () => {
    render(<Wrapper path="/m/analytics" />);
    expect(screen.getByText("Analytics")).toBeInTheDocument();
  });

  it("renders notification button", () => {
    render(<Wrapper path="/m/dashboard" />);
    expect(screen.getByRole("button", { name: /notifikasi/i })).toBeInTheDocument();
  });

  it("renders avatar dropdown button", () => {
    render(<Wrapper path="/m/dashboard" />);
    expect(screen.getByRole("button", { name: /menu akun/i })).toBeInTheDocument();
  });
});

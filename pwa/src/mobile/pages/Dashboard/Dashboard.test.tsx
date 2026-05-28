import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";
import { DashboardLayout } from "./index";
import { MeTab } from "./MeTab";
import { ProjectsTab } from "./ProjectsTab";
import { ScheduleTab } from "./ScheduleTab";

vi.mock("../../../api/dashboard", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../../../api/dashboard");
  return {
    ...actual,
    fetchMeProgress: vi.fn().mockResolvedValue({
      velocity: Array.from({ length: 8 }, (_, i) => ({ week: `2026-W${i + 1}`, done: i })),
      velocity_delta: 1,
      sprint: null,
      workload: { open: 5, overdue: 2, due_soon: 1 },
      next_actions: [],
    }),
    fetchMyProjects: vi.fn().mockResolvedValue({
      is_admin: false,
      led: [],
      member: [],
    }),
    fetchScheduleAgenda: vi.fn().mockResolvedValue({
      today_summary: { tasks: 1, meetings: 0, sprint_events: 0 },
      days: [],
    }),
  };
});

function Wrapper({ path }: { path: string }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/m/dashboard" element={<DashboardLayout />}>
            <Route index element={<Navigate to="/m/dashboard/me" replace />} />
            <Route path="me" element={<MeTab />} />
            <Route path="projects" element={<ProjectsTab />} />
            <Route path="schedule" element={<ScheduleTab />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("DashboardLayout", () => {
  it("renders header + tab strip", async () => {
    render(<Wrapper path="/m/dashboard/me" />);
    expect(screen.getByRole("heading", { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByText("Saya")).toBeInTheDocument();
    expect(screen.getByText("Proyek")).toBeInTheDocument();
    expect(screen.getByText("Jadwal")).toBeInTheDocument();
  });

  it("redirects /m/dashboard to /m/dashboard/me", async () => {
    render(<Wrapper path="/m/dashboard" />);
    await waitFor(() => {
      expect(screen.getAllByText(/sprint aktif/i).length).toBeGreaterThan(0);
    });
  });

  it("renders MeTab workload chips", async () => {
    render(<Wrapper path="/m/dashboard/me" />);
    await waitFor(() => expect(screen.getByText("Open")).toBeInTheDocument());
    expect(screen.getByText("Overdue")).toBeInTheDocument();
    expect(screen.getByText("Due ≤ 3d")).toBeInTheDocument();
  });

  it("renders ScheduleTab today chips", async () => {
    render(<Wrapper path="/m/dashboard/schedule" />);
    await waitFor(() => expect(screen.getByText(/tasks due/i)).toBeInTheDocument());
    expect(screen.getByText(/meetings/i)).toBeInTheDocument();
  });

  it("renders ProjectsTab filter strip", async () => {
    render(<Wrapper path="/m/dashboard/projects" />);
    await waitFor(() => expect(screen.getByText("Semua")).toBeInTheDocument());
    expect(screen.getByText("Saya pimpin")).toBeInTheDocument();
    expect(screen.getByText("Berisiko")).toBeInTheDocument();
  });

  it("tab strip exposes nav landmark with aria-label", async () => {
    render(<Wrapper path="/m/dashboard/me" />);
    const nav = screen.getByRole("navigation", { name: /dashboard tabs/i });
    expect(nav).toBeInTheDocument();
    // active link gets aria-current=page from NavLink
    await waitFor(() => {
      const active = nav.querySelector('a[aria-current="page"]');
      expect(active?.textContent).toMatch(/saya/i);
    });
  });
});

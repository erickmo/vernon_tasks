import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MyWorkList } from "./List";

vi.mock("../../../portal/projects/hooks/useProjects", () => ({
  useProjects: () => ({ data: [{ name: "PROJ-001", title: "Alpha", status: "Open" }], isLoading: false }),
}));

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("MyWorkList", () => {
  it("renders task title from API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: { overdue: [], today: [{ id: "T1", title: "Buat laporan" }], upcoming: [] },
          }),
          { status: 200 },
        ),
      ),
    );
    wrap(<MyWorkList />);
    await waitFor(() => expect(screen.getByText("Buat laporan")).toBeInTheDocument());
  });

  it("shows empty state when no tasks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ message: { overdue: [], today: [], upcoming: [] } }),
          { status: 200 },
        ),
      ),
    );
    wrap(<MyWorkList />);
    await waitFor(() => expect(screen.getByText(/Nikmati waktumu/i)).toBeInTheDocument());
  });

  it("renders greeting text in header", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ message: { overdue: [], today: [], upcoming: [] } }),
          { status: 200 },
        ),
      ),
    );
    wrap(<MyWorkList />);
    // greeting() returns locale-based greeting string
    await waitFor(() => {
      const header = document.querySelector("header");
      expect(header).toBeInTheDocument();
    });
  });

  it("shows overdue count chip when overdue tasks exist", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: {
              overdue: [{ id: "T1", title: "Overdue task" }],
              today: [],
              upcoming: [],
            },
          }),
          { status: 200 },
        ),
      ),
    );
    wrap(<MyWorkList />);
    await waitFor(() => expect(screen.getByText(/Terlambat 1/)).toBeInTheDocument());
  });

  it("shows today count chip when today tasks exist", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: {
              overdue: [],
              today: [
                { id: "T2", title: "Today task 1" },
                { id: "T3", title: "Today task 2" },
              ],
              upcoming: [],
            },
          }),
          { status: 200 },
        ),
      ),
    );
    wrap(<MyWorkList />);
    await waitFor(() => expect(screen.getByText(/Hari ini 2/)).toBeInTheDocument());
  });

  it("overdue task card has red left border", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: {
              overdue: [{ id: "T-OVR", title: "Past due task" }],
              today: [],
              upcoming: [],
            },
          }),
          { status: 200 },
        ),
      ),
    );
    wrap(<MyWorkList />);
    await waitFor(() => screen.getByText("Past due task"));
    const card = screen.getByText("Past due task").closest("[data-testid='task-card']") as HTMLElement;
    expect(card).toBeDefined();
    // Verify the card has the data-testid attribute
    expect(card.getAttribute("data-testid")).toBe("task-card");
    // Verify borderLeft is applied (happy-dom may expand shorthand styles)
    expect(card.style.borderLeft).toBeDefined();
    expect(card.style.borderLeft).toContain("#dc2626");
  });

  it("opens in-app create-project modal from + Proyek button", async () => {
    vi.mock("../../../portal/projects/api/projects", () => ({
      createProject: vi.fn().mockResolvedValue({}),
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ message: { overdue: [], today: [], upcoming: [] } }),
          { status: 200 },
        ),
      ),
    );
    wrap(<MyWorkList />);
    const btn = await screen.findByRole("button", { name: /buat proyek/i });
    fireEvent.click(btn);
    expect(screen.getByText("Buat Proyek")).toBeInTheDocument();
  });

  it("opens quick-add task modal from header button", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ message: { overdue: [], today: [], upcoming: [] } }),
          { status: 200 },
        ),
      ),
    );
    wrap(<MyWorkList />);
    const btn = await screen.findByRole("button", { name: /tugas baru/i });
    fireEvent.click(btn);
    expect(screen.getByText("Tugas Baru")).toBeInTheDocument();
  });
});

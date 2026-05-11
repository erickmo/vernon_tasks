import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MyWorkList } from "./List";

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
});

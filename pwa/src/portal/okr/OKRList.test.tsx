import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { OKRList } from "./OKRList";
import * as objApi from "./api/objectives";
import type { ObjectiveRow } from "./api/types";

const rows: ObjectiveRow[] = [
  { name: "O-1", title: "Alpha", period: "2026-Q1", period_start: "2026-01-01", period_end: "2026-03-31",
    objective_owner: "u1", status: "Open", pdca_phase: "PLAN", modified: "2026-01-10", progress_avg: 10 },
];

function wrap(initial = "/portal/okr") {
  vi.spyOn(objApi, "listObjectives").mockResolvedValue(rows);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initial]}><OKRList /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("OKRList", () => {
  it("renders filters, table, detail placeholder", async () => {
    wrap();
    await waitFor(() => expect(screen.getByText("Alpha")).toBeInTheDocument());
    expect(screen.getByRole("region", { name: /okr filters/i })).toBeInTheDocument();
    expect(screen.getByText(/select an objective/i)).toBeInTheDocument();
  });

  it("shows New Objective link", async () => {
    wrap();
    await waitFor(() => expect(screen.getByRole("link", { name: /new objective/i })).toBeInTheDocument());
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ObjectiveDetail } from "./ObjectiveDetail";
import * as objApi from "./api/objectives";

const detail = {
  objective: {
    name: "O-1",
    title: "Alpha",
    period: "2026-Q1",
    description: "desc",
    objective_owner: "u1",
    status: "Open",
    pdca_phase: "PLAN",
  },
  key_results: [
    {
      name: "KR-1",
      metric: "MRR",
      target_value: 100,
      current_value: 40,
      unit: "k",
      progress_percent: 40,
      modified: "2026-05-01",
    },
  ],
};

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ObjectiveDetail", () => {
  it("renders objective + KRs from query", async () => {
    vi.spyOn(objApi, "getObjectiveWithKrs").mockResolvedValue(detail as never);
    wrap(<ObjectiveDetail name="O-1" />);
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /alpha/i })).toBeInTheDocument(),
    );
    expect(screen.getByText("MRR")).toBeInTheDocument();
    expect(screen.getByText("desc")).toBeInTheDocument();
  });

  it("placeholder when no name", () => {
    wrap(<ObjectiveDetail name={null} />);
    expect(screen.getByText(/select an objective/i)).toBeInTheDocument();
  });
});

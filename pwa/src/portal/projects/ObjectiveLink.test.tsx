import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ObjectiveLink } from "./ObjectiveLink";
import * as okrApi from "../okr/api/objectives";

const detail = {
  objective: { name: "OBJ-1", title: "Linked Obj", period: "2026-Q2", status: "Open", pdca_phase: "PLAN" },
  key_results: [
    { name: "KR-1", metric: "X", target_value: 100, current_value: 40, unit: "k", progress_percent: 40, modified: "2026-05-01" },
    { name: "KR-2", metric: "Y", target_value: 100, current_value: 60, unit: "k", progress_percent: 60, modified: "2026-05-01" },
  ],
};

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter>{node}</MemoryRouter></QueryClientProvider>);
}

describe("ObjectiveLink", () => {
  it("renders nothing when objectiveName null", () => {
    const { container } = wrap(<ObjectiveLink projectName="P-1" objectiveName={null} />);
    expect(container.textContent).toBe("");
  });

  it("renders card when data loaded", async () => {
    vi.spyOn(okrApi, "getObjectiveWithKrs").mockResolvedValue(detail as any);
    wrap(<ObjectiveLink projectName="P-1" objectiveName="OBJ-1" />);
    await waitFor(() => expect(screen.getByText(/linked obj/i)).toBeInTheDocument());
    expect(screen.getByText(/2026-Q2/)).toBeInTheDocument();
  });

  it("shows skeleton during loading", () => {
    vi.spyOn(okrApi, "getObjectiveWithKrs").mockImplementation(() => new Promise(() => {}));
    wrap(<ObjectiveLink projectName="P-1" objectiveName="OBJ-1" />);
    expect(document.querySelector('[data-testid="objective-link-skeleton"]')).not.toBeNull();
  });
});

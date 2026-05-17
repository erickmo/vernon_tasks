import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ObjectiveTable } from "./ObjectiveTable";
import type { ObjectiveRow } from "./api/types";

const rows: ObjectiveRow[] = [
  {
    name: "O-1",
    title: "Alpha",
    period: "2026-Q1",
    period_start: "2026-01-01",
    period_end: "2026-03-31",
    objective_owner: "u1",
    status: "Open",
    pdca_phase: "PLAN",
    modified: "2026-01-10",
    progress_avg: 10,
  },
  {
    name: "O-2",
    title: "Bravo",
    period: "2026-Q2",
    period_start: "2026-04-01",
    period_end: "2026-06-30",
    objective_owner: "u2",
    status: "On Track",
    pdca_phase: "DO",
    modified: "2026-05-10",
    progress_avg: 60,
  },
];

describe("ObjectiveTable", () => {
  it("renders rows", () => {
    render(
      <MemoryRouter>
        <ObjectiveTable rows={rows} selected={new Set()} onSelectChange={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Bravo")).toBeInTheDocument();
  });

  it("emits select change when checkbox clicked", () => {
    const cb = vi.fn();
    render(
      <MemoryRouter>
        <ObjectiveTable rows={rows} selected={new Set()} onSelectChange={cb} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getAllByRole("checkbox", { name: /select objective/i })[0]);
    expect(cb).toHaveBeenCalled();
    const arg = cb.mock.calls[0][0] as Set<string>;
    expect(arg.has("O-1")).toBe(true);
  });
});

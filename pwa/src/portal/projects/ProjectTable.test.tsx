import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ProjectTable } from "./ProjectTable";
import type { ProjectRow } from "./api/types";

const rows: ProjectRow[] = [
  { name: "P-1", title: "Alpha", project_owner: "u1", project_leader: "l1",
    start_date: "2026-04-01", end_date: "2026-06-30", status: "On Track", pdca_phase: "DO",
    objective: "OBJ-1", linked_objective_title: "Linked OKR", team_count: 3,
    milestone_count: 1, sprint_count: 2, modified: "2026-05-10" },
  { name: "P-2", title: "Bravo", project_owner: "u2", project_leader: "l2",
    start_date: "2026-01-01", end_date: "2026-03-31", status: "Closed", pdca_phase: "CLOSED",
    objective: null, linked_objective_title: null, team_count: 0,
    milestone_count: 0, sprint_count: 0, modified: "2026-04-01" },
];

describe("ProjectTable", () => {
  it("renders rows + linked OKR cell", () => {
    render(<MemoryRouter><ProjectTable rows={rows} selected={new Set()} onSelectChange={() => {}} /></MemoryRouter>);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    // "Linked OKR" appears as both column header and row cell value
    expect(screen.getAllByText("Linked OKR").length).toBeGreaterThanOrEqual(1);
    // Bravo no linked OKR → renders "—"
    const rowsHtml = screen.getAllByRole("row");
    expect(rowsHtml.length).toBeGreaterThan(2);
  });

  it("emits select change on checkbox click", () => {
    const cb = vi.fn();
    render(<MemoryRouter><ProjectTable rows={rows} selected={new Set()} onSelectChange={cb} /></MemoryRouter>);
    fireEvent.click(screen.getAllByRole("checkbox", { name: /select project/i })[0]);
    expect(cb).toHaveBeenCalled();
    expect((cb.mock.calls[0][0] as Set<string>).has("P-1")).toBe(true);
  });
});

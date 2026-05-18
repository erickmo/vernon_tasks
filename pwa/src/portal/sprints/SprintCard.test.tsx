import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SprintCard } from "./SprintCard";
import type { SprintRow } from "./api/types";

const row: SprintRow = {
  name: "SP-1", sprint_title: "Sprint One", project: "PR-1",
  start_date: "2026-05-18", end_date: "2026-05-31", status: "Active",
  goal: "Ship P3.2", modified: "2026-05-18", task_count: 5,
  open_hours: 10, completed_hours: 6,
};

describe("SprintCard", () => {
  it("renders title and dates", () => {
    render(<MemoryRouter><SprintCard row={row} /></MemoryRouter>);
    expect(screen.getByText("Sprint One")).toBeInTheDocument();
    expect(screen.getByText(/2026-05-18/)).toBeInTheDocument();
  });
  it("renders task count and hours", () => {
    render(<MemoryRouter><SprintCard row={row} /></MemoryRouter>);
    expect(screen.getByText(/5 tasks/i)).toBeInTheDocument();
    expect(screen.getByText(/6 \/ 16h/i)).toBeInTheDocument();
  });
});

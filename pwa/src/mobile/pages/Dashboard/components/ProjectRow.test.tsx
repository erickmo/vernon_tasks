import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect } from "vitest";
import { ProjectRow } from "./ProjectRow";

function wrap(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("ProjectRow", () => {
  it("renders name and my_open_tasks", () => {
    wrap(
      <ProjectRow
        data={{ id: "P1", name: "Alpha", pct_done: 33.0, next_milestone: null, my_open_tasks: 4 }}
      />,
    );
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText(/4 task saya/)).toBeInTheDocument();
  });

  it("omits milestone segment when next_milestone is null", () => {
    wrap(
      <ProjectRow
        data={{ id: "P1", name: "Alpha", pct_done: 33, next_milestone: null, my_open_tasks: 4 }}
      />,
    );
    expect(screen.queryByText(/MS /)).toBeNull();
  });

  it("shows milestone short date when next_milestone present", () => {
    wrap(
      <ProjectRow
        data={{
          id: "P1",
          name: "Alpha",
          pct_done: 33,
          next_milestone: "2026-06-15",
          my_open_tasks: 4,
        }}
      />,
    );
    expect(screen.getByText(/MS /)).toBeInTheDocument();
  });
});

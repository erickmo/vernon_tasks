import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect } from "vitest";
import { ProjectCard } from "./ProjectCard";
import type { ProjectCard as ProjectCardData } from "../../../../api/dashboard";

const base: ProjectCardData = {
  id: "PROJ-1",
  name: "Vernon Tasks",
  status: "Active",
  sprint: null,
  pct_done: 42.7,
  open_tasks: 12,
  blockers: 0,
  risk: "on_track",
};

function wrap(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("ProjectCard", () => {
  it("renders name, status, risk badge", () => {
    wrap(<ProjectCard data={base} />);
    expect(screen.getByText("Vernon Tasks")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("On track")).toBeInTheDocument();
  });

  it("rounds pct_done and shows blocker count", () => {
    wrap(<ProjectCard data={{ ...base, pct_done: 42.7, blockers: 3 }} />);
    expect(screen.getByText("43%")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("hides burndown when sprint is null", () => {
    const { container } = wrap(<ProjectCard data={base} />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("renders burndown SVG when sprint has ≥2 ideal points", () => {
    const { container } = wrap(
      <ProjectCard
        data={{
          ...base,
          sprint: {
            name: "S1",
            start: "2026-05-01",
            end: "2026-05-14",
            burndown_ideal: [10, 8, 6, 4, 2, 0],
            burndown_actual: [10, 9, 7, 6, 5, 4],
          },
        }}
      />,
    );
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.querySelectorAll("path")).toHaveLength(2);
  });

  it("links to /m/project/:id", () => {
    wrap(<ProjectCard data={base} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/m/project/PROJ-1");
  });
});

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect } from "vitest";
import { NextActionsList } from "./NextActionsList";
import type { NextAction } from "../../../../api/dashboard";

function wrap(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

const items: NextAction[] = [
  { id: "T1", title: "Fix login", project: "Auth", deadline: "2026-06-01", priority: "High" },
  { id: "T2", title: "Write docs", project: null, deadline: null, priority: "Low" },
];

describe("NextActionsList", () => {
  it("renders empty placeholder when items is []", () => {
    wrap(<NextActionsList items={[]} />);
    expect(screen.getByText(/tidak ada tindakan berikutnya/i)).toBeInTheDocument();
  });

  it("renders rows + see-all link when items present", () => {
    wrap(<NextActionsList items={items} />);
    expect(screen.getByText("Fix login")).toBeInTheDocument();
    expect(screen.getByText("Write docs")).toBeInTheDocument();
    expect(screen.getByText(/lihat semua/i)).toBeInTheDocument();
  });

  it("falls back to id when title is null", () => {
    wrap(
      <NextActionsList
        items={[{ id: "T9", title: null, project: null, deadline: null, priority: null }]}
      />,
    );
    expect(screen.getByText("T9")).toBeInTheDocument();
  });

  it("shows em dash when project is null", () => {
    wrap(
      <NextActionsList
        items={[{ id: "T9", title: "x", project: null, deadline: null, priority: null }]}
      />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

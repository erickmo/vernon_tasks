import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SprintCommitmentCard } from "./SprintCommitmentCard";
import type { MeSprint } from "../../../../api/dashboard";

const base: MeSprint = {
  name: "Sprint 5",
  start_date: "2026-05-01",
  end_date: "2026-05-14",
  committed_points: 20,
  done_points: 8,
  progress_pct: 40,
  risk: "on_track",
};

describe("SprintCommitmentCard", () => {
  it("renders sprint name and points", () => {
    render(<SprintCommitmentCard sprint={base} />);
    expect(screen.getByText("Sprint 5")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("40%")).toBeInTheDocument();
  });

  it("clamps progress to 0% when negative", () => {
    const { container } = render(
      <SprintCommitmentCard sprint={{ ...base, progress_pct: -10 }} />,
    );
    expect(screen.getByText("0%")).toBeInTheDocument();
    const bar = container.querySelector('div[style*="width: 0%"]');
    expect(bar).not.toBeNull();
  });

  it("clamps progress to 100% when overflows", () => {
    const { container } = render(
      <SprintCommitmentCard sprint={{ ...base, progress_pct: 150 }} />,
    );
    expect(screen.getByText("100%")).toBeInTheDocument();
    const bar = container.querySelector('div[style*="width: 100%"]');
    expect(bar).not.toBeNull();
  });

  it("shows risk badge label from RISK_META", () => {
    render(<SprintCommitmentCard sprint={{ ...base, risk: "behind" }} />);
    expect(screen.getByText("Behind")).toBeInTheDocument();
  });
});

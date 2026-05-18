import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SummaryBar } from "./SummaryBar";

describe("SummaryBar", () => {
  it("renders all 5 stats for leader role", () => {
    render(
      <SummaryBar
        summary={{ team_blocked: 2, unassigned_tasks: 3, okr_progress: 73, my_overdue: 5, sprint_days_remaining: 3 }}
        isLeader
      />
    );
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getAllByText("3").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("hides team stats for non-leader", () => {
    render(
      <SummaryBar
        summary={{ team_blocked: 0, unassigned_tasks: 0, okr_progress: 73, my_overdue: 5, sprint_days_remaining: 3 }}
        isLeader={false}
      />
    );
    expect(screen.queryByText("Team Blocked")).not.toBeInTheDocument();
    expect(screen.queryByText("Unassigned")).not.toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { WorkloadChips } from "./WorkloadChips";

describe("WorkloadChips", () => {
  it("renders three chips with labels", () => {
    render(<WorkloadChips workload={{ open: 5, overdue: 2, due_soon: 1 }} />);
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("Overdue")).toBeInTheDocument();
    expect(screen.getByText("Due ≤ 3d")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("renders zero values when workload is empty", () => {
    render(<WorkloadChips workload={{ open: 0, overdue: 0, due_soon: 0 }} />);
    expect(screen.getAllByText("0")).toHaveLength(3);
  });
});

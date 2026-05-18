import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { RiskMatrix } from "./RiskMatrix";
import type { RiskProject } from "../api/types";

const ALL_NONE: RiskProject[] = [
  { project: "P1", project_title: "Alpha", max_level: "none",
    flags: [{ type: "overdue_tasks", level: "none" }] },
];

const WITH_RISKS: RiskProject[] = [
  { project: "P1", project_title: "Alpha", max_level: "high",
    flags: [
      { type: "overdue_tasks", level: "high", count: 5 },
      { type: "velocity_drop", level: "medium", delta_pct: -18 },
    ] },
];

describe("RiskMatrix", () => {
  it("shows EmptyState when all risks are none", () => {
    render(createElement(RiskMatrix, { risks: ALL_NONE }));
    expect(screen.getByText(/no risks flagged/i)).not.toBeNull();
  });

  it("renders risk project row when risks present", () => {
    render(createElement(RiskMatrix, { risks: WITH_RISKS }));
    expect(screen.getByText("Alpha")).not.toBeNull();
  });

  it("high risk flag cell has aria-label", () => {
    render(createElement(RiskMatrix, { risks: WITH_RISKS }));
    const highCell = screen.getByLabelText(/severity: high/i);
    expect(highCell).not.toBeNull();
  });
});

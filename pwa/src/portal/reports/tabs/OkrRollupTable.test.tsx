import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { OkrRollupTable } from "./OkrRollupTable";
import type { OkrRollupRow, OkrRollupTotals } from "../api/types";

const MOCK_ROWS: OkrRollupRow[] = [
  { project: "PROJ-00001", project_title: "Alpha", objective_count: 3,
    kr_count: 9, avg_progress: 0.65, on_track: 2, at_risk: 1, behind: 0 },
];
const MOCK_TOTALS: OkrRollupTotals = {
  objective_count: 3, kr_count: 9, avg_progress: 0.65,
  on_track: 2, at_risk: 1, behind: 0,
};

describe("OkrRollupTable", () => {
  it("renders project row", () => {
    render(createElement(OkrRollupTable, { rows: MOCK_ROWS, totals: MOCK_TOTALS }));
    expect(screen.getByText("Alpha")).not.toBeNull();
  });

  it("renders EmptyState when rows is empty", () => {
    render(createElement(OkrRollupTable, {
      rows: [],
      totals: { objective_count: 0, kr_count: 0, avg_progress: 0,
                on_track: 0, at_risk: 0, behind: 0 },
    }));
    expect(screen.getByText(/no okr data/i)).not.toBeNull();
  });
});

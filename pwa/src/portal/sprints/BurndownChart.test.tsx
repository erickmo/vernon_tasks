import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { BurndownChart } from "./BurndownChart";
import type { BurndownSeries } from "./api/types";

const series: BurndownSeries = {
  sprint: "SP-1", start_date: "2026-05-01", end_date: "2026-05-07", total_hours: 12,
  series: [
    { date: "2026-05-01", remaining: 12, ideal: 12 },
    { date: "2026-05-02", remaining: 10, ideal: 10 },
    { date: "2026-05-03", remaining: 8, ideal: 8 },
  ],
};

describe("BurndownChart", () => {
  it("matches snapshot for fixed series", () => {
    const { container } = render(<BurndownChart data={series} />);
    expect(container.querySelector("svg")).toMatchSnapshot();
  });
});

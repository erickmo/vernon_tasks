import { describe, it, expect, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { KpiTrendChart } from "./KpiTrendChart";

vi.mock("recharts", () => ({
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ReferenceLine: () => null,
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
}));

describe("KpiTrendChart", () => {
  it("renders without crashing with empty series", async () => {
    const { findByTestId } = render(<KpiTrendChart series={[]} unit="pts" />);
    await waitFor(() => findByTestId("line-chart"), { timeout: 3000 });
    const el = await findByTestId("line-chart");
    expect(el).toBeDefined();
  });

  it("renders with trend data points", async () => {
    const series = [
      { label: "2026-01", value: 80, target: 75 },
      { label: "2026-02", value: 90, target: 75 },
    ];
    const { findByTestId } = render(<KpiTrendChart series={series} unit="pts/sprint" />);
    const el = await findByTestId("line-chart");
    expect(el).toBeDefined();
  });
});

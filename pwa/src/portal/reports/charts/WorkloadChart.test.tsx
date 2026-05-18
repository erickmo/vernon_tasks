import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { WorkloadChart } from "./WorkloadChart";

vi.mock("recharts", () => ({
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Legend: () => null,
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
}));

describe("WorkloadChart", () => {
  it("renders without crashing with empty members", async () => {
    const { findByTestId } = render(<WorkloadChart members={[]} />);
    const el = await findByTestId("bar-chart");
    expect(el).toBeDefined();
  });

  it("renders with member workload data", async () => {
    const members = [
      {
        user: "user@example.com",
        full_name: "Alice",
        open_tasks: 5,
        overdue_tasks: 2,
        open_hours: 12.5,
        overdue_hours: 4.0,
        projects: ["PROJ-00001"],
      },
    ];
    const { findByTestId } = render(<WorkloadChart members={members} />);
    const el = await findByTestId("bar-chart");
    expect(el).toBeDefined();
  });
});

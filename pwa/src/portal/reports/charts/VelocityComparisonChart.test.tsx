import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { VelocityComparisonChart } from "./VelocityComparisonChart";

vi.mock("recharts", () => ({
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Legend: () => null,
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
}));

describe("VelocityComparisonChart", () => {
  it("renders without crashing with empty projects", async () => {
    const { findByTestId } = render(<VelocityComparisonChart projects={[]} />);
    const el = await findByTestId("bar-chart");
    expect(el).toBeDefined();
  });

  it("renders with sample project data", async () => {
    const projects = [
      {
        project: "PROJ-00001",
        project_title: "Alpha",
        avg_velocity: 42,
        trend: "up" as const,
        sprints: [
          { sprint_label: "S-2026-W14", velocity: 40 },
          { sprint_label: "S-2026-W15", velocity: 44 },
        ],
      },
    ];
    const { findByTestId } = render(<VelocityComparisonChart projects={projects} />);
    const el = await findByTestId("bar-chart");
    expect(el).toBeDefined();
  });
});

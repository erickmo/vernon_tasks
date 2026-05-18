import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { CompletionRingChart } from "./CompletionRingChart";

vi.mock("recharts", () => ({
  RadialBarChart: ({ children }: any) => <div data-testid="radial-bar-chart">{children}</div>,
  RadialBar: () => null,
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
}));

describe("CompletionRingChart", () => {
  it("renders without crashing with empty rows", async () => {
    const { findByTestId } = render(<CompletionRingChart rows={[]} />);
    const el = await findByTestId("radial-bar-chart");
    expect(el).toBeDefined();
  });

  it("renders with leaderboard rows", async () => {
    const rows = [
      {
        rank: 1,
        user: "user@example.com",
        full_name: "Alice",
        tasks_completed: 10,
        points: 100,
        streak_days: 5,
        avg_quality: 4.5,
      },
    ];
    const { findByTestId } = render(<CompletionRingChart rows={rows} />);
    const el = await findByTestId("radial-bar-chart");
    expect(el).toBeDefined();
  });
});

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { LeaderboardTable } from "./LeaderboardTable";
import type { LeaderboardRow } from "../api/types";

const ROWS: LeaderboardRow[] = [
  { rank: 1, user: "alice@x.com", full_name: "Alice", points: 420,
    tasks_completed: 18, streak_days: 12, avg_quality: 4.2 },
  { rank: 2, user: "bob@x.com",   full_name: "Bob",   points: 380,
    tasks_completed: 15, streak_days: 8,  avg_quality: 3.9 },
];

describe("LeaderboardTable", () => {
  it("renders member name", () => {
    render(createElement(LeaderboardTable, { rows: ROWS }));
    expect(screen.getByText("Alice")).not.toBeNull();
  });

  it("rank 1 row has gold medal class", () => {
    const { container } = render(createElement(LeaderboardTable, { rows: ROWS }));
    expect(container.querySelector(".medal--gold")).not.toBeNull();
  });

  it("sortable column click changes sort order", () => {
    render(createElement(LeaderboardTable, { rows: ROWS }));
    const sortBtn = screen.getAllByRole("button")[0];
    fireEvent.click(sortBtn);
    // After toggling ascending, Bob (380) should precede Alice (420)
    const cells = screen.getAllByRole("cell");
    const names = cells
      .map((c) => c.textContent)
      .filter((t) => t === "Alice" || t === "Bob");
    expect(names[0]).toBe("Bob");
  });
});
